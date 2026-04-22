'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ResumeLinkData } from '@/lib/session/resume-link';
import { ResumeLinkNotice } from './ResumeLinkNotice';

type Message = { role: 'admin' | 'user'; content: string };

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'synthesizing' }
  | { kind: 'error'; message: string };

export function Phase1Chat({
  token,
  resumeLink,
}: {
  token: string;
  resumeLink: ResumeLinkData;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [itemIndex, setItemIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const bootstrappedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/session/${token}/phase1/start`, {
          method: 'POST',
        });
        if (!res.ok) {
          setStatus({
            kind: 'error',
            message: 'No se pudo cargar el primer ítem.',
          });
          return;
        }
        const data = (await res.json()) as {
          adminMessage: string;
          itemIndex: number;
        };
        setMessages([{ role: 'admin', content: data.adminMessage }]);
        setItemIndex(data.itemIndex);
        setStatus({ kind: 'ready' });
      } catch {
        setStatus({
          kind: 'error',
          message: 'Error de red al arrancar.',
        });
      }
    })();
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || status.kind !== 'ready') return;
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setInput('');
    setStatus({ kind: 'sending' });

    try {
      const res = await fetch(`/api/session/${token}/phase1/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: trimmed }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          router.refresh();
          return;
        }
        setStatus({
          kind: 'error',
          message: 'No se pudo enviar tu respuesta.',
        });
        return;
      }
      const data = (await res.json()) as {
        adminMessage: string;
        itemIndex: number;
        done: boolean;
      };
      setMessages((m) => [...m, { role: 'admin', content: data.adminMessage }]);
      setItemIndex(data.itemIndex);
      setDone(data.done);
      setStatus({ kind: 'ready' });
    } catch {
      setStatus({ kind: 'error', message: 'Error de red.' });
    }
  };

  const finish = async () => {
    setStatus({ kind: 'synthesizing' });
    try {
      const res = await fetch(`/api/session/${token}/phase1/finish`, {
        method: 'POST',
      });
      if (!res.ok) {
        setStatus({
          kind: 'error',
          message:
            'No se pudo generar el hand-off. Vuelve a intentarlo en unos segundos.',
        });
        return;
      }
      router.refresh();
    } catch {
      setStatus({
        kind: 'error',
        message: 'Error de red generando el hand-off.',
      });
    }
  };

  const synthesizing = status.kind === 'synthesizing';

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 md:py-10">
      <header className="mb-4 flex items-baseline justify-between">
        <p className="text-sm uppercase tracking-wide text-neutral-500">
          Coach AI · Fase 1
        </p>
        <p className="text-sm text-neutral-600" aria-live="polite">
          Ítem {Math.min(itemIndex + (done ? 0 : 1), 16)}/16
        </p>
      </header>

      <ResumeLinkNotice url={resumeLink.url} expiresAt={resumeLink.expiresAt} />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-4"
        aria-live="polite"
      >
        {status.kind === 'loading' && (
          <p className="text-neutral-600">Cargando el primer ítem…</p>
        )}
        <ul className="space-y-4">
          {messages.map((m, i) => (
            <li
              key={i}
              className={
                m.role === 'admin'
                  ? 'rounded bg-white p-3 text-neutral-900 shadow-sm'
                  : 'rounded bg-neutral-900 p-3 text-white'
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </li>
          ))}
        </ul>
      </div>

      {status.kind === 'error' && (
        <p
          role="alert"
          className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {status.message}
        </p>
      )}

      {done ? (
        <div className="mt-4 space-y-3">
          <p className="text-neutral-700">
            Has respondido a los 16 ítems. Ahora prepararé tu sesión de
            coaching.
          </p>
          <button
            type="button"
            onClick={finish}
            disabled={synthesizing}
            className="w-full rounded bg-neutral-900 px-4 py-3 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {synthesizing
              ? 'Preparando tu sesión de coaching…'
              : 'Continuar a la sesión de coaching'}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="mt-4 flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe A, B, C o D (y lo que quieras añadir)…"
            disabled={status.kind !== 'ready'}
            aria-label="Tu respuesta"
            className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={status.kind !== 'ready' || input.trim().length === 0}
            className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'sending' ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}
    </main>
  );
}
