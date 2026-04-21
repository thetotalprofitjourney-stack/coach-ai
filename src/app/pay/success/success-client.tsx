'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Phase = 'confirming' | 'redirecting' | 'timeout' | 'error';

const POLL_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 30;

// Página de aterrizaje post-pago (§2.2). Stripe envía a
// `/pay/success?cs={CHECKOUT_SESSION_ID}`. Aquí hacemos polling contra
// `/api/checkout/resolve` hasta que el webhook escriba el
// `metadata.session_token` en la Checkout Session; entonces
// redirigimos a `/session/{token}`. El token lo escribe el webhook,
// no esta página (§3.1): este componente solo lo consulta.
export default function SuccessClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cs = searchParams.get('cs');
  const [phase, setPhase] = useState<Phase>('confirming');

  useEffect(() => {
    if (!cs) {
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
          `/api/checkout/resolve?cs=${encodeURIComponent(cs)}`,
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
          // Pago confirmado, webhook aún no ha escrito metadata: reintento.
          scheduleNext();
          return;
        }

        // 400 / 404 / 500: estado no recuperable vía polling.
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
  }, [cs, router]);

  if (phase === 'timeout') {
    return (
      <div className="max-w-xl text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Estamos tardando más de lo normal
        </h1>
        <p className="mt-4 text-neutral-600">
          El pago se registró, pero la confirmación está tardando más de
          lo habitual. En unos minutos podrás acceder a tu sesión.
        </p>
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
          Si el cargo aparece en tu banco, contacta con el operador; en
          caso contrario, inténtalo de nuevo desde el inicio.
        </p>
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
