'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Phase = 'confirming' | 'redirecting' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 30;

// Página de aterrizaje tras el embedded checkout (flujo §2.2 para ui_mode
// "embedded"). Stripe redirige aquí con ?session_id={CHECKOUT_SESSION_ID}.
// Hace polling contra /api/checkout/resolve hasta que el webhook escribe
// metadata.session_token; entonces redirige a /session/{token}.
// La lógica es idéntica a pay/success pero adaptada al parámetro session_id.
export default function PagoCompletadoClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [phase, setPhase] = useState<Phase>('confirming');

  useEffect(() => {
    if (!sessionId) {
      setPhase('error');
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      if (attempts >= MAX_ATTEMPTS) {
        setPhase('timeout');
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch(
          `/api/checkout/resolve?cs=${encodeURIComponent(sessionId)}`,
          { cache: 'no-store' },
        );

        if (cancelled) return;

        if (res.status === 200) {
          const data = (await res.json()) as { token?: string };
          if (data.token) {
            setPhase('redirecting');
            router.replace(`/session/${data.token}`);
            return;
          }
        }

        if (res.status === 202) {
          scheduleNext();
          return;
        }

        setPhase('error');
      } catch {
        if (cancelled) return;
        scheduleNext();
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, router]);

  if (phase === 'timeout') {
    return (
      <div className="max-w-xl text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Estamos tardando más de lo normal
        </h1>
        <p className="mt-4 text-neutral-600">
          El pago se registró, pero la confirmación está tardando más de lo
          habitual. En unos minutos podrás acceder a tu sesión.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="max-w-xl text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          No hemos podido confirmar el pago
        </h1>
        <p className="mt-4 text-neutral-600">
          Si el cargo aparece en tu banco, contacta con el operador; en caso
          contrario, inténtalo de nuevo desde el inicio.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  const label =
    phase === 'redirecting' ? 'Abriendo tu sesión…' : 'Confirmando tu pago…';

  return (
    <div className="max-w-xl text-center">
      <div
        aria-hidden
        className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900"
      />
      <p className="mt-4 text-neutral-600">{label}</p>
    </div>
  );
}
