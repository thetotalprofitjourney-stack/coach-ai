import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe/client';
import { createSessionRow } from '@/lib/session/create';
import { jsonError, jsonOk } from '@/lib/api/response';

// GET /api/checkout/resolve?cs={checkoutSessionId}
// Puente que consume la página `/pay/success` para averiguar si el
// webhook ya procesó el `checkout.session.completed` correspondiente a
// este Checkout Session id. Tres respuestas posibles:
//
//   200 { token }           → pago confirmado y token disponible.
//                              El frontend redirige a `/session/{token}`.
//   202 { pending: true }   → pago confirmado pero no se pudo crear la
//                              sesión todavía (fallo transitorio de DB
//                              o Stripe API). El frontend repite el polling.
//   400 INVALID_INPUT       → `cs` ausente o `payment_status` distinto
//                              de `paid`.
//   404 SESSION_NOT_FOUND   → Stripe no conoce ese `cs` id.
//
// Flujo normal: el webhook escribe `metadata.session_token` y esta ruta
// lo lee (fast path). Si el webhook no ha disparado o ha fallado, esta
// ruta crea la sesión directamente como fallback (§3.1): el webhook es
// idempotente por `existingToken`, así que si llega tarde no duplica.
export async function GET(req: NextRequest) {
  const cs = req.nextUrl.searchParams.get('cs');
  if (!cs) {
    return jsonError('INVALID_INPUT', 'Parámetro `cs` requerido.', 400);
  }

  const stripe = getStripeClient();

  let checkoutSession: Stripe.Checkout.Session;
  try {
    checkoutSession = await stripe.checkout.sessions.retrieve(cs);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      return jsonError(
        'SESSION_NOT_FOUND',
        'La Checkout Session no existe.',
        404,
      );
    }
    console.error('GET /api/checkout/resolve failed', err);
    return jsonError('INTERNAL', 'No se pudo consultar el pago.', 500);
  }

  if (checkoutSession.payment_status !== 'paid') {
    return jsonError('INVALID_INPUT', 'El pago no se ha completado.', 400);
  }

  // Fast path: el webhook ya escribió el token.
  const existingToken = checkoutSession.metadata?.session_token;
  if (typeof existingToken === 'string' && existingToken.length > 0) {
    return jsonOk({ token: existingToken });
  }

  // Fallback: webhook aún no ha disparado — crear sesión aquí.
  try {
    const { token } = await createSessionRow();
    await stripe.checkout.sessions.update(cs, {
      metadata: { session_token: token },
    });
    return jsonOk({ token });
  } catch (err) {
    // Posible carrera: otro proceso (webhook o poll concurrente) puede
    // haber escrito el token justo ahora. Re-consultamos antes de rendir.
    try {
      const refreshed = await stripe.checkout.sessions.retrieve(cs);
      const freshToken = refreshed.metadata?.session_token;
      if (typeof freshToken === 'string' && freshToken.length > 0) {
        return jsonOk({ token: freshToken });
      }
    } catch {
      // ignorar: el error original es el relevante
    }
    console.error('GET /api/checkout/resolve fallback failed', {
      cs,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonOk({ pending: true }, 202);
  }
}
