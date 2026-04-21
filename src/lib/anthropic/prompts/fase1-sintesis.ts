import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// Carga el prompt de síntesis del hand-off desde
// docs/prompt-fase1-sintesis.md a module-load. Mismo patrón que los
// otros loaders: recorta desde "## Rol" hasta el final y devuelve una
// cadena byte-estable para prompt caching.
function loadFase1SintesisSystemPrompt(): string {
  const promptPath = join(process.cwd(), 'docs', 'prompt-fase1-sintesis.md');
  const md = readFileSync(promptPath, 'utf8');
  const marker = '## Rol';
  const start = md.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `fase1-sintesis: no se encontró el marcador "${marker}" en ${promptPath}.`,
    );
  }
  return md.slice(start);
}

export const FASE1_SINTESIS_SYSTEM_PROMPT = loadFase1SintesisSystemPrompt();

// Schema del hand-off que debe producir la síntesis. Es la forma exacta
// del tipo Handoff de src/lib/fase2/types.ts, con restricciones
// operativas añadidas (longitudes mínimas, rangos DISC 0-100, 3 hipótesis
// con ids H1/H2/H3, entre 3 y 6 términos subjetivos).
//
// No usamos .strict() para no rechazar runs si el modelo añade un campo
// extra inofensivo, pero sí validamos tipo y contenido de cada campo
// obligatorio.
export const HandoffSchema = z.object({
  contexto_personal: z.object({
    nombre: z.string().min(1),
    edad: z.number().int().nonnegative(),
    estado_civil_y_familia: z.string().min(1),
    zona_geografica: z.string().min(1),
    momento_profesional: z.string().min(1),
  }),
  perfil_disc: z.object({
    puntuaciones: z.object({
      D: z.number().int().min(0).max(100),
      I: z.number().int().min(0).max(100),
      S: z.number().int().min(0).max(100),
      C: z.number().int().min(0).max(100),
    }),
    lectura_conductual: z.string().min(200),
  }),
  patron_personal_familiar: z.string().min(100),
  patron_profesional: z.string().min(100),
  terminos_subjetivos: z.array(z.string().min(1)).min(3).max(6),
  observaciones_y_tensiones: z
    .array(
      z.object({
        id: z.string().regex(/^H[1-9][0-9]*$/),
        contenido: z.string().min(40),
      }),
    )
    .min(3)
    .max(3),
  disparador_fase2: z.string().min(1),
});

export type HandoffParsed = z.infer<typeof HandoffSchema>;
