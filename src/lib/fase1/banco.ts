import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DiscFactor, DiscLetter, RetoDominio } from './types';

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

// Devuelve los ítems filtrados según el dominio del reto.
// personal → ítems personal_familiar (IDs 9-16)
// profesional → ítems profesional (IDs 1-8)
// general → todos los ítems (IDs 1-16)
export function getFilteredItems(retoDominio: RetoDominio): readonly BancoItem[] {
  if (retoDominio === 'general') return BANCO_ITEMS;
  const dominio = retoDominio === 'personal' ? 'personal_familiar' : 'profesional';
  return BANCO_ITEMS.filter((item) => item.dominio === dominio);
}

export function getFilteredItemByIndex(index: number, retoDominio: RetoDominio): BancoItem {
  const items = getFilteredItems(retoDominio);
  const item = items[index];
  if (!item) {
    throw new Error(
      `fase1/banco: índice ${index} fuera de rango para dominio "${retoDominio}" (0..${items.length - 1})`,
    );
  }
  return item;
}

export function getTotalItems(retoDominio: RetoDominio): number {
  return getFilteredItems(retoDominio).length;
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
