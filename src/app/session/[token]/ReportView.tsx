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
            'No se pudo enviar el email. Inténtalo de nuevo o descárgalo manualmente.',
        });
        return;
      }
      setEmailStatus({ kind: 'sent' });
      setEmail('');
    } catch {
      setEmailStatus({
        kind: 'error',
        message: 'Error de red. Inténtalo de nuevo.',
      });
    }
  };

  const close = useCallback(async () => {
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`/api/session/${token}/close`, {
        method: 'POST',
      });
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

  // El timer se mantiene en un ref para que los efectos sólo dependan de
  // `expiresAt` y la referencia estable de `close` (useCallback).
  const autoClosedRef = useRef(false);

  useEffect(() => {
    if (expiresAt === null) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  useEffect(() => {
    if (expiresAt === null) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      if (!autoClosedRef.current) {
        autoClosedRef.current = true;
        void close();
      }
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
    <main className="mx-auto max-w-2xl px-6 py-10 text-base md:text-[17px]">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-wide text-neutral-500">
          Coach AI
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Informe de tu sesión
        </h1>
      </header>

      {report.parseStatus === 'parsed' ? (
        <ol className="space-y-6 list-decimal pl-5">
          {REPORT_BLOCK_KEYS.map((key) => (
            <li key={key}>
              <h2 className="font-semibold text-neutral-900">
                {BLOCK_TITLES[key]}
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-neutral-800">
                {report.blocks[key] ?? '—'}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <section className="rounded border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            El informe no pudo parsearse en los 11 bloques. Contenido bruto:
          </p>
          <pre className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">
            {report.rawText}
          </pre>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="mt-6 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <section className="mt-10 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => download('pdf')}
            disabled={downloading !== null}
            className="w-full rounded bg-neutral-900 px-4 py-3 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading === 'pdf' ? 'Preparando PDF…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            onClick={() => download('docx')}
            disabled={downloading !== null}
            className="w-full rounded bg-neutral-900 px-4 py-3 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading === 'docx' ? 'Preparando DOCX…' : 'Descargar Word'}
          </button>
        </div>

        {hasDownloaded && expiresAt !== null && (
          <p className="text-sm text-neutral-600">
            Ya has descargado tu informe. Puedes volver a descargarlo dentro de
            los próximos 10 minutos. La sesión se cerrará automáticamente en{' '}
            <span className="font-medium text-neutral-800" aria-live="polite">
              {formatRemaining(expiresAt - now)}
            </span>
            .
          </p>
        )}

        {emailEnabled && (
          <div className="mt-4 rounded border border-neutral-200 bg-neutral-50 p-4">
            {emailStatus.kind === 'sent' ? (
              <p className="text-sm text-neutral-700" role="status">
                Copia enviada por email. Revisa tu bandeja de entrada (o
                spam). No guardamos tu dirección: sólo una marca técnica
                para impedir reenvíos.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendEmail();
                }}
                className="space-y-3"
              >
                <div>
                  <label
                    htmlFor="report-email"
                    className="block text-sm font-medium text-neutral-900"
                  >
                    Envíame una copia por email (opcional)
                  </label>
                  <p className="mt-1 text-xs text-neutral-600">
                    Tu dirección viaja al proveedor de email y no se guarda
                    en nuestros servidores. Un solo envío por sesión.
                  </p>
                </div>
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
                    className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={
                      emailStatus.kind === 'sending' ||
                      email.trim().length === 0
                    }
                    className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {emailStatus.kind === 'sending' ? 'Enviando…' : 'Enviarme copia'}
                  </button>
                </div>
                {emailStatus.kind === 'error' && (
                  <p
                    role="alert"
                    className="text-sm text-red-800"
                  >
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
          className="mt-2 w-full rounded border border-neutral-300 bg-white px-4 py-3 text-neutral-800 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {closing ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </section>
    </main>
  );
}
