'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { consumeCoachStream } from '@/lib/api/coach-stream-client';
import { useInputDraft } from '@/lib/client/use-input-draft';
import { useOnlineStatus } from '@/lib/client/use-online-status';
import { OfflineBanner } from './OfflineBanner';
import { SupportTicket } from './SupportTicket';

type ChatTurn = {
  role: 'coach' | 'user';
  content: string;
  turnNumber: number;
  pending?: boolean;
};

type Status =
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'streaming' }
  | { kind: 'closing' }
  | { kind: 'error'; message: string; technical?: string };

const SUPPORT_THRESHOLD_MS = 30_000;

// Tope de turnos del coach. Debe coincidir con MAX_COACH_TURNS en
// render-state.ts (valor 50). No lo importamos aquí para evitar arrastrar
// dependencias de servidor a un client component.
const MAX_COACH_TURNS = 50;

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
  const online = useOnlineStatus();
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [coachTurnNumber, setCoachTurnNumber] = useState(initialCoachTurnNumber);
  const [level, setLevel] = useState(initialLevel);
  const inputDraft = useInputDraft(`${token}:phase2-input`);
  const [status, setStatus] = useState<Status>({ kind: 'ready' });
  const [errorSince, setErrorSince] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [turns]);

  useEffect(() => {
    if (errorSince === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [errorSince]);

  // Auto-foco en el textarea cuando la sesión está lista para recibir
  // respuesta. Evita que el usuario tenga que hacer clic para empezar a escribir.
  useEffect(() => {
    if (status.kind === 'ready' && coachTurnNumber < MAX_COACH_TURNS) {
      textareaRef.current?.focus();
    }
  });

  const markError = (message: string, technical?: string) => {
    setStatus({ kind: 'error', message, technical });
    setErrorSince((prev) => prev ?? Date.now());
  };

  const clearError = () => {
    setErrorSince(null);
  };

  const doSend = async (text: string, isRetry: boolean) => {
    const userTurnNumber = coachTurnNumber;
    const streamingCoachTurnNumber = coachTurnNumber + 1;

    if (!isRetry) {
      setTurns((t) => [
        ...t,
        {
          role: 'user',
          content: text,
          turnNumber: userTurnNumber,
          pending: true,
        },
      ]);
      inputDraft.clear();
    }
    setStatus({ kind: 'sending' });
    clearError();

    try {
      const res = await fetch(`/api/session/${token}/phase2/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: text }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          router.refresh();
          return;
        }
        markError(
          'No se pudo enviar tu respuesta.',
          `phase2/message → HTTP ${res.status}`,
        );
        return;
      }

      let coachPlaceholderInserted = false;
      let streamingContent = '';

      const streamOk = await consumeCoachStream(res, {
        onDelta: (delta) => {
          streamingContent += delta;
          if (!coachPlaceholderInserted) {
            coachPlaceholderInserted = true;
            setStatus({ kind: 'streaming' });
            setTurns((t) => [
              ...t,
              {
                role: 'coach',
                content: streamingContent,
                turnNumber: streamingCoachTurnNumber,
              },
            ]);
          } else {
            setTurns((t) => {
              const next = [...t];
              const last = next[next.length - 1];
              if (
                last &&
                last.role === 'coach' &&
                last.turnNumber === streamingCoachTurnNumber
              ) {
                next[next.length - 1] = { ...last, content: streamingContent };
              }
              return next;
            });
          }
        },
        onDone: (event) => {
          const turnNumber =
            typeof event.turnNumber === 'number'
              ? event.turnNumber
              : streamingCoachTurnNumber;
          const estimatedLevel =
            typeof event.estimatedLevel === 'number'
              ? event.estimatedLevel
              : level;
          setTurns((t) => {
            const next = [...t];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'user' && next[i].pending) {
                next[i] = { ...next[i], pending: false };
                break;
              }
            }
            const last = next[next.length - 1];
            if (
              last &&
              last.role === 'coach' &&
              last.turnNumber === streamingCoachTurnNumber
            ) {
              next[next.length - 1] = {
                ...last,
                content: streamingContent.trim(),
                turnNumber,
              };
            }
            return next;
          });
          setCoachTurnNumber(turnNumber);
          setLevel(estimatedLevel);
        },
        onError: ({ message, code }) => {
          setTurns((t) =>
            t.filter(
              (turn) =>
                !(
                  turn.role === 'coach' &&
                  turn.turnNumber === streamingCoachTurnNumber
                ),
            ),
          );
          markError(
            message || 'No se pudo generar la respuesta del coach.',
            `phase2/message stream error (${code || 'UNKNOWN'})`,
          );
        },
      });

      if (streamOk) {
        setStatus({ kind: 'ready' });
        clearError();
      }
    } catch {
      markError('Error de red.', 'phase2/message → network error');
    }
  };

  const send = async () => {
    const trimmed = inputDraft.value.trim();
    if (!trimmed || status.kind !== 'ready' || !online) return;
    void doSend(trimmed, false);
  };

  const retry = async () => {
    if (!online) return;
    const pending = [...turns].reverse().find((t) => t.pending);
    if (!pending) return;
    void doSend(pending.content, true);
  };

  const discard = () => {
    const pendingIdx = [...turns]
      .map((t, i) => ({ t, i }))
      .reverse()
      .find(({ t }) => t.pending)?.i;
    if (pendingIdx === undefined) return;
    const recovered = turns[pendingIdx].content;
    setTurns((t) => t.filter((_, i) => i !== pendingIdx));
    inputDraft.setValue(recovered);
    setStatus({ kind: 'ready' });
    clearError();
  };

  const close = async () => {
    setStatus({ kind: 'closing' });
    clearError();
    try {
      const res = await fetch(`/api/session/${token}/phase2/finish`, {
        method: 'POST',
      });
      if (!res.ok) {
        markError(
          'No se pudo generar el informe. Inténtalo otra vez.',
          `phase2/finish → HTTP ${res.status}`,
        );
        return;
      }
      router.refresh();
    } catch {
      markError('Error de red cerrando sesión.', 'phase2/finish → network error');
    }
  };

  const hasPending = turns.some((t) => t.pending);
  const showSupport =
    status.kind === 'error' &&
    errorSince !== null &&
    now - errorSince >= SUPPORT_THRESHOLD_MS &&
    online;

  // Al llegar al tope la sesión ha concluido: el coach ha generado el
  // resumen y el usuario sólo necesita descargarlo.
  const sessionConcluded = coachTurnNumber >= MAX_COACH_TURNS;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 md:py-10">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-neutral-400">
            Coach AI
          </p>
          <p className="mt-0.5 text-sm font-medium text-neutral-700">
            Sesión de coaching
          </p>
        </div>
        {/* El nivel de profundización se muestra sólo como referencia interna;
            el contador de turnos se omite deliberadamente para no generar
            ansiedad en el usuario durante la sesión. */}
        {level > 1 && (
          <p className="text-xs text-neutral-400" aria-hidden="true">
            profundidad {level}
          </p>
        )}
      </header>

      <OfflineBanner />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 p-4"
        aria-live="polite"
      >
        <ul className="space-y-3">
          {turns.map((t, i) => (
            <li
              key={`${t.turnNumber}-${t.role}-${i}`}
              className={
                t.role === 'coach'
                  ? 'rounded-lg bg-white p-4 text-neutral-900 shadow-sm'
                  : `rounded-lg bg-stone-800 p-4 text-white ${t.pending ? 'opacity-60' : ''}`
              }
            >
              {t.role === 'coach' && (
                <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400">
                  Coach
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.content}</p>
              {t.pending && (
                <p className="mt-2 text-xs italic text-white/60">
                  Pendiente de enviar — reintenta cuando quieras.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {status.kind === 'error' && (
        <div
          role="alert"
          className="mt-3 space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
        >
          <p>{status.message}</p>
          {hasPending && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void retry()}
                disabled={!online}
                className="rounded bg-red-800 px-3 py-1 text-xs font-medium text-white hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={discard}
                className="rounded border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
              >
                Descartar y editar
              </button>
            </div>
          )}
          {showSupport && (
            <SupportTicket
              token={token}
              phase="phase2"
              technical={status.technical}
            />
          )}
        </div>
      )}

      {sessionConcluded ? (
        /* Estado de cierre natural: la sesión ha llegado a su fin.
           El coach ha dejado el resumen arriba; ahora el usuario genera
           su informe cuando esté listo. */
        <div className="mt-5 space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-5">
          <p className="text-sm font-medium text-stone-800">
            La sesión ha concluido
          </p>
          <p className="text-sm leading-relaxed text-stone-600">
            El resumen de lo trabajado está arriba. Cuando estés listo,
            genera tu informe y descárgalo.
          </p>
          <button
            type="button"
            onClick={close}
            disabled={status.kind === 'closing' || !online}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'closing'
              ? 'Generando tu informe…'
              : 'Generar informe y descargarlo'}
          </button>
        </div>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="mt-4 flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={inputDraft.value}
              onChange={(e) => {
                inputDraft.setValue(e.target.value);
                // Auto-resize
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                // Enter envía; Shift+Enter inserta salto de línea
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Escribe tu respuesta… (Enter para enviar)"
              disabled={status.kind !== 'ready' || hasPending}
              aria-label="Tu respuesta"
              className="flex-1 resize-none overflow-hidden rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 disabled:opacity-60"
              style={{ minHeight: '2.75rem', maxHeight: '12rem' }}
            />
            <button
              type="submit"
              disabled={
                status.kind !== 'ready' ||
                hasPending ||
                !online ||
                inputDraft.value.trim().length === 0
              }
              className="shrink-0 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status.kind === 'sending'
                ? 'Pensando…'
                : status.kind === 'streaming'
                  ? 'Escribiendo…'
                  : 'Enviar'}
            </button>
          </form>

          <button
            type="button"
            onClick={close}
            disabled={
              status.kind === 'closing' ||
              status.kind === 'sending' ||
              status.kind === 'streaming'
            }
            className="mt-3 rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'closing'
              ? 'Generando tu informe…'
              : 'Cerrar sesión y ver informe'}
          </button>
        </>
      )}
    </main>
  );
}
