'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  REPORT_BLOCK_KEYS,
  type FinalReportContent,
} from '@/lib/fase2/parse-report';
import { BLOCK_TITLES, reportFilename } from '@/lib/report/titles';

type Format = 'pdf' | 'docx';

const CLOSE_WINDOW_MS = 10 * 60 * 1000;

function formatRemaining(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type EmailStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

export function ReportView({
  token,
  report,
  userName,
  createdAt,
  initialDownloadedAt,
  initialEmailedAt,
  emailEnabled,
}: {
  token: string;
  report: FinalReportContent;
  userName: string | null;
  createdAt: string;
  initialDownloadedAt: string | null;
  initialEmailedAt: string | null;
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Format | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(() => {
    if (!initialDownloadedAt) return null;
    return new Date(initialDownloadedAt).getTime() + CLOSE_WINDOW_MS;
  });
  const [now, setNow] = useState<number>(() => Date.now());
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState<EmailStatus>(() =>
    initialEmailedAt ? { kind: 'sent' } : { kind: 'idle' },
  );

  const hasDownloaded = expiresAt !== null;
  const createdAtDate = new Date(createdAt);

  const download = async (format: Format) => {
    setDownloading(format);
    setError(null);
    try {
      const res = await fetch(`/api/session/${token}/report/${format}`);
      if (!res.ok) {
        setDownloading(null);
        setError(
          format === 'pdf'
            ? 'No se pudo descargar el PDF.'
            : 'No se pudo descargar el DOCX.',
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reportFilename(userName, createdAtDate, format);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExpiresAt((prev) => prev ?? Date.now() + CLOSE_WINDOW_MS);
    } catch {
      setError('Error de red durante la descarga.');
    } finally {
      setDownloading(null);
    }
  };

  const sendEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed || emailStatus.kind === 'sending' || emailStatus.kind === 'sent') {
      return;
    }
    setEmailStatus({ kind: 'sending' });
    try {
      const res = await fetch(`/api/session/${token}/report/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setEmailStatus({
          kind: 'error',
          message:
            body?.error?.message ||
            'No se pudo enviar el email. Inténtalo de nuevo.',
        });
        return;
      }
      setEmailStatus({ kind: 'sent' });
      setEmail('');
    } catch {
      setEmailStatus({ kind: 'error', message: 'Error de red. Inténtalo de nuevo.' });
    }
  };

  const close = useCallback(async () => {
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${token}/close`, { method: 'POST' });
      if (!res.ok) {
        setClosing(false);
        setError('No se pudo cerrar la sesión.');
        return;
      }
      router.refresh();
    } catch {
      setClosing(false);
      setError('Error de red.');
    }
  }, [token, router]);

  const autoClosedRef = useRef(false);

  useEffect(() => {
    if (expiresAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (expiresAt === null) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      if (!autoClosedRef.current) { autoClosedRef.current = true; void close(); }
      return;
    }
    const id = setTimeout(() => {
      if (autoClosedRef.current) return;
      autoClosedRef.current = true;
      void close();
    }, remaining);
    return () => clearTimeout(id);
  }, [expiresAt, close]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 md:py-14">

      {/* Cabecera personal */}
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
          Coach AI · Informe de sesión
        </p>
        <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          {userName
            ? `Esto es lo que has trabajado, ${userName}.`
            : 'Esto es lo que has trabajado hoy.'}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Una sistematización de lo que tú dijiste. Nada más, nada menos.
        </p>
      </header>

      {/* CTAs de descarga — prominentes, antes del contenido */}
      <div className="mb-10 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => download('pdf')}
          disabled={downloading !== null}
          className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DownloadIcon />
          {downloading === 'pdf' ? 'Preparando PDF…' : 'Descargar PDF'}
        </button>
        <button
          type="button"
          onClick={() => download('docx')}
          disabled={downloading !== null}
          className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-3.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <DownloadIcon />
          {downloading === 'docx' ? 'Preparando Word…' : 'Descargar Word'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* Contenido del informe */}
      {report.parseStatus === 'parsed' ? (
        <ol className="divide-y divide-neutral-100">
          {REPORT_BLOCK_KEYS.map((key, idx) => (
            <li key={key} className="py-7 first:pt-0">
              <div className="flex gap-5">
                {/* Número de sección */}
                <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-500">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                    {BLOCK_TITLES[key]}
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.75] text-neutral-800">
                    {report.blocks[key] ?? (
                      <span className="italic text-neutral-400">—</span>
                    )}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-900">
            El informe no pudo estructurarse en los 11 bloques. Contenido íntegro:
          </p>
          <pre className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-neutral-800">
            {report.rawText}
          </pre>
        </section>
      )}

      {/* Acciones finales */}
      <div className="mt-12 space-y-4 border-t border-neutral-100 pt-10">

        {hasDownloaded && expiresAt !== null && (
          <p className="text-sm text-neutral-500">
            Puedes volver a descargarlo durante{' '}
            <span className="font-medium text-neutral-700" aria-live="polite">
              {formatRemaining(expiresAt - now)}
            </span>
            . Después la sesión se cerrará automáticamente.
          </p>
        )}

        {emailEnabled && (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
            {emailStatus.kind === 'sent' ? (
              <p className="text-sm text-neutral-700" role="status">
                Copia enviada. Revisa tu bandeja de entrada (o spam). No
                guardamos tu dirección: es un envío único.
              </p>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); void sendEmail(); }}
                className="space-y-3"
              >
                <label htmlFor="report-email" className="block text-sm font-medium text-neutral-800">
                  Envíame también una copia por email
                </label>
                <p className="text-xs text-neutral-500">
                  Tu dirección sólo viaja al proveedor de email y no se guarda en nuestros servidores.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="report-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    disabled={emailStatus.kind === 'sending'}
                    autoComplete="email"
                    maxLength={254}
                    className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={emailStatus.kind === 'sending' || email.trim().length === 0}
                    className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {emailStatus.kind === 'sending' ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
                {emailStatus.kind === 'error' && (
                  <p role="alert" className="text-sm text-red-700">
                    {emailStatus.message}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={close}
          disabled={closing}
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {closing ? 'Cerrando sesión…' : 'Cerrar y eliminar datos'}
        </button>
      </div>
    </main>
  );
}

function DownloadIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
  );
}
