import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// Carga el prompt de la IA auxiliar desde docs/prompt-fase2-auxiliar.md a
// module-load time. Mismo patrón que fase2-coach: única fuente de verdad en
// el markdown, cadena byte-estable para que el prompt caching de Anthropic
// acierte en llamadas sucesivas con el mismo hand-off.
function loadFase2AuxiliarSystemPrompt(): string {
  const promptPath = join(process.cwd(), 'docs', 'prompt-fase2-auxiliar.md');
  const md = readFileSync(promptPath, 'utf8');
  const marker = '## Rol';
  const start = md.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `fase2-auxiliar: no se encontró el marcador "${marker}" en ${promptPath}.`,
    );
  }
  return md.slice(start);
}

let _f2a: string | null = null;
export function getFase2AuxiliarSystemPrompt(): string { return _f2a ??= loadFase2AuxiliarSystemPrompt(); }

// Schema del JSON que la auxiliar debe devolver. Se valida con Zod tras
// extraer el bloque JSON de la respuesta de Haiku.
export const AuxiliarOutputSchema = z.object({
  nuevo_resumen: z.string(),
  hipotesis_tocadas: z.array(z.string()),
  nuevos_terminos_subjetivos: z.array(z.string()),
  nivel_estimado: z.number().int().min(1).max(6),
});

export type AuxiliarOutput = z.infer<typeof AuxiliarOutputSchema>;
