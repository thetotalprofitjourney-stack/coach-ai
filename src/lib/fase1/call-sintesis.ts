import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { anthropic } from '@/lib/anthropic/client';
import { MODELS } from '@/lib/anthropic/models';
import {
  getFase1SintesisSystemPrompt,
  HandoffSchema,
} from '@/lib/anthropic/prompts/fase1-sintesis';
import type { Handoff } from '@/lib/fase2/types';
import { BANCO_ITEMS_TEXT } from './banco';
import type { Fase1Answer, Fase1FormularioInicial } from './types';

// Sonnet 4.6 con extended thinking moderado: la síntesis requiere
// interpretación cruzada (DISC + formulario + freeText) y los hand-offs
// piloto muestran hipótesis no triviales. max_tokens debe cubrir
// thinking + el JSON final (el hand-off ronda 1.5-3k tokens).
const THINKING_BUDGET_TOKENS = 5_000;
const MAX_TOKENS = 12_000;

export interface SintesisUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface SintesisResult {
  handoff: Handoff;
  model: string;
  usage: SintesisUsage;
  latencyMs: number;
  rawText: string;
}

export interface CallSintesisInput {
  formulario: Fase1FormularioInicial;
  answers: Fase1Answer[];
}

// Única llamada de síntesis al cierre del run. Recibe formulario y las
// 16 respuestas ya parseadas (letra + factor + freeText). Devuelve el
// hand-off validado contra HandoffSchema.
export async function callSintesis(
  input: CallSintesisInput,
): Promise<SintesisResult> {
  const startedAt = Date.now();

  const response = await anthropic.messages.create({
    model: MODELS.sintesisHandoff,
    max_tokens: MAX_TOKENS,
    thinking: {
      type: 'enabled',
      budget_tokens: THINKING_BUDGET_TOKENS,
    },
    system: [
      {
        type: 'text',
        text: `${getFase1SintesisSystemPrompt()}\n\nBANCO DE ÍTEMS (referencia cacheada):\n${BANCO_ITEMS_TEXT}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: buildUserMessage(input),
      },
    ],
  });

  const latencyMs = Date.now() - startedAt;

  const rawText = response.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  const jsonText = extractJsonObject(rawText);
  const parsed = JSON.parse(jsonText) as unknown;
  const handoff = HandoffSchema.parse(parsed) as Handoff;

  return {
    handoff,
    model: MODELS.sintesisHandoff,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    latencyMs,
    rawText,
  };
}

function buildUserMessage(input: CallSintesisInput): string {
  const { formulario, answers } = input;
  const answersPayload = answers.map((a) => ({
    item_id: a.itemId,
    letra_elegida: a.chosenLetter,
    factor_disc: a.chosenFactor,
    texto_libre: a.freeText,
  }));

  return [
    'FORMULARIO INICIAL DEL USUARIO:',
    JSON.stringify(formulario, null, 2),
    '',
    'RESPUESTAS A LOS 16 ÍTEMS DISC:',
    JSON.stringify(answersPayload, null, 2),
    '',
    'Produce ahora el objeto JSON del hand-off siguiendo las reglas del prompt. Empieza con `{` y termina con `}`, sin texto alrededor.',
  ].join('\n');
}

// Mismo helper que el de fase2-auxiliar: extrae el primer objeto JSON
// balanceado del texto. Defensivo contra markdown fences o prefijos.
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `fase1 sintesis: respuesta sin objeto JSON detectable: ${text.slice(
        0,
        200,
      )}`,
    );
  }
  return text.slice(start, end + 1);
}
