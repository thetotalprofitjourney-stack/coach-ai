'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  REPORT_BLOCK_KEYS,
  type FinalReportContent,
} from '@/lib/fase2/parse-report';
import { BLOCK_TITLES } from '@/lib/report/titles';

// ── Renderizado de markdown mínimo ────────────────────────────────────────────
// Soporta: **negrita**, *cursiva*, listas (- / • / 1.), párrafos.
// No usa ninguna dependencia externa.

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-neutral-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return part;
      })}
    </>
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  const listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key++} className="mt-2 space-y-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[0.6em] h-1 w-1 flex-none rounded-full bg-stone-400" />
            <span className="leading-relaxed">{renderInline(item)}</span>
          </li>
        ))}
      </ul>,
    );
    listItems.length = 0;
  };

  for (const line of lines) {
    const t = line.trim();

    if (/^[-•]\s+/.test(t)) {
      listItems.push(t.replace(/^[-•]\s+/, ''));
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      listItems.push(t.replace(/^\d+\.\s+/, ''));
      continue;
    }

    flushList();

    if (t === '') continue;

    if (/^#{1,4}\s/.test(t)) {
      const content = t.replace(/^#{1,4}\s+/, '');
      blocks.push(
        <p key={key++} className="font-semibold text-neutral-900">
          {renderInline(content)}
        </p>,
      );
      continue;
    }

    blocks.push(
      <p key={key++} className="leading-relaxed text-neutral-800">
        {renderInline(t)}
      </p>,
    );
  }

  flushList();
  return <div className="space-y-2">{blocks}</div>;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ReportView({
  token,
  report,
  userName,
}: {
  token: string;
  report: FinalReportContent;
  userName: string | null;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-stone-50 px-5 py-10 md:py-14">
      <div className="mx-auto max-w-2xl">

        {/* Cabecera */}
        <header className="mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
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

        {/* Informe — sin selección de texto */}
        <div
          className="select-none rounded-2xl bg-white px-6 py-8 shadow-sm md:px-10 md:py-10"
          onCopy={(e) => e.preventDefault()}
        >
          {report.parseStatus === 'parsed' ? (
            <ol className="divide-y divide-stone-100">
              {REPORT_BLOCK_KEYS.map((key, idx) => {
                const body = report.blocks[key];
                return (
                  <li key={key} className="py-8 first:pt-0 last:pb-0">
                    <div className="flex gap-5">
                      <span className="mt-0.5 w-6 flex-none text-right text-sm font-light tabular-nums text-stone-300">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                          {BLOCK_TITLES[key]}
                        </h2>
                        <div className="text-[15px]">
                          {body ? (
                            renderMarkdown(body)
                          ) : (
                            <span className="italic text-neutral-300">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="space-y-3 text-[15px] text-neutral-500">
              <p className="leading-relaxed">
                La sesión se cerró antes de que el coach hubiera generado el
                informe completo. No hay información suficiente sistematizada
                para elaborarlo.
              </p>
              <p className="text-sm text-neutral-400">
                Si quieres trabajar el objetivo, puedes iniciar una nueva
                sesión cuando estés listo.
              </p>
            </div>
          )}
        </div>

        {/* Cerrar sesión */}
        <div className="mt-10 space-y-3">
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void close()}
            disabled={closing}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-sm text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {closing ? 'Cerrando sesión…' : 'Cerrar y eliminar datos'}
          </button>
        </div>

      </div>
    </main>
  );
}
