'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type ChatTurn = { role: 'coach' | 'user'; content: string; turnNumber: number };

type Status =
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'finished' }
  | { kind: 'error'; message: string };

export interface PreviewChatProps {
  token: string;
  initialTurns: ChatTurn[];
  initialTurnsUsed: number;
  turnsTotal: number;
}

// Chat de la demo gratuita. A diferencia de Phase2Chat:
// - NO hay streaming (Haiku es rápido y queríamos mantenerlo simple).
// - El banner "Demo · coach ligero · N/total" es persistente.
// - Al agotar turnsTotal se oculta el input y aparece el CTA a la
//   sesión completa. La intención del framing es que el visitante
//   entienda que esto es una muestra, no el producto.
export function PreviewChat({
  token,
  initialTurns,
  initialTurnsUsed,
  turnsTotal,
}: PreviewChatProps) {
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [turnsUsed, setTurnsUsed] = useState(initialTurnsUsed);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>(() =>
    initialTurnsUsed >= turnsTotal ? { kind: 'finished' } : { kind: 'ready' },
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [turns]);

  const finished = status.kind === 'finished' || turnsUsed >= turnsTotal;

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || status.kind !== 'ready') return;

    const userTurnNumber = turnsUsed;
    setTurns((t) => [
      ...t,
      { role: 'user', content: trimmed, turnNumber: userTurnNumber },
    ]);
    setInput('');
    setStatus({ kind: 'sending' });

    try {
      const res = await fetch(`/api/preview/${token}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: trimmed }),
      });
      if (!res.ok) {
        setStatus({
          kind: 'error',
          message: 'No se pudo continuar la demo. Inténtalo de nuevo.',
        });
        return;
      }
      const data = (await res.json()) as {
        coachMessage: string;
        turnsUsed: number;
        turnsTotal: number;
        finished: boolean;
      };
      setTurns((t) => [
        ...t,
        {
          role: 'coach',
          content: data.coachMessage,
          turnNumber: data.turnsUsed,
        },
      ]);
      setTurnsUsed(data.turnsUsed);
      setStatus(data.finished ? { kind: 'finished' } : { kind: 'ready' });
    } catch {
      setStatus({ kind: 'error', message: 'Error de red.' });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 md:py-10">
      <header className="mb-3">
        <p className="text-sm uppercase tracking-wide text-neutral-500">
          Coach AI · Demo
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Prueba la conversación
        </h1>
      </header>

      <div
        className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        role="note"
      >
        <strong className="font-medium">Demo · coach ligero (Haiku)</strong>
        <span className="ml-2 text-amber-800">
          {turnsUsed}/{turnsTotal} turnos. La sesión completa son 50 turnos con
          Opus detrás, tras un cuestionario de 15-20 min.
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-4"
        aria-live="polite"
      >
        <ul className="space-y-4">
          {turns.map((t, i) => (
            <li
              key={`${t.turnNumber}-${t.role}-${i}`}
              className={
                t.role === 'coach'
                  ? 'rounded bg-white p-3 text-neutral-900 shadow-sm'
                  : 'rounded bg-neutral-900 p-3 text-white'
              }
            >
              <p className="whitespace-pre-wrap">{t.content}</p>
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

      {!finished ? (
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
            placeholder="Escribe tu respuesta (máx. 500 caracteres)…"
            maxLength={500}
            disabled={status.kind !== 'ready'}
            aria-label="Tu respuesta"
            className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={status.kind !== 'ready' || input.trim().length === 0}
            className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'sending' ? 'Pensando…' : 'Enviar'}
          </button>
        </form>
      ) : (
        <div className="mt-4 rounded border border-neutral-300 bg-white p-4">
          <p className="text-sm text-neutral-700">
            La demo ha terminado. Si quieres seguir, la sesión completa son 50
            turnos con Opus detrás, tras un cuestionario breve que calibra el
            contexto.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Ir a la sesión completa
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
            >
              Volver a la portada
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
