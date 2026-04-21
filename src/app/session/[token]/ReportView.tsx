'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  REPORT_BLOCK_KEYS,
  type FinalReportContent,
  type ReportBlockKey,
} from '@/lib/fase2/parse-report';

// Títulos humanos para los 11 bloques (§5.4). El orden corresponde con
// REPORT_BLOCK_KEYS.
const BLOCK_TITLES: Record<ReportBlockKey, string> = {
  objetivo_inicial: 'Objetivo inicial expresado',
  razon_peso: 'Razón de peso identificada',
  significado_terminos_clave: 'Significado concreto de los términos clave',
  objetivo_reformulado: 'Objetivo reformulado',
  capacidades_y_recursos: 'Capacidades y recursos reconocidos',
  carencias_y_puntos_ciegos: 'Carencias y puntos ciegos admitidos',
  riesgos_y_renuncias: 'Riesgos y renuncias identificados',
  decision_tomada: 'Decisión tomada',
  primer_paso: 'Primer paso comprometido',
  senales_revision: 'Señales de revisión',
  preguntas_abiertas: 'Preguntas abiertas',
};

export function ReportView({
  token,
  report,
}: {
  token: string;
  report: FinalReportContent;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <button
        type="button"
        onClick={close}
        disabled={closing}
        className="mt-8 w-full rounded bg-neutral-900 px-4 py-3 text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {closing ? 'Cerrando…' : 'Cerrar sesión'}
      </button>
    </main>
  );
}
