import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';
import bancoItemsDisc from '@/data/banco-items-disc.json';
import { anthropic } from './client';
import { resolveModel, type ModelAlias } from './models';

// System prompt estable del endpoint de ping. Tres piezas concatenadas una
// vez al cargar el módulo:
//
//   1. Header descriptivo (estable).
//   2. Banco DISC serializado (fijo — §5.1 del doc exige tratarlo como
//      asset estático e inmutable).
//   3. Suffix con instrucciones de verificación de caching (estable).
//
// Requisitos del prefijo cacheable (ver skill `claude-api`,
// `shared/prompt-caching.md`):
//
//   - Bytes estrictamente deterministas → sin Date.now(), UUID, ni claves
//     de objeto iteradas en orden no determinista. Usamos JSON.stringify con
//     un array ya ordenado en origen.
//   - >= umbral mínimo para Opus y Haiku (4096 tokens). El banco ronda los
//     15 KB y header + suffix aportan el resto para superar el umbral con
//     margen cómodo.
//
// En producción el operador verificará que la segunda llamada devuelva
// `usage.cache_read_input_tokens > 0`. Ver README.md → "Paso 4 — smoke test".

const PING_HEADER = `Eres un asistente de verificación del pipeline de Coach AI.

Este system prompt es un stub de validación del Paso 4 (integración con el SDK
de Anthropic y prompt caching). No forma parte de la experiencia de usuario
final: se reemplazará por los prompts reales de las Fases 1 y 2 en los Pasos
5 y 6. A continuación aparece el banco de 16 ítems DISC que la Fase 1 usará
más adelante; lo incluimos aquí solo para dar al prompt el tamaño suficiente
que permita validar que el caching de Anthropic (cache_control: ephemeral)
funciona extremo a extremo.

El asistente debe responder de forma breve y neutra a la pregunta del
usuario, sin pretender interpretar los ítems DISC ni redactar un hand-off.
La llamada real al administrador DISC llegará con su propio system prompt
(§5.1 del documento de proyecto) en el Paso 6.

--- Banco de ítems DISC (recurso estático, no modificar aquí) ---`;

const PING_SUFFIX = `--- Fin del banco DISC ---

Instrucciones de comportamiento para este stub:

1. Si el usuario envía "ping" o una frase corta similar, responde con una
   confirmación breve (ej. "pong" o "stub operativo") y nada más.
2. Si el usuario envía una pregunta sobre el proyecto, responde con una
   frase concisa indicando que este endpoint es solo para validación técnica
   y que los prompts reales vendrán en pasos posteriores.
3. No inventes datos del usuario. No prometas funcionalidades. No generes
   texto largo — este endpoint solo existe para validar que la llamada al
   SDK y el caching funcionan, no para producir contenido útil.
4. No menciones la clave de API, el nombre del operador, ni detalles de la
   infraestructura.

Recuerda: la estabilidad byte-a-byte de este system prompt es lo que permite
que la caché de Anthropic acierte en llamadas repetidas. Cualquier
interpolación dinámica aquí romperá el caching.`;

export const PING_SYSTEM_PROMPT = [
  PING_HEADER,
  JSON.stringify(bancoItemsDisc, null, 2),
  PING_SUFFIX,
].join('\n\n');

export interface PingUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface PingResult {
  text: string;
  model: string;
  usage: PingUsage;
  latencyMs: number;
}

export async function runAnthropicPing(params: {
  model: ModelAlias;
  userPrompt: string;
}): Promise<PingResult> {
  const model = resolveModel(params.model);
  const startedAt = Date.now();

  const response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: PING_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: params.userPrompt }],
  });

  const latencyMs = Date.now() - startedAt;

  // content es ContentBlock[] (discriminated union); concatenamos los text
  // blocks. En este stub no esperamos thinking ni tool_use, pero nos
  // protegemos con el narrow por .type.
  const text = response.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    text,
    model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    latencyMs,
  };
}
