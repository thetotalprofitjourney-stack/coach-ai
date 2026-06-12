import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe/client';
import { createSessionRow } from '@/lib/session/create';
import { jsonError, jsonOk } from '@/lib/api/response';

// POST /api/stripe/webhook
// Único punto de entrada del sistema de facturación al sistema de sesión
// (§3.1). Al recibir `checkout.session.completed`:
//
//   1. Verifica la firma HMAC con `STRIPE_WEBHOOK_SECRET`. Sin firma
//      válida, la request no existe para nosotros: 400. Es el único
//      control de autenticidad — Stripe emite los eventos, no el
//      navegador del usuario.
//   2. Idempotencia por `metadata.session_token`. Si el objeto ya tiene
//      token (reentrada de Stripe tras timeout, reenvío manual, etc.),
//      no-op. No mantenemos tabla `stripe_events_processed`: el propio
//      objeto en Stripe es el bit de idempotencia.
//   3. Si no hay token: `createSessionRow()` genera el UUID v4 en la
//      tabla `sessions` y devuelve \`{ token, url }\`. Se escribe el
//      token como `metadata.session_token` de la Checkout Session.
//      Ese metadata es el lazo unidireccional que la landing post-pago
//      leerá vía `/api/checkout/resolve`.
//
// La firma reemplaza a cualquier auth propia. No se llama a
// `POST /api/session/create` por HTTP: invocamos el helper en proceso
// para no ensuciar el diagrama con self-HTTP.
//
// Log JSON estructurado al estilo del cron de limpieza (§7.3), sin PII
// del pago (ni email ni nombre de facturación).

// Next.js App Router: la API route recibe el body como stream; usamos
// `req.text()` para obtener el raw UTF-8 que Stripe firmó. No hay que
// desactivar ningún body parser (eso era Pages Router).
export async function POST(req: NextRequest) {
  const started = Date.now();
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('stripe_webhook missing STRIPE_WEBHOOK_SECRET');
    return jsonError('INTERNAL', 'Webhook no configurado.', 500);
  }
  if (!signature) {
    return jsonError('UNAUTHORIZED', 'Firma de Stripe ausente.', 400);
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'firma inválida';
    console.warn('stripe_webhook signature verification failed', { message });
    return jsonError('UNAUTHORIZED', 'Firma de Stripe inválida.', 400);
  }

  if (event.type !== 'checkout.session.completed') {
    logWebhook({
      eventId: event.id,
      eventType: event.type,
      outcome: 'ignored',
      durationMs: Date.now() - started,
    });
    return jsonOk({ ok: true, ignored: true });
  }

  const checkoutSession = event.data.object as Stripe.Checkout.Session;

  // Ignorar pagos de otros productos de la misma cuenta Stripe.
  if (checkoutSession.metadata?.app !== 'coach-ai') {
    logWebhook({
      eventId: event.id,
      eventType: event.type,
      checkoutSessionId: checkoutSession.id,
      outcome: 'ignored',
      durationMs: Date.now() - started,
    });
    return jsonOk({ ok: true, ignored: true });
  }

  const existingToken =
    typeof checkoutSession.metadata?.session_token === 'string'
      ? checkoutSession.metadata.session_token
      : null;

  if (existingToken) {
    logWebhook({
      eventId: event.id,
      eventType: event.type,
      checkoutSessionId: checkoutSession.id,
      outcome: 'idempotent',
      sessionToken: existingToken,
      durationMs: Date.now() - started,
    });
    return jsonOk({ ok: true, idempotent: true });
  }

  try {
    const { token } = await createSessionRow(checkoutSession.id);
    const stripe = getStripeClient();
    await stripe.checkout.sessions.update(checkoutSession.id, {
      metadata: { session_token: token },
    });
    logWebhook({
      eventId: event.id,
      eventType: event.type,
      checkoutSessionId: checkoutSession.id,
      outcome: 'created',
      sessionToken: token,
      durationMs: Date.now() - started,
    });
    return jsonOk({ ok: true, created: true });
  } catch (err) {
    console.error('stripe_webhook failed', {
      eventId: event.id,
      checkoutSessionId: checkoutSession.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError('INTERNAL', 'Fallo al procesar el webhook.', 500);
  }
}

interface WebhookLog {
  eventId: string;
  eventType: string;
  checkoutSessionId?: string;
  sessionToken?: string;
  outcome: 'ignored' | 'idempotent' | 'created';
  durationMs: number;
}

function logWebhook(entry: WebhookLog): void {
  console.log(
    JSON.stringify({
      event: 'stripe_webhook',
      timestamp: new Date().toISOString(),
      ...entry,
    }),
  );
}
