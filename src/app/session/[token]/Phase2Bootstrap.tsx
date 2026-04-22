'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { consumeCoachStream } from '@/lib/api/coach-stream-client';
import type { ResumeLinkData } from '@/lib/session/resume-link';
import { ResumeLinkNotice } from './ResumeLinkNotice';

// Pantalla puente entre Fase 1 y Fase 2. Al montar dispara
// /api/session/{token}/phase2/bootstrap (Opus 4.7 + thinking 10k) y
// consume el stream NDJSON: mientras llegan tokens los pinta en vivo,
// y al recibir {type:'done'} hace router.refresh() para que el server
// component pinte Phase2Chat con el primer turno ya persistido.
export function Phase2Bootstrap({
  token,
  resumeLink,
}: {
  token: string;
  resumeLink: ResumeLinkData;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/session/${token}/phase2/bootstrap`, {
          method: 'POST',
        });
        if (!res.ok) {
          if (res.status === 409) {
            router.refresh();
            return;
          }
          setError(
            'No se pudo arrancar la sesión de coaching. Recarga la página en unos segundos.',
          );
          return;
        }

        let buffered = '';
        const streamOk = await consumeCoachStream(res, {
          onDelta: (delta) => {
            buffered += delta;
            setIsStreaming(true);
            setStreamingText(buffered);
          },
          onDone: () => {
            // Un router.refresh() hará que el server component pase a
            // renderizar Phase2Chat con el primer turno ya persistido.
            router.refresh();
          },
          onError: ({ message }) => {
            setError(
              message ||
                'No se pudo arrancar la sesión de coaching. Recarga la página.',
            );
          },
        });
        if (!streamOk) return;
      } catch {
        setError('Error de red. Recarga la página.');
      }
    })();
  }, [router, token]);

  if (isStreaming) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 md:py-10">
        <header className="mb-4">
          <p className="text-sm uppercase tracking-wide text-neutral-500">
            Coach AI · Sesión
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">
            Tu coach está empezando…
          </h1>
        </header>
        <div
          className="flex-1 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-4"
          aria-live="polite"
        >
          <div className="rounded bg-white p-3 text-neutral-900 shadow-sm">
            <p className="whitespace-pre-wrap">{streamingText}</p>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
      </main>
    );
  }

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
      <div className="mt-6 text-left">
        <ResumeLinkNotice
          url={resumeLink.url}
          expiresAt={resumeLink.expiresAt}
        />
      </div>
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
