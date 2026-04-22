import { abandonedWindowMs } from '@/lib/cron/cleanup';

// Construye los datos que consume `<ResumeLinkNotice>` a partir del
// token y la fecha de creación de la sesión. Centraliza dos cosas que
// de otro modo se duplicarían en cada screen:
//   1. La URL pública absoluta (APP_PUBLIC_URL + /session/{token}).
//   2. El expiresAt (createdAt + ventana abandoned actual).
// Si APP_PUBLIC_URL no está configurada lanza — mejor fallar visiblemente
// en dev que servir una URL relativa inútil para que el usuario guarde.

export interface ResumeLinkData {
  url: string;
  expiresAt: string;
}

export function buildResumeLinkData(
  token: string,
  createdAt: Date,
): ResumeLinkData {
  const origin = process.env.APP_PUBLIC_URL?.trim();
  if (!origin) {
    throw new Error(
      'resume-link: APP_PUBLIC_URL no está configurada, el aviso de retomar no puede mostrarse.',
    );
  }
  const base = origin.replace(/\/+$/, '');
  const url = `${base}/session/${token}`;
  const expiresAt = new Date(
    createdAt.getTime() + abandonedWindowMs(),
  ).toISOString();
  return { url, expiresAt };
}
