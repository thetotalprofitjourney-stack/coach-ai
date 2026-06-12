import { prisma } from '@/lib/prisma';
import type { CreateSessionResponse } from '@/lib/api/schemas';
import { logBusinessEvent } from '@/lib/metrics/events';

// Creación de la fila en `sessions` — única fuente de verdad (§3.1). La
// usan tres llamantes:
//
// 1. `POST /api/session/create` (wrapper HTTP, protegido por
//    `SESSION_CREATE_SECRET`), mantenido por compatibilidad con los smoke
//    tests y como fallback del operador.
// 2. El webhook de Stripe (`POST /api/stripe/webhook`) al recibir
//    `checkout.session.completed`.
// 3. `GET /api/checkout/resolve` como fallback cuando el webhook no ha
//    disparado tras el pago.
//
// Llamantes 2 y 3 pasan `stripeCheckoutSessionId`. La columna tiene un
// índice UNIQUE parcial (solo sobre filas no-null), así que si ambos
// intentan crear simultáneamente, el segundo recibe un error P2002 de
// Prisma y esta función releerá la fila ya existente — garantía de
// idempotencia sin bloqueos de aplicación.
export async function createSessionRow(
  stripeCheckoutSessionId?: string,
): Promise<CreateSessionResponse> {
  const origin = process.env.APP_PUBLIC_URL;
  if (!origin) {
    throw new Error('APP_PUBLIC_URL no está configurado en el servidor.');
  }

  try {
    const session = await prisma.session.create({
      data: stripeCheckoutSessionId ? { stripeCheckoutSessionId } : {},
    });
    logBusinessEvent('session_created');
    return {
      token: session.id,
      url: `${origin}/session/${session.id}`,
    };
  } catch (err: unknown) {
    // P2002 = unique constraint violation: otro proceso (webhook o resolve)
    // ya creó la sesión para este checkout. Devolvemos la existente.
    if (
      stripeCheckoutSessionId &&
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'P2002'
    ) {
      const existing = await prisma.session.findUniqueOrThrow({
        where: { stripeCheckoutSessionId },
      });
      return {
        token: existing.id,
        url: `${origin}/session/${existing.id}`,
      };
    }
    throw err;
  }
}
