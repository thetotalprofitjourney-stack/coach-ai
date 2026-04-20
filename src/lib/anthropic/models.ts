// Modelos de Anthropic por rol de IA. Ver docs/proyecto-completo.md §4:
// - coachFase2: pieza central del producto, exige la máxima capacidad.
// - sintesisHandoff: interpretación cruzada del DISC → hand-off estructurado.
// - adminFase1: flujo conversacional scripted del DISC (latencia/coste bajos).
// - auxiliar: actualización de resumen + detección de hipótesis (latencia baja).
//
// Las constantes se consumen desde los módulos de cada IA (se crearán en los
// Pasos 5/6). En el Paso 4 solo las usa el endpoint de ping para validar que
// los tres modelos responden y cachean.

export const MODELS = {
  coachFase2: 'claude-opus-4-7',
  sintesisHandoff: 'claude-sonnet-4-6',
  adminFase1: 'claude-haiku-4-5',
  auxiliar: 'claude-haiku-4-5',
} as const;

export type ModelAlias = 'opus' | 'sonnet' | 'haiku';

export function resolveModel(alias: ModelAlias): string {
  switch (alias) {
    case 'opus':
      return MODELS.coachFase2;
    case 'sonnet':
      return MODELS.sintesisHandoff;
    case 'haiku':
      return MODELS.adminFase1;
  }
}
