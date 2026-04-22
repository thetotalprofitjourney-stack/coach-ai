import type { MessageCreateParamsNonStreaming, TextBlock } from '@anthropic-ai/sdk/resources/messages';
import { anthropic } from '@/lib/anthropic/client';
import { MODELS } from '@/lib/anthropic/models';
import { FASE2_COACH_SYSTEM_PROMPT } from '@/lib/anthropic/prompts/fase2-coach';
import { renderDynamicState, renderHandoffBlock } from '@/lib/fase2/render-state';
import type { RunState } from '@/lib/fase2/types';

// Últimos N pares coach+user a enviar en messages. Lo anterior vive en el
// resumen estructurado dentro del estado dinámico (§4.4).
const MAX_HISTORY_PAIRS = 4;

// Extended thinking del Opus 4.7: mejora el rol no-directivo y la detección
// de incoherencias. max_tokens debe cubrir budget_tokens + respuesta visible.
const THINKING_BUDGET_TOKENS = 10_000;
const MAX_TOKENS = 12_000;

export interface CoachUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface CoachResult {
  text: string;
  model: string;
  usage: CoachUsage;
  latencyMs: number;
}

// Construye los tres bloques del system (prompt estable + hand-off estable +
// estado dinámico) y pide al coach su turno. Usa los dos primeros bloques
// como entradas cacheables con cache_control: ephemeral para que a partir de
// la segunda llamada del run el coste de contexto caiga drásticamente.
export async function callCoach(state: RunState): Promise<CoachResult> {
  const startedAt = Date.now();

  const response = await anthropic.messages.create(buildRequestParams(state));

  const latencyMs = Date.now() - startedAt;

  const text = response.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return {
    text,
    model: MODELS.coachFase2,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    latencyMs,
  };
}

// Variante streaming: emite cada text delta vía `onDelta` según llega el
// turno del coach. Los bloques de thinking no se emiten (el SDK solo dispara
// el evento `text` para bloques de texto visible). Cuando el stream termina,
// devuelve el CoachResult completo con el texto final y el usage oficial del
// mensaje, de modo que la persistencia y las métricas funcionan igual que
// en la variante no-streaming.
export async function callCoachStream(
  state: RunState,
  onDelta: (delta: string) => void,
): Promise<CoachResult> {
  const startedAt = Date.now();

  const stream = anthropic.messages.stream(buildRequestParams(state));
  stream.on('text', (delta) => {
    onDelta(delta);
  });

  const final = await stream.finalMessage();
  const latencyMs = Date.now() - startedAt;

  const text = final.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  return {
    text,
    model: MODELS.coachFase2,
    usage: {
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      cacheCreationInputTokens: final.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: final.usage.cache_read_input_tokens ?? 0,
    },
    latencyMs,
  };
}

function buildRequestParams(state: RunState): MessageCreateParamsNonStreaming {
  return {
    model: MODELS.coachFase2,
    max_tokens: MAX_TOKENS,
    thinking: {
      type: 'enabled',
      budget_tokens: THINKING_BUDGET_TOKENS,
    },
    system: [
      {
        type: 'text',
        text: FASE2_COACH_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: renderHandoffBlock(state.handoff),
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: renderDynamicState(state),
      },
    ],
    messages: buildMessages(state),
  };
}

function buildMessages(
  state: RunState,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const recent = state.turns.slice(-MAX_HISTORY_PAIRS * 2);
  const messages = recent.map((t) => ({
    role: (t.role === 'coach' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: t.content,
  }));

  // Anthropic exige que el último mensaje sea role=user. En la apertura de
  // la sesión (historial vacío) enviamos un bootstrap mínimo; el prompt ya
  // incluye la sección "Inicio de sesión" con el protocolo exacto.
  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hola.' });
  }

  return messages;
}
