'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { consumeCoachStream } from '@/lib/api/coach-stream-client';
import type { ResumeLinkData } from '@/lib/session/resume-link';
import { ResumeLinkNotice } from './ResumeLinkNotice';

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
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-400">
            Coach AI
          </p>
          <p className="mt-0.5 text-sm font-medium text-neutral-700">
            Sesión de coaching
          </p>
        </header>
        <div
          className="flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 p-4"
          aria-live="polite"
        >
          <div className="rounded-lg bg-white p-4 text-neutral-900 shadow-sm">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400">
              Coach
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{streamingText}</p>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
        Coach AI
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-neutral-900">
        Preparando tu sesión…
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-500">
        Estoy leyendo el cuestionario de perfil. Esto puede tardar un minuto.
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
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </main>
  );
}
