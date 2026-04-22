'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Phase = 'idle' | 'loading' | 'error';

// CTA "Prueba la conversación". Invoca POST /api/preview/start (3 turnos
// gratis con Haiku) y redirige a /preview/{token} donde vive la demo.
// Diseño secundario para no competir visualmente con BuyButton.
export default function PreviewButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setPhase('loading');
    setMessage(null);
    try {
      const res = await fetch('/api/preview/start', { method: 'POST' });
      if (!res.ok) {
        if (res.status === 429) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          setMessage(
            body?.error?.message ||
              'Has llegado al límite de demos diarias.',
          );
        } else {
          setMessage('No se pudo arrancar la demo. Inténtalo en unos minutos.');
        }
        setPhase('error');
        return;
      }
      const body = (await res.json()) as { token?: string };
      if (!body.token) {
        setPhase('error');
        setMessage('Respuesta inesperada del servidor.');
        return;
      }
      router.push(`/preview/${body.token}`);
    } catch {
      setPhase('error');
      setMessage('Error de red. Inténtalo de nuevo.');
    }
  }

  const loading = phase === 'loading';

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Abriendo demo…' : 'Prueba la conversación (3 turnos)'}
      </button>
      <p className="mt-2 text-xs text-neutral-500">
        Gratis · coach ligero (Haiku) · la sesión completa usa Opus
      </p>
      {phase === 'error' && message && (
        <p className="mt-3 text-sm text-neutral-600" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
