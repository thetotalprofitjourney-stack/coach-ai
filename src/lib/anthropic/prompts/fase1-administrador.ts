import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Carga el prompt del administrador de Fase 1 desde
// docs/prompt-fase1-administrador.md a module-load time. La cadena
// resultante es byte-estable durante la vida del proceso, condición
// necesaria para que cache_control: ephemeral acierte en los turnos
// sucesivos del administrador (típicamente 16 turnos por sesión).
function loadFase1AdministradorSystemPrompt(): string {
  const promptPath = join(
    process.cwd(),
    'docs',
    'prompt-fase1-administrador.md',
  );
  const md = readFileSync(promptPath, 'utf8');
  const marker = '## Rol';
  const start = md.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `fase1-administrador: no se encontró el marcador "${marker}" en ${promptPath}.`,
    );
  }
  return md.slice(start);
}

export const FASE1_ADMINISTRADOR_SYSTEM_PROMPT =
  loadFase1AdministradorSystemPrompt();
