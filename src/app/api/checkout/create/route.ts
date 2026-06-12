import { getStripeClient } from '@/lib/stripe/client';
import { jsonError, jsonOk } from '@/lib/api/response';

// POST /api/checkout/create
// Crea una Stripe Checkout Session en modo `payment` (§8: una sesión =
// un pago) y devuelve la URL hosted a la que redirigir al usuario desde
// la landing (Paso 11). Sin auth: la landing es pública. Crear una
// Checkout Session no factura nada hasta que el usuario complete el
// pago, y Stripe aplica su propio rate limiting.
//
// La fila en `sessions` NO se crea aquí. Sólo se crea cuando llega
// `checkout.session.completed` al webhook (§2.2), evitando filas
// huérfanas por usuarios que abandonan el checkout.
export async function POST() {
  const priceId = process.env.STRIPE_PRICE_ID;
  const publicUrl = process.env.APP_PUBLIC_URL;

  if (!priceId || !publicUrl) {
    console.error('POST /api/checkout/create missing env', {
      hasPriceId: Boolean(priceId),
      hasPublicUrl: Boolean(publicUrl),
    });
    return jsonError(
      'INTERNAL',
      'Pago no configurado en el servidor.',
      500,
    );
  }

  try {
    const stripe = getStripeClient();
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${publicUrl}/pay/success?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicUrl}/pay/cancelled`,
      allow_promotion_codes: false,
      metadata: { app: 'coach-ai' },
    });

    if (!checkout.url) {
      console.error('POST /api/checkout/create: Stripe sin url', {
        id: checkout.id,
      });
      return jsonError('INTERNAL', 'No se pudo crear el checkout.', 500);
    }

    return jsonOk({ url: checkout.url });
  } catch (err) {
    console.error('POST /api/checkout/create failed', err);
    return jsonError('INTERNAL', 'No se pudo crear el checkout.', 500);
  }
}
