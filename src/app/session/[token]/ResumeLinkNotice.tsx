'use client';

import { useEffect, useState } from 'react';

export interface ResumeLinkNoticeProps {
  url: string;
  expiresAt: string;
}

// Aviso compacto para guardar el enlace de sesión. Se muestra como una
// tira discreta fuera del formulario principal. Por defecto sólo muestra
// el botón de copiar; la URL se puede revelar manualmente.
export function ResumeLinkNotice({ url, expiresAt }: ResumeLinkNoticeProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const expiresAtMs = Date.parse(expiresAt);
  const remainingMs = Math.max(0, expiresAtMs - now);
  const remainingHours = Math.max(1, Math.round(remainingMs / (60 * 60 * 1000)));

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Fallback: si clipboard API falla el usuario puede expandir y copiar manualmente.
    }
  }

  return (
    <aside
      className="mb-6 overflow-hidden rounded-lg border border-amber-200 bg-amber-50"
      aria-label="Enlace para retomar la sesión"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Candado */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0 text-amber-500"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
            clipRule="evenodd"
          />
        </svg>

        <p className="min-w-0 flex-1 text-sm text-amber-900">
          <span className="font-medium">Guarda el enlace de esta sesión.</span>{' '}
          <span className="text-amber-700">
            Caduca en {remainingHours}{' '}
            {remainingHours === 1 ? 'hora' : 'horas'}.
          </span>
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-amber-600 underline-offset-2 hover:underline"
            aria-expanded={expanded}
          >
            {expanded ? 'Ocultar' : 'Ver URL'}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-200"
          >
            {copied ? 'Copiado ✓' : 'Copiar enlace'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-amber-200 px-4 py-2">
          <input
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Enlace de la sesión"
            className="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-xs text-neutral-700 focus:outline-none"
          />
        </div>
      )}
    </aside>
  );
}
