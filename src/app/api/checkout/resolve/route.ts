import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe/client';
import { jsonError, jsonOk } from '@/lib/api/response';

// GET /api/checkout/resolve?cs={checkoutSessionId}
// Puente que consume la página `/pay/success` para averiguar si el
// webhook ya procesó el `checkout.session.completed` correspondiente a
// este Checkout Session id. Tres respuestas posibles:
//
//   200 { token }           → pago confirmado y webhook ya escribió
//                              `metadata.session_token`. El frontend
//                              redirige a `/session/{token}`.
//   202 { pending: true }   → `payment_status === 'paid'` pero la
//                              Checkout Session aún no tiene metadata
//                              (carrera con el webhook). El frontend
//                              repite el polling.
//   400 INVALID_INPUT       → `cs` ausente o `payment_status` distinto
//                              de `paid` (unpaid / no_payment_required
//                              en modo subscription, que aquí no aplica).
//   404 SESSION_NOT_FOUND   → Stripe no conoce ese `cs` id.
//
// No leemos la tabla `sessions` — el vínculo entre pago y sesión vive
// sólo en Stripe (§3.1). Sólo consultamos Stripe.
export async function GET(req: NextRequest) {
  const cs = req.nextUrl.searchParams.get('cs');
  if (!cs) {
    return jsonError('INVALID_INPUT', 'Parámetro `cs` requerido.', 400);
  }

  let checkoutSession: Stripe.Checkout.Session;
  try {
    const stripe = getStripeClient();
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

  const token = checkoutSession.metadata?.session_token;
  if (typeof token !== 'string' || token.length === 0) {
    return jsonOk({ pending: true }, 202);
  }

  return jsonOk({ token });
}
