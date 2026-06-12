'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type BuyPhase = 'idle' | 'loading' | 'error';
type PreviewPhase = 'idle' | 'loading' | 'error' | 'ratelimit';

export default function LandingCTAs() {
  const router = useRouter();
  const [buyPhase, setBuyPhase] = useState<BuyPhase>('idle');
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>('idle');
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  async function handleBuy() {
    setBuyPhase('loading');
    try {
      const res = await fetch('/api/checkout/create', { method: 'POST' });
      if (!res.ok) { setBuyPhase('error'); return; }
      const body = (await res.json()) as { url?: string };
      if (!body.url) { setBuyPhase('error'); return; }
      window.location.href = body.url;
    } catch {
      setBuyPhase('error');
    }
  }

  async function handlePreview() {
    setPreviewPhase('loading');
    setPreviewMsg(null);
    try {
      const res = await fetch('/api/preview/start', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        if (res.status === 429) {
          setPreviewMsg(body?.error?.message ?? 'Has llegado al límite de demos diarias.');
          setPreviewPhase('ratelimit');
        } else {
          setPreviewPhase('error');
        }
        return;
      }
      const body = (await res.json()) as { token?: string };
      if (!body.token) { setPreviewPhase('error'); return; }
      router.push(`/preview/${body.token}`);
    } catch {
      setPreviewPhase('error');
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => void handleBuy()}
          disabled={buyPhase === 'loading'}
          className="rounded-lg bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {buyPhase === 'loading' ? 'Redirigiendo…' : 'Empezar mi sesión'}
        </button>
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={previewPhase === 'loading'}
          className="rounded-lg border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {previewPhase === 'loading' ? 'Abriendo demo…' : 'Probar la demo'}
        </button>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="rounded-lg px-5 py-3 text-sm text-neutral-500 transition hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
        >
          ¿Qué es esto?
        </button>
      </div>

      {buyPhase === 'error' && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          No se pudo iniciar el pago. Inténtalo de nuevo en unos minutos.
        </p>
      )}
      {(previewPhase === 'error' || previewPhase === 'ratelimit') && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {previewMsg ?? 'No se pudo arrancar la demo. Inténtalo en unos minutos.'}
        </p>
      )}

      {infoOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Información sobre Coach AI"
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
        >
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setInfoOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              aria-label="Cerrar"
              className="absolute right-4 top-4 text-xl leading-none text-neutral-300 transition hover:text-neutral-600"
            >
              ×
            </button>

            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
              Coach AI
            </p>
            <h2 className="mt-3 font-serif text-xl font-semibold leading-snug text-neutral-900">
              No es terapia. No es un chatbot.
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Es un coach que solo pregunta.
            </p>

            <div className="mt-5 space-y-3 text-sm leading-relaxed text-neutral-600">
              <p>
                Empieza con 16 situaciones de perfil para que el coach te entienda.
                Luego, una sesión de coaching de 40–50 minutos sobre la decisión que has traído.
              </p>
              <p>
                No hay consejos que no pediste. No hay juicios.
                Solo preguntas que te llevan a lo que ya sabes.
              </p>
              <p>
                Al terminar, lees un resumen de lo que trabajaste.
                Solo tú lo verás. Al cerrar, los datos desaparecen.
              </p>
            </div>

            <p className="mt-6 text-[11px] text-neutral-400">
              Sin cuenta · Sin email · Anónimo por diseño
            </p>
          </div>
        </div>
      )}
    </>
  );
}
