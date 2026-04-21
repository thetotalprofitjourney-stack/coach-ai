import Stripe from 'stripe';

// Singleton del SDK de Stripe (Paso 10). Server-only: lee STRIPE_SECRET_KEY
// del entorno. Fijamos `apiVersion` explícita para que el SDK no cambie
// implícitamente al actualizar la dependencia. Valor alineado con la versión
// del SDK `stripe@22` instalada en 2026-04; si subimos de major habrá que
// revisitar esta constante.
const globalForStripe = globalThis as unknown as { stripe?: Stripe };

export function getStripeClient(): Stripe {
  if (globalForStripe.stripe) return globalForStripe.stripe;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY no está configurado en el servidor.');
  }

  const client = new Stripe(secret, { apiVersion: '2026-03-25.dahlia' });
  if (process.env.NODE_ENV !== 'production') {
    globalForStripe.stripe = client;
  }
  return client;
}
