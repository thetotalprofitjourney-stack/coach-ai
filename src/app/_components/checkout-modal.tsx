'use client';

import { useCallback, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// loadStripe fuera del render: evita recrear el objeto Stripe en cada render.
// Será null si la variable de entorno no está definida; el componente lo
// detecta y muestra un error en lugar de crashear el SDK.
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;

interface CheckoutModalProps {
  onClose: () => void;
}

export default function CheckoutModal({ onClose }: CheckoutModalProps) {
  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch('/api/checkout/create-session', { method: 'POST' });
    if (!res.ok) throw new Error('No se pudo iniciar el checkout.');
    const data = (await res.json()) as { clientSecret: string };
    return data.clientSecret;
  }, []);

  if (!stripePromise) {
    return (
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center">
          <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 text-xl leading-none text-neutral-300 hover:text-neutral-600">×</button>
          <p className="text-sm text-neutral-600">
            El pago no está configurado correctamente.
            <br />
            Contacta con el soporte si el problema persiste.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Checkout de pago"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-10 sm:pt-16"
    >
      {/* Overlay con backdrop-blur, igual que el modal "¿Cómo funciona?" */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Contenedor del checkout */}
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar checkout"
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full text-xl leading-none text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-600"
        >
          ×
        </button>

        {/* EmbeddedCheckout gestiona su propio estado de carga interno */}
        <EmbeddedCheckoutProvider
          stripe={stripePromise}
          options={{ fetchClientSecret }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
