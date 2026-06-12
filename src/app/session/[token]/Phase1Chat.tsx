'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useInputDraft } from '@/lib/client/use-input-draft';
import { useOnlineStatus } from '@/lib/client/use-online-status';
import type { ResumeLinkData } from '@/lib/session/resume-link';
import { OfflineBanner } from './OfflineBanner';
import { ResumeLinkNotice } from './ResumeLinkNotice';
import { SupportTicket } from './SupportTicket';

type Message = {
  role: 'admin' | 'user';
  content: string;
  // Marcador del último mensaje del usuario cuyo envío falló y está a
  // la espera de reintento. Mientras sea true, el mensaje se renderiza
  // con opacidad reducida y aparecen los botones "Reintentar" / "Descartar".
  pending?: boolean;
};

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'synthesizing' }
  | { kind: 'error'; message: string; technical?: string };

// Retraso (ms) tras el cual, si el estado sigue en error, aparece el
// botón de ticket de soporte. 30 s evita que aparezca tras un fallo
// fugaz que se resuelva al primer reintento.
const SUPPORT_THRESHOLD_MS = 30_000;

export function Phase1Chat({
  token,
  resumeLink,
}: {
  token: string;
  resumeLink: ResumeLinkData;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [messages, setMessages] = useState<Message[]>([]);
  const [itemIndex, setItemIndex] = useState(0);
  const [done, setDone] = useState(false);
  const inputDraft = useInputDraft(`${token}:phase1-input`);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  // Cuándo entró el estado actual en "error" (epoch ms). Null si no
  // estamos en error ahora mismo. Se usa para mostrar el soporte tras
  // SUPPORT_THRESHOLD_MS.
  const [errorSince, setErrorSince] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
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
            technical: `phase1/start → HTTP ${res.status}`,
          });
          setErrorSince(Date.now());
          return;
        }
        const data = (await res.json()) as {
          adminMessage: string;
          itemIndex: number;
        };
        setMessages([{ role: 'admin', content: data.adminMessage }]);
        setItemIndex(data.itemIndex);
        setStatus({ kind: 'ready' });
        setErrorSince(null);
      } catch {
        setStatus({
          kind: 'error',
          message: 'Error de red al arrancar.',
          technical: 'phase1/start → network error',
        });
        setErrorSince(Date.now());
      }
    })();
  }, [token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  // Tick de 1s para que `now` avance y el threshold del soporte se
  // evalúe sin recargar la página. Sólo corre mientras hay error.
  useEffect(() => {
    if (errorSince === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [errorSince]);

  // Envía (o reintenta) una respuesta. Si `text` viene explícito se
  // reutiliza el último pending; si no, se coge del input. Separa
  // fetch de la manipulación del estado para poder reintentar.
  const doSend = async (text: string, isRetry: boolean) => {
    setStatus({ kind: 'sending' });
    setErrorSince(null);
    if (!isRetry) {
      // Marca el mensaje optimista como pending; si el envío funciona,
      // limpiamos el flag más abajo.
      setMessages((m) => [
        ...m,
        { role: 'user', content: text, pending: true },
      ]);
      inputDraft.clear();
    }

    try {
      const res = await fetch(`/api/session/${token}/phase1/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: text }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          router.refresh();
          return;
        }
        setStatus({
          kind: 'error',
          message: 'No se pudo enviar tu respuesta.',
          technical: `phase1/next → HTTP ${res.status}`,
        });
        setErrorSince((prev) => prev ?? Date.now());
        return;
      }
      const data = (await res.json()) as {
        adminMessage: string;
        itemIndex: number;
        done: boolean;
      };
      setMessages((m) => {
        // Quita el flag `pending` del último user turn, si existe.
        const next = [...m];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'user' && next[i].pending) {
            next[i] = { ...next[i], pending: false };
            break;
          }
        }
        return [...next, { role: 'admin', content: data.adminMessage }];
      });
      setItemIndex(data.itemIndex);
      setDone(data.done);
      setStatus({ kind: 'ready' });
      setErrorSince(null);
    } catch {
      setStatus({
        kind: 'error',
        message: 'Error de red.',
        technical: 'phase1/next → network error',
      });
      setErrorSince((prev) => prev ?? Date.now());
    }
  };

  const send = async () => {
    const trimmed = inputDraft.value.trim();
    if (!trimmed || status.kind !== 'ready' || !online) return;
    void doSend(trimmed, false);
  };

  const retry = async () => {
    const pending = [...messages].reverse().find((m) => m.pending);
    if (!pending) return;
    void doSend(pending.content, true);
  };

  const discard = () => {
    // Recupera el texto al input para que el usuario lo edite si quiere;
    // quita el turno pending y vuelve a ready.
    const pendingIdx = [...messages]
      .map((m, i) => ({ m, i }))
      .reverse()
      .find(({ m }) => m.pending)?.i;
    if (pendingIdx === undefined) return;
    const recovered = messages[pendingIdx].content;
    setMessages((m) => m.filter((_, i) => i !== pendingIdx));
    inputDraft.setValue(recovered);
    setStatus({ kind: 'ready' });
    setErrorSince(null);
  };

  const finish = async () => {
    setStatus({ kind: 'synthesizing' });
    setErrorSince(null);
    try {
      const res = await fetch(`/api/session/${token}/phase1/finish`, {
        method: 'POST',
      });
      // 409 means synthesis already completed (gateway timeout on first attempt
      // but the server finished) — treat as success and navigate forward.
      if (res.status === 409) {
        router.refresh();
        return;
      }
      if (!res.ok) {
        setStatus({
          kind: 'error',
          message:
            'No se pudo generar el hand-off. Vuelve a intentarlo en unos segundos.',
          technical: `phase1/finish → HTTP ${res.status}`,
        });
        setErrorSince(Date.now());
        return;
      }
      router.refresh();
    } catch {
      setStatus({
        kind: 'error',
        message: 'Error de red generando el hand-off.',
        technical: 'phase1/finish → network error',
      });
      setErrorSince(Date.now());
    }
  };

  const synthesizing = status.kind === 'synthesizing';
  const hasPending = messages.some((m) => m.pending);
  const showSupport =
    errorSince !== null && now - errorSince >= SUPPORT_THRESHOLD_MS && online;

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
      <OfflineBanner />

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
                  : `rounded bg-neutral-900 p-3 text-white ${m.pending ? 'opacity-60' : ''}`
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.pending && (
                <p className="mt-1 text-xs italic text-white/70">
                  No se pudo enviar — pendiente de reintento.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {status.kind === 'error' && (
        <div
          role="alert"
          className="mt-3 space-y-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
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
                className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
              >
                Descartar y editar
              </button>
            </div>
          )}
          {showSupport && (
            <SupportTicket
              token={token}
              phase="phase1"
              technical={status.technical}
            />
          )}
        </div>
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
            disabled={synthesizing || !online}
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
            value={inputDraft.value}
            onChange={(e) => inputDraft.setValue(e.target.value)}
            placeholder="Escribe A, B, C o D (y lo que quieras añadir)…"
            disabled={status.kind !== 'ready' || hasPending}
            aria-label="Tu respuesta"
            className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              status.kind !== 'ready' ||
              hasPending ||
              !online ||
              inputDraft.value.trim().length === 0
            }
            className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'sending' ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}
    </main>
  );
}
