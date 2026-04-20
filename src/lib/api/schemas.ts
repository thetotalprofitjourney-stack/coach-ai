import { z } from 'zod';

// Schemas Zod compartidos entre rutas API y (más adelante) frontend.
// Única fuente de verdad para el contrato HTTP.

// POST /api/session/create ---------------------------------------------------

export const createSessionResponseSchema = z.object({
  token: z.string().uuid(),
  url: z.string().url(),
});
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

// POST /api/session/{token}/form ---------------------------------------------

// Límites defensivos. La spec (§2.3) no fija longitudes, pero conviene
// rechazar inputs absurdos (10 MB de trigger, edad negativa, etc.) antes de
// llegar a la BD o al prompt de la IA.
export const formPayloadSchema = z.object({
  name: z.string().trim().min(1).max(80),
  age: z.number().int().min(14).max(120),
  familyContext: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(100),
  professionalMoment: z.string().trim().min(1).max(200),
  trigger: z.string().trim().min(10).max(2000),
});
export type FormPayload = z.infer<typeof formPayloadSchema>;

export const formResponseSchema = z.object({
  ok: z.literal(true),
  status: z.literal('phase1_in_progress'),
});
export type FormResponse = z.infer<typeof formResponseSchema>;

// Validación del token en path params.
export const sessionTokenSchema = z.string().uuid();

// POST /api/dev/anthropic-ping ----------------------------------------------

// Endpoint interno del Paso 4: llamada básica al SDK de Anthropic con prompt
// caching activado. Lo invoca el operador manualmente para verificar
// credenciales, caching y latencia. Ver docs/proyecto-completo.md §7.1.
export const pingRequestSchema = z.object({
  model: z.enum(['opus', 'sonnet', 'haiku']).default('opus'),
  userPrompt: z.string().trim().min(1).max(500).default('ping'),
});
export type PingRequest = z.infer<typeof pingRequestSchema>;

export const pingResponseSchema = z.object({
  model: z.string(),
  text: z.string(),
  latencyMs: z.number().int().nonnegative(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheCreationInputTokens: z.number().int().nonnegative(),
    cacheReadInputTokens: z.number().int().nonnegative(),
  }),
});
export type PingResponse = z.infer<typeof pingResponseSchema>;
