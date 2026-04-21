import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DiscFactor, DiscLetter } from './types';

export interface BancoOpcion {
  texto: string;
  factor: DiscFactor;
}

export interface BancoItem {
  id: number;
  dominio: 'profesional' | 'personal_familiar';
  escenario: string;
  pregunta: string;
  opciones: Record<DiscLetter, BancoOpcion>;
}

interface BancoFile {
  version: string;
  descripcion: string;
  items: BancoItem[];
}

// Carga el banco a module-load. El archivo es inmutable (asset estático
// del producto) y el string JSON resultante es byte-estable, condición
// necesaria para que cache_control: ephemeral funcione en los turnos
// sucesivos del administrador y en la síntesis.
const rawBanco = readFileSync(
  join(process.cwd(), 'src', 'data', 'banco-items-disc.json'),
  'utf8',
);

const parsed = JSON.parse(rawBanco) as BancoFile;

if (parsed.items.length !== 16) {
  throw new Error(
    `banco-items-disc.json debe contener 16 ítems, tiene ${parsed.items.length}`,
  );
}

export const BANCO_ITEMS: readonly BancoItem[] = Object.freeze(parsed.items);

// Representación textual estable del banco para inyectar como bloque
// cacheado en el system. Re-stringify para garantizar byte-estabilidad
// entre plataformas (línea 1 = objeto completo pretty-printed).
export const BANCO_ITEMS_TEXT: string = JSON.stringify(
  { version: parsed.version, items: parsed.items },
  null,
  2,
);

export function getItemByIndex(index: number): BancoItem {
  const item = BANCO_ITEMS[index];
  if (!item) {
    throw new Error(`fase1/banco: índice ${index} fuera de rango (0..15)`);
  }
  return item;
}

export function factorOf(itemId: number, letter: DiscLetter): DiscFactor {
  const item = BANCO_ITEMS.find((it) => it.id === itemId);
  if (!item) {
    throw new Error(`fase1/banco: ítem id=${itemId} no encontrado`);
  }
  return item.opciones[letter].factor;
}

// Formato legible del ítem para inyectar en el mensaje del usuario al
// administrador: escenario + pregunta + 4 opciones literales.
export function formatItemForPrompt(item: BancoItem): string {
  const lines: string[] = [
    `id: ${item.id}`,
    `dominio: ${item.dominio}`,
    `escenario: ${item.escenario}`,
    `pregunta: ${item.pregunta}`,
    'opciones:',
    `  A) ${item.opciones.A.texto}`,
    `  B) ${item.opciones.B.texto}`,
    `  C) ${item.opciones.C.texto}`,
    `  D) ${item.opciones.D.texto}`,
  ];
  return lines.join('\n');
}
