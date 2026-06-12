import type { TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { anthropic } from '@/lib/anthropic/client';
import { MODELS } from '@/lib/anthropic/models';
import {
  AuxiliarOutputSchema,
  getFase2AuxiliarSystemPrompt,
  type AuxiliarOutput,
} from '@/lib/anthropic/prompts/fase2-auxiliar';
import type { RunState } from '@/lib/fase2/types';

const MAX_TOKENS = 2048;

export interface AuxiliarUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface AuxiliarResult {
  output: AuxiliarOutput;
  model: string;
  usage: AuxiliarUsage;
  latencyMs: number;
}

// Corre la IA auxiliar (Haiku 4.5) con el último par coach+user. Devuelve
// el JSON validado con AuxiliarOutputSchema. El caller aplica el resultado
// al store con applyAuxiliarOutput.
export async function callAuxiliar(state: RunState): Promise<AuxiliarResult> {
  const lastPair = takeLastPair(state);
  const startedAt = Date.now();

  const response = await anthropic.messages.create({
    model: MODELS.auxiliar,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: getFase2AuxiliarSystemPrompt(),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: buildAuxiliarUserMessage(state, lastPair),
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
  const output = AuxiliarOutputSchema.parse(parsed);

  return {
    output,
    model: MODELS.auxiliar,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    latencyMs,
  };
}

function buildAuxiliarUserMessage(
  state: RunState,
  pair: { coach: string; user: string },
): string {
  const detectedTerms = [
    ...state.subjectiveTermsPending,
    ...state.subjectiveTermsResolved,
  ];
  return [
    'HAND-OFF DEL USUARIO:',
    JSON.stringify(state.handoff, null, 2),
    '',
    'RESUMEN ESTRUCTURADO ACTUAL:',
    state.runningSummary.length > 0
      ? state.runningSummary
      : '(vacío — primera actualización del run)',
    '',
    'ÚLTIMO PAR DE TURNOS:',
    `Coach (turno ${state.coachTurnNumber}): ${pair.coach}`,
    `Usuario: ${pair.user}`,
    '',
    `HIPÓTESIS PENDIENTES (ids): ${
      state.hypothesesPending.length === 0
        ? '(ninguna)'
        : state.hypothesesPending.join(', ')
    }`,
    `TÉRMINOS SUBJETIVOS YA DETECTADOS: ${
      detectedTerms.length === 0 ? '(ninguno)' : detectedTerms.join(', ')
    }`,
    '',
    'Devuelve ahora el objeto JSON actualizado.',
  ].join('\n');
}

function takeLastPair(state: RunState): { coach: string; user: string } {
  const reversed = [...state.turns].reverse();
  const userTurn = reversed.find((t) => t.role === 'user');
  const coachTurn = userTurn
    ? reversed.find(
        (t) => t.role === 'coach' && t.turnNumber === userTurn.turnNumber,
      )
    : undefined;
  return {
    coach: coachTurn?.content ?? '',
    user: userTurn?.content ?? '',
  };
}

// Extrae el primer objeto JSON balanceado {…} del texto. El prompt exige que
// la respuesta empiece con `{` y termine con `}`, pero nos protegemos frente
// a adornos accidentales (markdown fences, prefijos, etc.).
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `auxiliar: respuesta sin objeto JSON detectable: ${text.slice(0, 200)}`,
    );
  }
  return text.slice(start, end + 1);
}
