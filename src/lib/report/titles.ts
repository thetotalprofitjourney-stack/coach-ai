// Títulos humanos de los 11 bloques del informe (§5.4) y utilidades
// compartidas por los renderers PDF/DOCX y por el endpoint de descarga.

import type { ReportBlockKey } from '@/lib/fase2/parse-report';

export const BLOCK_TITLES: Record<ReportBlockKey, string> = {
  objetivo_inicial: 'Objetivo inicial expresado',
  razon_peso: 'Razón de peso identificada',
  significado_terminos_clave: 'Significado concreto de los términos clave',
  objetivo_reformulado: 'Objetivo reformulado',
  capacidades_y_recursos: 'Capacidades y recursos reconocidos',
  carencias_y_puntos_ciegos: 'Carencias y puntos ciegos admitidos',
  riesgos_y_renuncias: 'Riesgos y renuncias identificados',
  decision_tomada: 'Decisión tomada',
  primer_paso: 'Primer paso comprometido',
  senales_revision: 'Señales de revisión',
  preguntas_abiertas: 'Preguntas abiertas',
};

export const PRODUCT_NAME = 'Coach AI';

export const RAW_FALLBACK_NOTICE =
  'El informe no pudo estructurarse en los 11 bloques habituales. Se incluye a continuación el contenido generado por el coach tal cual.';

export function formatDateEs(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDateIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function slugifyForFilename(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function reportFilename(
  userName: string | null | undefined,
  createdAt: Date,
  ext: 'pdf' | 'docx',
): string {
  const slug = slugifyForFilename(userName);
  const date = formatDateIso(createdAt);
  return slug ? `informe-${slug}-${date}.${ext}` : `informe-${date}.${ext}`;
}
