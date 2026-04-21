import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Carga el prompt del coach desde docs/prompt-fase2.md a module-load time.
// Única fuente de verdad: el markdown. La cadena resultante es byte-estable
// durante la vida del proceso, lo que permite que el prompt caching de
// Anthropic (cache_control: ephemeral) acierte en llamadas sucesivas.
function loadFase2CoachSystemPrompt(): string {
  const promptPath = join(process.cwd(), 'docs', 'prompt-fase2.md');
  const md = readFileSync(promptPath, 'utf8');
  const marker = '## Rol';
  const start = md.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `fase2-coach: no se encontró el marcador "${marker}" en ${promptPath}.`,
    );
  }
  return md.slice(start);
}

export const FASE2_COACH_SYSTEM_PROMPT = loadFase2CoachSystemPrompt();
