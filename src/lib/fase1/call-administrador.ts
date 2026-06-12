import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { anthropic } from '@/lib/anthropic/client';
import { MODELS } from '@/lib/anthropic/models';
import { getFase1AdministradorSystemPrompt } from '@/lib/anthropic/prompts/fase1-administrador';
import { BANCO_ITEMS_TEXT, formatItemForPrompt, getItemByIndex } from './banco';
import type { Fase1RunState } from './types';

// Haiku 4.5, sin thinking (el administrador es mecánico). max_tokens
// razonable para un mensaje de presentación de ítem (escenario + 4
// opciones + acuse breve).
const MAX_TOKENS = 800;

// Últimos pares admin+user a enviar. Los anteriores no aportan — el
// flujo es lineal y el modelo no necesita memoria larga.
const MAX_HISTORY_PAIRS = 2;

export type AdminDirective = 'presentar' | 'repreguntar' | 'despedir';

export interface AdminUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface AdminResult {
  text: string;
  model: string;
  usage: AdminUsage;
  latencyMs: number;
}

export interface CallAdministradorInput {
  state: Fase1RunState;
  directive: AdminDirective;
  // El mensaje del usuario que acaba de llegar (vacío si es la apertura).
  lastUserMessage: string;
}

// Llama al administrador (Haiku) con dos bloques de system cacheables:
// el prompt estable y el banco en texto. El mensaje dinámico del user
// trae la directiva, el ítem actual formateado, historial reducido y el
// mensaje literal del usuario.
export async function callAdministrador(
  input: CallAdministradorInput,
): Promise<AdminResult> {
  const startedAt = Date.now();

  const response = await anthropic.messages.create({
    model: MODELS.adminFase1,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: getFase1AdministradorSystemPrompt(),
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `BANCO DE ÍTEMS (referencia cacheada):\n${BANCO_ITEMS_TEXT}`,
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

  const text = response.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return {
    text,
    model: MODELS.adminFase1,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    latencyMs,
  };
}

function buildUserMessage(input: CallAdministradorInput): string {
  const { state, directive, lastUserMessage } = input;

  // Ítem a exhibir: el currentItemIndex para presentar/repreguntar; en
  // despedida reutilizamos el último (ítem 16, index 15) como referencia.
  const itemIndex =
    directive === 'despedir'
      ? Math.min(state.currentItemIndex, 15)
      : state.currentItemIndex;
  const item = getItemByIndex(itemIndex);

  const recent = state.turns.slice(-MAX_HISTORY_PAIRS * 2);
  const historial =
    recent.length === 0
      ? '(ninguno)'
      : recent
          .map(
            (t) =>
              `${t.role === 'admin' ? 'Administrador' : 'Usuario'}: ${t.content}`,
          )
          .join('\n');

  return [
    `DIRECTIVA: ${directive}`,
    `ÍTEM ACTUAL:\n${formatItemForPrompt(item)}`,
    `HISTORIAL RECIENTE:\n${historial}`,
    `MENSAJE DEL USUARIO: ${lastUserMessage.length > 0 ? lastUserMessage : '(inicio)'}`,
  ].join('\n\n');
}
