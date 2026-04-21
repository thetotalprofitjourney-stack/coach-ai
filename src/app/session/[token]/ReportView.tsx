'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  REPORT_BLOCK_KEYS,
  type FinalReportContent,
} from '@/lib/fase2/parse-report';
import { BLOCK_TITLES, reportFilename } from '@/lib/report/titles';

type Format = 'pdf' | 'docx';

export function ReportView({
  token,
  report,
  userName,
  createdAt,
  initialDownloadedAt,
}: {
  token: string;
  report: FinalReportContent;
  userName: string | null;
  createdAt: string;
  initialDownloadedAt: string | null;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Format | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState<boolean>(
    initialDownloadedAt !== null,
  );

  // initialDownloadedAt se consume también en el timer de cierre (C3).
  void initialDownloadedAt;

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
      setHasDownloaded(true);
    } catch {
      setError('Error de red durante la descarga.');
    } finally {
      setDownloading(null);
    }
  };

  const close = async () => {
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
  };

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

        {hasDownloaded && (
          <p className="text-sm text-neutral-600">
            Ya has descargado tu informe. Puedes volver a descargarlo dentro de
            los próximos 10 minutos.
          </p>
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
