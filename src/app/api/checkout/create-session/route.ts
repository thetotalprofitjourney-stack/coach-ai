import { getStripeClient } from '@/lib/stripe/client';
import { jsonError, jsonOk } from '@/lib/api/response';

// POST /api/checkout/create-session
// Crea una Stripe Checkout Session en modo `embedded` (ui_mode: "embedded")
// y devuelve el client_secret al componente CheckoutModal, que lo monta
// directamente en la página sin redirigir al usuario a una URL externa.
//
// Diferencias con /api/checkout/create (hosted):
//   - ui_mode: "embedded" en lugar de la URL hosted.
//   - Retorna `clientSecret` en vez de `url`.
//   - return_url en lugar de success_url/cancel_url.
//
// El webhook en /api/stripe/webhook procesa checkout.session.completed
// igual que en el flujo hosted, ya que el evento es idéntico.
export async function POST() {
  const priceId = process.env.STRIPE_PRICE_ID;
  const publicUrl = process.env.APP_PUBLIC_URL;

  if (!priceId || !publicUrl) {
    console.error('POST /api/checkout/create-session missing env', {
      hasPriceId: Boolean(priceId),
      hasPublicUrl: Boolean(publicUrl),
    });
    return jsonError('INTERNAL', 'Pago no configurado en el servidor.', 500);
  }

  try {
    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      // {CHECKOUT_SESSION_ID} lo sustituye Stripe antes de redirigir.
      return_url: `${publicUrl}/pago-completado?session_id={CHECKOUT_SESSION_ID}`,
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      tax_id_collection: { enabled: false },
      customer_creation: 'if_required',
      allow_promotion_codes: false,
      metadata: { app: 'coach-ai' },
    });

    if (!session.client_secret) {
      console.error('POST /api/checkout/create-session: sin client_secret', {
        id: session.id,
      });
      return jsonError('INTERNAL', 'No se pudo crear el checkout.', 500);
    }

    return jsonOk({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('POST /api/checkout/create-session failed', err);
    return jsonError('INTERNAL', 'No se pudo crear el checkout.', 500);
  }
}
