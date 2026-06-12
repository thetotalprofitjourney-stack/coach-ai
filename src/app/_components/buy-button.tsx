'use client';

import { useState } from 'react';

type Phase = 'idle' | 'loading' | 'error';

export default function BuyButton({ variant = 'default' }: { variant?: 'default' | 'light' }) {
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

  const btnClass =
    variant === 'light'
      ? 'inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-base font-medium text-stone-900 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60'
      : 'inline-flex items-center justify-center rounded-md bg-neutral-900 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60';

  const errorClass =
    variant === 'light' ? 'mt-3 text-sm text-stone-300' : 'mt-3 text-sm text-neutral-600';

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={btnClass}
      >
        {loading ? 'Redirigiendo…' : 'Empezar mi sesión'}
      </button>
      {phase === 'error' && (
        <p className={errorClass} role="alert">
          No se ha podido iniciar el pago. Inténtalo de nuevo en unos minutos.
        </p>
      )}
    </div>
  );
}
