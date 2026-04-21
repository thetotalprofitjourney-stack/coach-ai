import { prisma } from '@/lib/prisma';
import type { CreateSessionResponse } from '@/lib/api/schemas';
import { logBusinessEvent } from '@/lib/metrics/events';

// Creación de la fila en `sessions` — única fuente de verdad (§3.1). La
// usan dos llamantes:
//
// 1. `POST /api/session/create` (wrapper HTTP, protegido por
//    `SESSION_CREATE_SECRET`), mantenido por compatibilidad con los smoke
//    tests y como fallback del operador.
// 2. El webhook de Stripe (`POST /api/stripe/webhook`) al recibir
//    `checkout.session.completed`. Llama en proceso, sin self-HTTP y sin
//    secreto: su auth es la firma de Stripe.
//
// Es el puente entre el sistema de facturación y el sistema de sesión
// (§2.2): devuelve el UUID que se escribirá en `metadata.session_token`
// de la Checkout Session, único lazo persistente entre ambos mundos.
export async function createSessionRow(): Promise<CreateSessionResponse> {
  const origin = process.env.APP_PUBLIC_URL;
  if (!origin) {
    throw new Error('APP_PUBLIC_URL no está configurado en el servidor.');
  }

  const session = await prisma.session.create({ data: {} });
  logBusinessEvent('session_created');
  return {
    token: session.id,
    url: `${origin}/session/${session.id}`,
  };
}
