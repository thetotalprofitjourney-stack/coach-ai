import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { anthropic } from '@/lib/anthropic/client';
import { MODELS } from '@/lib/anthropic/models';
import { PREVIEW_COACH_SYSTEM_PROMPT } from '@/lib/anthropic/prompts/preview-coach';

// Coach comprimido para /preview. Haiku 4.5, sin thinking, max_tokens 400.
// El prompt completo está en preview-coach.ts y limita estrictamente el
// número y forma de los turnos.

export const PREVIEW_MAX_TURNS = 3;

const MAX_TOKENS = 400;

export interface PreviewUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface PreviewCoachResult {
  text: string;
  model: string;
  usage: PreviewUsage;
  latencyMs: number;
}

export interface PreviewTurn {
  role: 'coach' | 'user';
  content: string;
  turnNumber: number;
}

export interface CallPreviewCoachInput {
  // Historial completo del intercambio hasta aquí (sin el mensaje nuevo
  // del usuario si es la apertura).
  history: PreviewTurn[];
  // Turno que el coach va a producir (1, 2 o 3). El prompt ajusta el
  // comportamiento según el turno: apertura / profundización / cierre.
  coachTurnNumber: 1 | 2 | 3;
  // Último mensaje del usuario. Vacío sólo en la apertura (coachTurnNumber=1).
  lastUserMessage: string;
}

export async function callPreviewCoach(
  input: CallPreviewCoachInput,
): Promise<PreviewCoachResult> {
  const startedAt = Date.now();

  const response = await anthropic.messages.create({
    model: MODELS.adminFase1, // haiku-4-5
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: PREVIEW_COACH_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: buildMessages(input),
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

// Mapea el historial a los roles que exige Anthropic y añade un encabezado
// con TURNO_ACTUAL para que el prompt ramifique en el turno correcto. El
// último mensaje debe ser role=user; si la apertura aún no tiene input del
// visitante (coachTurnNumber=1), inyectamos un bootstrap mínimo.
function buildMessages(
  input: CallPreviewCoachInput,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages = input.history.map((t) => ({
    role: (t.role === 'coach' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: t.content,
  }));

  const header = `TURNO_ACTUAL=${input.coachTurnNumber}`;
  const userContent = input.lastUserMessage
    ? `${header}\n\n${input.lastUserMessage}`
    : `${header}\n\n(Inicio de la demo — el visitante aún no ha escrito nada. Abre con la pauta del turno 1.)`;

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    messages.push({ role: 'user', content: userContent });
  } else {
    // Reemplaza el último mensaje de user por su versión con encabezado.
    messages[messages.length - 1] = { role: 'user', content: userContent };
  }

  return messages;
}
