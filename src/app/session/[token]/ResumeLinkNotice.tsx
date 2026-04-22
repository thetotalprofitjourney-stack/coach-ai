'use client';

import { useEffect, useState } from 'react';

// Aviso persistente en las pantallas de entrada de una sesión: muestra el
// enlace completo con botón de copiar y un recordatorio de cuántas horas
// quedan antes de que el cron nocturno lo borre. Permite retomar la
// sesión desde cualquier dispositivo dentro de ese plazo, mitigando caídas
// de WiFi, cambios de navegador o cierres de pestaña.

export interface ResumeLinkNoticeProps {
  // URL pública completa a la sesión (`APP_PUBLIC_URL + /session/{token}`).
  // Se pasa desde el server component para que no dependa del cliente
  // resolverlo; además, si APP_PUBLIC_URL está mal configurada, el
  // operador lo ve en seguida.
  url: string;
  // Momento absoluto en el que el enlace deja de ser válido (ISO). El
  // server lo calcula con la ventana abandoned actual.
  expiresAt: string;
}

export function ResumeLinkNotice({ url, expiresAt }: ResumeLinkNoticeProps) {
  const [copied, setCopied] = useState(false);
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
      // Fallback silencioso: si navigator.clipboard falla (http inseguro
      // antiguo, permisos denegados), el usuario puede seleccionar el
      // texto del input manualmente.
    }
  }

  return (
    <aside
      className="mb-4 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm"
      aria-label="Enlace para retomar la sesión"
    >
      <p className="text-neutral-700">
        <span className="font-medium text-neutral-900">
          Guarda este enlace para retomar tu sesión.
        </span>{' '}
        El enlace es el único identificador: si cierras la pestaña o se
        cae el WiFi, puedes volver aquí mientras siga activo.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Enlace de la sesión"
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-800"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-neutral-100"
        >
          {copied ? 'Copiado' : 'Copiar enlace'}
        </button>
      </div>
      <p className="mt-2 text-xs text-neutral-600">
        Expira en aproximadamente {remainingHours}{' '}
        {remainingHours === 1 ? 'hora' : 'horas'} si no la retomas.
      </p>
    </aside>
  );
}
