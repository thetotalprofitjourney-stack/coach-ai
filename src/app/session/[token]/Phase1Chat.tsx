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
  pending?: boolean;
};

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'sending' }
  | { kind: 'synthesizing' }
  | { kind: 'error'; message: string; technical?: string };

const SUPPORT_THRESHOLD_MS = 30_000;

// Mensaje introductorio que aparece siempre antes del primer ítem DISC.
// Explica al usuario por qué existe el cuestionario y evita la sensación
// de desconexión con la sesión de coaching.
const DISC_INTRO: Message = {
  role: 'admin',
  content:
    'Antes de comenzar la sesión de coaching, necesito hacerte unas preguntas.\n\nLo que vas a encontrar puede parecerte desconectado de la situación que has traído hoy. No lo está: tus respuestas me ayudan a entender cómo tomas decisiones, cómo te relacionas con el entorno y cómo afrontas los momentos de incertidumbre. Sin ese contexto, la sesión sería mucho más superficial.\n\nNo hay respuestas correctas ni incorrectas. Elige la que más se acerque a cómo eres habitualmente, no a cómo te gustaría ser.\n\nSon 16 situaciones. Cuando terminemos, empezamos.',
};

export function Phase1Chat({
  token,
  resumeLink,
}: {
  token: string;
  resumeLink: ResumeLinkData;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  // El intro DISC siempre es el primer mensaje; el administrador lo sigue.
  const [messages, setMessages] = useState<Message[]>([DISC_INTRO]);
  const [itemIndex, setItemIndex] = useState(0);
  const [done, setDone] = useState(false);
  const inputDraft = useInputDraft(`${token}:phase1-input`);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [errorSince, setErrorSince] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const bootstrappedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        setMessages((m) => [...m, { role: 'admin', content: data.adminMessage }]);
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

  useEffect(() => {
    if (errorSince === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [errorSince]);

  // Auto-foco en el input cuando el cuestionario está listo para recibir
  // respuesta, para que el usuario pueda escribir sin hacer clic.
  useEffect(() => {
    if (status.kind === 'ready' && !done) {
      inputRef.current?.focus();
    }
  }, [status.kind, done]);

  const doSend = async (text: string, isRetry: boolean) => {
    setStatus({ kind: 'sending' });
    setErrorSince(null);
    if (!isRetry) {
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

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as { type: string; message?: string; code?: string };
            if (ev.type === 'done') { router.refresh(); return; }
            if (ev.type === 'error') {
              setStatus({
                kind: 'error',
                message: ev.message ?? 'No se pudo generar el hand-off.',
                technical: `phase1/finish → error: ${ev.code}`,
              });
              setErrorSince(Date.now());
              break outer;
            }
          } catch { /* malformed line, skip */ }
        }
      }
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

  // Porcentaje de progreso para la barra silenciosa.
  const progressPct = done
    ? 100
    : status.kind !== 'loading'
      ? ((itemIndex + 1) / 16) * 100
      : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 md:py-10">
      {/* Header mínimo: etiqueta + barra de progreso silenciosa */}
      <header className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
            Cuestionario de perfil
          </p>
        </div>
        <div
          className="h-0.5 w-full overflow-hidden rounded-full bg-neutral-100"
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso del cuestionario"
        >
          <div
            className="h-full rounded-full bg-stone-400 transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </header>

      <ResumeLinkNotice url={resumeLink.url} expiresAt={resumeLink.expiresAt} />
      <OfflineBanner />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl bg-white p-5"
        aria-live="polite"
      >
        <ul className="space-y-4">
          {messages.map((m, i) => (
            <li key={i} className={m.role === 'admin' ? '' : 'flex justify-end'}>
              <div
                className={
                  m.role === 'admin'
                    ? /* Primer mensaje (intro): tono suave y cálido; el resto, tarjeta limpia */
                      i === 0
                      ? 'rounded-xl bg-stone-50 px-5 py-4 text-neutral-700'
                      : 'rounded-xl bg-white px-5 py-4 text-neutral-800 shadow-sm'
                    : /* Mensajes del usuario: claros, a la derecha */
                      `max-w-[85%] rounded-xl bg-stone-100 px-5 py-4 text-neutral-800 ${m.pending ? 'opacity-50' : ''}`
                }
              >
                <p className="whitespace-pre-wrap text-[15px] leading-[1.75]">
                  {m.content}
                </p>
                {m.pending && (
                  <p className="mt-2 text-xs text-stone-400">
                    No se pudo enviar — pendiente de reintento.
                  </p>
                )}
              </div>
            </li>
          ))}
          {/* Indicador de carga tras el intro mientras llega el primer ítem */}
          {status.kind === 'loading' && (
            <li className="flex items-center gap-2 px-1">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-stone-300" />
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-stone-300 [animation-delay:0.2s]" />
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-stone-300 [animation-delay:0.4s]" />
            </li>
          )}
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
              phase="phase1"
              technical={status.technical}
            />
          )}
        </div>
      )}

      {done ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-neutral-600">
            Has completado las 16 situaciones. Ahora prepararé tu sesión de
            coaching.
          </p>
          <button
            type="button"
            onClick={finish}
            disabled={synthesizing || !online}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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
            ref={inputRef}
            type="text"
            value={inputDraft.value}
            onChange={(e) => inputDraft.setValue(e.target.value)}
            placeholder="Escribe A, B, C o D (y lo que quieras añadir)…"
            disabled={status.kind !== 'ready' || hasPending}
            aria-label="Tu respuesta"
            className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={
              status.kind !== 'ready' ||
              hasPending ||
              !online ||
              inputDraft.value.trim().length === 0
            }
            className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'sending' ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}
    </main>
  );
}
