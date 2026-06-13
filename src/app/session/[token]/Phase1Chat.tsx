'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useOnlineStatus } from '@/lib/client/use-online-status';
import type { ResumeLinkData } from '@/lib/session/resume-link';
import { OfflineBanner } from './OfflineBanner';
import { SupportTicket } from './SupportTicket';

// Banco de ítems importado directamente para renderizar preguntas como UI
// estructurada. El JSON es un asset estático del producto.
import bancoData from '@/data/banco-items-disc.json';

type DiscLetter = 'A' | 'B' | 'C' | 'D';
const LETTERS: readonly DiscLetter[] = ['A', 'B', 'C', 'D'];

interface BancoItem {
  id: number;
  escenario: string;
  pregunta: string;
  opciones: Record<DiscLetter, { texto: string }>;
}

const BANCO_ITEMS = bancoData.items as unknown as readonly BancoItem[];

type Screen = 'intro' | 'question' | 'done';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'sending' }
  | { kind: 'synthesizing' }
  | { kind: 'reprompt'; hint: string }
  | { kind: 'error'; message: string; technical?: string };

const SUPPORT_THRESHOLD_MS = 30_000;

function CopySessionLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* el usuario puede copiar la URL manualmente */ }
  }

  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-xs leading-relaxed text-neutral-600">
        <span className="font-medium">Copia este enlace antes de empezar.</span>{' '}
        Si la sesión se interrumpe por un problema técnico, podrás retomar pegándolo como dirección en tu navegador.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Enlace de la sesión"
          className="min-w-0 flex-1 rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-md bg-stone-800 px-3 py-1 text-xs font-medium text-white transition hover:bg-stone-700"
        >
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

const INTRO_TEXT =
  'Antes de comenzar la sesión de coaching, necesito hacerte unas preguntas.\n\nLo que vas a encontrar puede parecerte desconectado de la situación que has traído hoy. No lo está: tus respuestas me ayudan a entender cómo tomas decisiones, cómo te relacionas con el entorno y cómo afrontas los momentos de incertidumbre. Sin ese contexto, la sesión sería mucho más superficial.\n\nNo hay respuestas correctas ni incorrectas. Elige la que más se acerque a cómo eres habitualmente, no a cómo te gustaría ser.';

export function Phase1Chat({
  token,
  resumeLink,
}: {
  token: string;
  resumeLink: ResumeLinkData;
}) {
  const router = useRouter();
  const online = useOnlineStatus();

  const [screen, setScreen] = useState<Screen>('intro');
  const [itemIndex, setItemIndex] = useState(0);
  const [selected, setSelected] = useState<DiscLetter | null>(null);
  const [freeText, setFreeText] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [errorSince, setErrorSince] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (errorSince === null) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [errorSince]);

  // Scroll al inicio en cada cambio de pantalla o pregunta
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [screen, itemIndex]);

  const isBusy =
    status.kind === 'loading' ||
    status.kind === 'sending' ||
    status.kind === 'synthesizing';

  const showSupport =
    errorSince !== null &&
    now - errorSince >= SUPPORT_THRESHOLD_MS &&
    online &&
    status.kind === 'error';

  const progressPct =
    screen === 'done'
      ? 100
      : screen === 'question'
        ? ((itemIndex + 1) / 16) * 100
        : 0;

  const currentItem = BANCO_ITEMS[itemIndex] ?? BANCO_ITEMS[0]!;

  // ── Acciones ──────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!online || isBusy) return;
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch(`/api/session/${token}/phase1/start`, {
        method: 'POST',
      });
      if (res.status === 409) {
        router.refresh();
        return;
      }
      if (!res.ok) {
        setStatus({
          kind: 'error',
          message: 'No se pudo cargar el cuestionario. Inténtalo de nuevo.',
          technical: `phase1/start → HTTP ${res.status}`,
        });
        setErrorSince(Date.now());
        return;
      }
      const data = (await res.json()) as { itemIndex: number };
      setItemIndex(data.itemIndex);
      setSelected(null);
      setFreeText('');
      setErrorSince(null);
      setStatus({ kind: 'idle' });
      setScreen('question');
    } catch {
      setStatus({
        kind: 'error',
        message: 'Error de red. Comprueba tu conexión.',
        technical: 'phase1/start → network error',
      });
      setErrorSince(Date.now());
    }
  };

  const handleSubmit = async () => {
    if (!selected || !online || isBusy) return;
    const userMessage = freeText.trim()
      ? `${selected} ${freeText.trim()}`
      : selected;
    setStatus({ kind: 'sending' });
    setErrorSince(null);
    try {
      const res = await fetch(`/api/session/${token}/phase1/next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      if (res.status === 409) {
        router.refresh();
        return;
      }
      if (!res.ok) {
        setStatus({
          kind: 'error',
          message: 'No se pudo enviar tu respuesta.',
          technical: `phase1/next → HTTP ${res.status}`,
        });
        setErrorSince(Date.now());
        return;
      }
      const data = (await res.json()) as {
        adminMessage: string;
        itemIndex: number;
        done: boolean;
        parsedLetter: DiscLetter | null;
      };
      if (data.done) {
        setScreen('done');
        setStatus({ kind: 'idle' });
        return;
      }
      if (data.parsedLetter !== null) {
        setItemIndex(data.itemIndex);
        setSelected(null);
        setFreeText('');
        setStatus({ kind: 'idle' });
      } else {
        // No debería ocurrir con botones, pero se gestiona por robustez
        setStatus({ kind: 'reprompt', hint: data.adminMessage });
      }
    } catch {
      setStatus({
        kind: 'error',
        message: 'Error de red.',
        technical: 'phase1/next → network error',
      });
      setErrorSince(Date.now());
    }
  };

  const handleFinish = async () => {
    if (!online || status.kind === 'synthesizing') return;
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
          message: 'No se pudo generar el hand-off. Vuelve a intentarlo.',
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
            const ev = JSON.parse(line) as {
              type: string;
              message?: string;
              code?: string;
            };
            if (ev.type === 'done') {
              router.refresh();
              return;
            }
            if (ev.type === 'error') {
              setStatus({
                kind: 'error',
                message: ev.message ?? 'No se pudo generar el hand-off.',
                technical: `phase1/finish → error: ${ev.code}`,
              });
              setErrorSince(Date.now());
              break outer;
            }
          } catch {
            /* línea malformada */
          }
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 md:py-10">
      {/* Header: etiqueta + contador + barra de progreso */}
      <header className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
            Cuestionario de perfil
          </p>
          {screen === 'question' && (
            <p className="text-xs tabular-nums text-neutral-400">
              {itemIndex + 1}&nbsp;de&nbsp;16
            </p>
          )}
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

      <OfflineBanner />

      {/* ── Pantalla: intro ─────────────────────────────────────────────── */}
      {screen === 'intro' && (
        <div className="flex flex-1 flex-col gap-4">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="whitespace-pre-wrap text-[15px] leading-[1.75] text-neutral-700">
              {INTRO_TEXT}
            </p>
          </div>

          {status.kind === 'error' && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <p>{status.message}</p>
              {showSupport && (
                <div className="mt-2">
                  <SupportTicket
                    token={token}
                    phase="phase1"
                    technical={status.technical}
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={isBusy || !online}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'loading' ? 'Cargando…' : 'Empezamos'}
          </button>
          <CopySessionLink url={resumeLink.url} />
        </div>
      )}

      {/* ── Pantalla: pregunta ──────────────────────────────────────────── */}
      {screen === 'question' && (
        <div
          key={itemIndex}
          className="flex flex-1 flex-col gap-4 animate-slide-in"
        >
          <div className="rounded-xl bg-white p-6 shadow-sm">
            {/* Escenario */}
            <p className="mb-4 text-sm leading-relaxed text-neutral-500">
              {currentItem.escenario}
            </p>

            {/* Pregunta */}
            <p className="mb-6 text-base font-semibold leading-snug text-neutral-900">
              {currentItem.pregunta}
            </p>

            {/* Opciones 2 × 2 */}
            <div className="mb-5 grid grid-cols-2 gap-3">
              {LETTERS.map((letter) => {
                const isSelected = selected === letter;
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => {
                      setSelected(isSelected ? null : letter);
                      if (status.kind === 'reprompt')
                        setStatus({ kind: 'idle' });
                    }}
                    disabled={isBusy}
                    aria-pressed={isSelected}
                    className={[
                      'flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all duration-150',
                      isSelected
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-800 hover:border-stone-300 hover:bg-stone-50',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'text-[11px] font-bold uppercase tracking-widest',
                        isSelected ? 'text-stone-300' : 'text-stone-400',
                      ].join(' ')}
                    >
                      {letter}
                    </span>
                    <span className="text-sm leading-snug">
                      {currentItem.opciones[letter].texto}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Texto libre opcional */}
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  selected &&
                  !isBusy
                ) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Añade un matiz si quieres (opcional)…"
              disabled={isBusy}
              rows={2}
              className="w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 disabled:opacity-60"
            />
          </div>

          {/* Reprompt (caso raro con botones) */}
          {status.kind === 'reprompt' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {status.hint}
            </div>
          )}

          {/* Error */}
          {status.kind === 'error' && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <p>{status.message}</p>
              {showSupport && (
                <div className="mt-2">
                  <SupportTicket
                    token={token}
                    phase="phase1"
                    technical={status.technical}
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!selected || isBusy || !online}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'sending'
              ? 'Enviando…'
              : itemIndex < 15
                ? 'Siguiente →'
                : 'Finalizar cuestionario'}
          </button>
        </div>
      )}

      {/* ── Pantalla: finalizado ────────────────────────────────────────── */}
      {screen === 'done' && (
        <div className="flex flex-1 flex-col gap-4 animate-slide-in">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-[15px] leading-[1.75] text-neutral-700">
              Perfecto. Hemos terminado el cuestionario. Ahora comienza tu
              sesión de coaching personalizada. ¡Adelante!
            </p>
          </div>

          {status.kind === 'error' && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <p>{status.message}</p>
              {showSupport && (
                <div className="mt-2">
                  <SupportTicket
                    token={token}
                    phase="phase1"
                    technical={status.technical}
                  />
                </div>
          )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={status.kind === 'synthesizing' || !online}
            className="w-full rounded-lg bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === 'synthesizing'
              ? 'Preparando tu sesión de coaching…'
              : 'Continuar a la sesión de coaching'}
          </button>
        </div>
      )}
    </main>
  );
}
