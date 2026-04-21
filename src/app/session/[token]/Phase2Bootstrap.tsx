'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Pantalla puente entre Fase 1 y Fase 2. Al montar dispara
// /api/session/{token}/phase2/bootstrap (Opus 4.7 + thinking 10k,
// ~20-40 s) y al responder hace router.refresh() para que el server
// component pinte Phase2Chat con el primer turno ya persistido.
export function Phase2Bootstrap({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/session/${token}/phase2/bootstrap`, {
          method: 'POST',
        });
        if (res.ok) {
          router.refresh();
          return;
        }
        if (res.status === 409) {
          router.refresh();
          return;
        }
        setError(
          'No se pudo arrancar la sesión de coaching. Recarga la página en unos segundos.',
        );
      } catch {
        setError('Error de red. Recarga la página.');
      }
    })();
  }, [router, token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10 text-center">
      <p className="text-sm uppercase tracking-wide text-neutral-500">
        Coach AI
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Preparando tu sesión de coaching…
      </h1>
      <p className="mt-4 text-neutral-600">
        Estoy revisando tus respuestas. Esto puede tardar un minuto.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </main>
  );
}
