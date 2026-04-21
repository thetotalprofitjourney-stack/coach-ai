// Parser del informe final generado por el coach al cerrar. §5.4 define 11
// bloques numerados; el coach los emite como `1. **Título.** contenido\n\n
// 2. **Título.** contenido ...`. El parser tolera variaciones (headers con
// `##`, con o sin `**`, con o sin punto final) y si no encuentra los 11
// bloques devuelve `parseStatus: 'raw'` con el texto completo.

export const REPORT_BLOCK_KEYS = [
  'objetivo_inicial',
  'razon_peso',
  'significado_terminos_clave',
  'objetivo_reformulado',
  'capacidades_y_recursos',
  'carencias_y_puntos_ciegos',
  'riesgos_y_renuncias',
  'decision_tomada',
  'primer_paso',
  'senales_revision',
  'preguntas_abiertas',
] as const;

export type ReportBlockKey = (typeof REPORT_BLOCK_KEYS)[number];

export type FinalReportContent = {
  parseStatus: 'parsed' | 'raw';
  rawText: string;
  blocks: Partial<Record<ReportBlockKey, string>>;
};

// Regex que captura el inicio de cada bloque numerado del 1 al 11. Acepta
// encabezados con o sin `**`, precedidos opcionalmente por `#` markdown.
// El grupo 1 es el número, el grupo 2 es todo lo demás en la línea.
const BLOCK_HEADER_RE = /^\s*(?:#{1,4}\s*)?(\d{1,2})\.\s+\*?\*?([^\n]*)/gm;

export function parseFinalReport(text: string): FinalReportContent {
  const matches: Array<{ number: number; start: number; headerEnd: number }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(BLOCK_HEADER_RE);
  while ((m = re.exec(text)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 1 && n <= 11) {
      matches.push({
        number: n,
        start: m.index,
        headerEnd: m.index + m[0].length,
      });
    }
  }

  // Deduplicar por número (puede haberse referenciado "11" en el cuerpo).
  const firstByNumber = new Map<number, { start: number; headerEnd: number }>();
  for (const hit of matches) {
    if (!firstByNumber.has(hit.number)) {
      firstByNumber.set(hit.number, { start: hit.start, headerEnd: hit.headerEnd });
    }
  }

  if (firstByNumber.size < 11) {
    return { parseStatus: 'raw', rawText: text, blocks: {} };
  }

  const ordered = Array.from(firstByNumber.entries()).sort((a, b) => a[0] - b[0]);
  const blocks: Partial<Record<ReportBlockKey, string>> = {};
  for (let i = 0; i < ordered.length; i++) {
    const [number, pos] = ordered[i];
    const nextStart = i + 1 < ordered.length ? ordered[i + 1][1].start : text.length;
    const body = text.slice(pos.headerEnd, nextStart).trim();
    const key = REPORT_BLOCK_KEYS[number - 1];
    blocks[key] = stripTrailingStars(body);
  }

  return { parseStatus: 'parsed', rawText: text, blocks };
}

function stripTrailingStars(s: string): string {
  // Limpia restos del header en negrita si el regex cortó a mitad de `**`.
  return s.replace(/^\*{0,2}\s*/, '').replace(/\*{2}\s*\.?\s*/, ' ').trim();
}
