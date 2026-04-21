'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type ChatTurn = { role: 'coach' | 'user'; content: string; turnNumber: number };

type Status =
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'closing' }
  | { kind: 'error'; message: string };

export interface Phase2ChatProps {
  token: string;
  initialTurns: ChatTurn[];
  initialCoachTurnNumber: number;
  initialLevel: number;
}

export function Phase2Chat({
  token,
  initialTurns,
  initialCoachTurnNumber,
  initialLevel,
}: Phase2ChatProps) {
  const router = useRouter();
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [coachTurnNumber, setCoachTurnNumber] = useState(initialCoachTurnNumber);
  const [level, setLevel] = useState(initialLevel);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'ready' });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [turns]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || status.kind !== 'ready') return;
    const userTurnNumber = coachTurnNumber;
    setTurns((t) => [
      ...t,
      { role: 'user', content: trimmed, turnNumber: userTurnNumber },
    ]);
    setInput('');
    setStatus({ kind: 'sending' });

    try {
      const res = await fetch(`/api/session/${token}/phase2/message`, {
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
        coachMessage: string;
        turnNumber: number;
        estimatedLevel: number;
      };
      setTurns((t) => [
        ...t,
        {
          role: 'coach',
          content: data.coachMessage,
          turnNumber: data.turnNumber,
        },
      ]);
      setCoachTurnNumber(data.turnNumber);
      setLevel(data.estimatedLevel);
      setStatus({ kind: 'ready' });
    } catch {
      setStatus({ kind: 'error', message: 'Error de red.' });
    }
  };

  const close = async () => {
    setStatus({ kind: 'closing' });
    try {
      const res = await fetch(`/api/session/${token}/phase2/finish`, {
        method: 'POST',
      });
      if (!res.ok) {
        setStatus({
          kind: 'error',
          message: 'No se pudo cerrar la sesión. Inténtalo otra vez.',
        });
        return;
      }
      router.refresh();
    } catch {
      setStatus({ kind: 'error', message: 'Error de red cerrando sesión.' });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 md:py-10">
      <header className="mb-4 flex items-baseline justify-between">
        <p className="text-sm uppercase tracking-wide text-neutral-500">
          Coach AI · Sesión
        </p>
        <p className="text-sm text-neutral-600" aria-live="polite">
          {coachTurnNumber}/50 · nivel {level}
        </p>
      </header>

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
          placeholder="Escribe tu respuesta…"
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

      <button
        type="button"
        onClick={close}
        disabled={status.kind === 'closing' || status.kind === 'sending'}
        className="mt-3 rounded border border-neutral-300 px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === 'closing'
          ? 'Cerrando sesión…'
          : 'Cerrar sesión y ver informe'}
      </button>
    </main>
  );
}
