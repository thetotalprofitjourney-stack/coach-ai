// Tarifas de Anthropic y cálculo de coste en USD por llamada (§7.3,
// Paso 15). Hardcoded deliberadamente: los precios cambian pocas veces
// al año y actualizarlos en código da al operador un review explícito
// en lugar de enterrarlos en .env.production. Redeploy basta.
//
// Cuando Anthropic publique nuevos precios:
//   1. Editar el objeto PRICING con los nuevos valores.
//   2. Actualizar el comentario de fecha ("consultado YYYY-MM-DD").
//   3. Dejar nota en docs/paso-15-coste-api.md §Tarifas.
//   4. PR + merge + redeploy. No requiere migración.
//
// Fuente: console.anthropic.com/pricing, consultado 2026-04-21.
//
// Unidades en el objeto PRICING: USD por Millón de tokens (MTok). La
// función calculateCostUsd multiplica por tokens/1_000_000.
//
// Factura:
//   - `input`              → response.usage.input_tokens (uncached).
//   - `cacheWrite`         → response.usage.cache_creation_input_tokens.
//   - `cacheRead`          → response.usage.cache_read_input_tokens.
//   - `output`             → response.usage.output_tokens. Extended
//                            thinking se factura como output (verificado
//                            en la doc de Anthropic; si cambia, ajustar).
//
// Los identificadores de `PRICING` son etiquetas normalizadas cortas
// (sin el prefijo `claude-`) para desacoplar el pricing del nombre
// concreto que devuelve el SDK. El normalizador vive aquí y en
// src/lib/anthropic/models.ts lo enlaza con las constantes MODELS.

export const PRICING_SOURCE_DATE = '2026-04-21';

interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export type PricedModelLabel = 'haiku-4-5' | 'sonnet-4-6' | 'opus-4-7';

export const PRICING: Record<PricedModelLabel, ModelPrice> = {
  // Haiku 4.5 — el más barato, usado por el administrador de Fase 1 y
  // la auxiliar de Fase 2.
  'haiku-4-5': {
    input: 1, // $/MTok
    output: 5, // $/MTok
    cacheWrite: 1.25, // $/MTok (cache_creation_input_tokens)
    cacheRead: 0.1, // $/MTok (cache_read_input_tokens)
  },
  // Sonnet 4.6 — síntesis del hand-off (§5.1.3). Calidad intermedia.
  'sonnet-4-6': {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  // Opus 4.7 — coach de Fase 2 (§5.2), pieza crítica del producto.
  'opus-4-7': {
    input: 15,
    output: 75,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
};

export interface LlmUsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

// Normaliza el string que devuelve el SDK ("claude-opus-4-7",
// "claude-haiku-4-5", "claude-sonnet-4-6") a la etiqueta corta que
// usan `PRICING` y la tabla `llm_calls`. Tolera que Anthropic añada
// sufijos de versión manteniendo la familia.
//
// Desconocido → devuelve el input tal cual. El caller lo persistirá así
// en `llm_calls` y `calculateCostUsd` devolverá 0 con warning.
export function normalizeModelLabel(sdkModel: string): string {
  if (sdkModel.includes('opus-4-7')) return 'opus-4-7';
  if (sdkModel.includes('sonnet-4-6')) return 'sonnet-4-6';
  if (sdkModel.includes('haiku-4-5')) return 'haiku-4-5';
  return sdkModel;
}

// Coste en USD de una llamada. Si el modelo no está en la tabla,
// emite console.warn y devuelve 0. Nunca lanza — las rutas no deben
// caer por un problema de métricas.
export function calculateCostUsd(
  modelLabel: string,
  usage: LlmUsageTokens,
): number {
  const price = PRICING[modelLabel as PricedModelLabel];
  if (!price) {
    console.warn(
      JSON.stringify({
        event: 'pricing_unknown_model',
        timestamp: new Date().toISOString(),
        model: modelLabel,
      }),
    );
    return 0;
  }
  const perMTok = 1_000_000;
  return (
    (usage.inputTokens * price.input) / perMTok +
    (usage.outputTokens * price.output) / perMTok +
    (usage.cacheCreationInputTokens * price.cacheWrite) / perMTok +
    (usage.cacheReadInputTokens * price.cacheRead) / perMTok
  );
}
