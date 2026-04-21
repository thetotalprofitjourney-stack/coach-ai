'use client';

import { useState } from 'react';

type Phase = 'idle' | 'loading' | 'error';

// CTA "Empezar mi sesión". Invoca POST /api/checkout/create (endpoint
// público del Paso 10) y redirige a la URL hosted de Stripe Checkout.
// Sin retry automático: un segundo clic tras error vuelve a intentar.
export default function BuyButton() {
  const [phase, setPhase] = useState<Phase>('idle');

  async function handleClick() {
    setPhase('loading');
    try {
      const res = await fetch('/api/checkout/create', { method: 'POST' });
      if (!res.ok) {
        setPhase('error');
        return;
      }
      const body = (await res.json()) as { url?: string };
      if (!body.url) {
        setPhase('error');
        return;
      }
      window.location.href = body.url;
    } catch {
      setPhase('error');
    }
  }

  const loading = phase === 'loading';

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-500"
      >
        {loading ? 'Redirigiendo…' : 'Empezar mi sesión'}
      </button>
      {phase === 'error' && (
        <p className="mt-3 text-sm text-neutral-600" role="alert">
          No se ha podido iniciar el pago. Inténtalo de nuevo en unos minutos.
        </p>
      )}
    </div>
  );
}
