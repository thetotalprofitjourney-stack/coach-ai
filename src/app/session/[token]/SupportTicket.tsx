'use client';

import { useState } from 'react';

export type SupportPhase =
  | 'form'
  | 'phase1'
  | 'phase2_bootstrap'
  | 'phase2'
  | 'report'
  | 'other';

export interface SupportTicketProps {
  token: string;
  phase: SupportPhase;
  // Mensaje técnico del último error (invisible para el usuario, viaja
  // al operador para que diagnostique).
  technical?: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'opening' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string };

// Usado para evitar que un mismo dispositivo reenvíe tickets en bucle
// tras refrescos. Client-side only: no impide que el mismo usuario en
// otro dispositivo genere uno nuevo (y tampoco queremos impedirlo).
function ticketSentKey(token: string): string {
  return `coach-ai:ticket-sent:${token}`;
}

function hasAlreadySent(token: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ticketSentKey(token)) === '1';
  } catch {
    return false;
  }
}

function markSent(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ticketSentKey(token), '1');
  } catch {
    // Silenciar: sin dedup no se rompe nada.
  }
}

// Botón "Generar ticket" que abre un form inline (email obligatorio +
// descripción opcional). Al enviar, POST al endpoint de soporte. Sólo
// se espera verlo cuando el llamante decide (tras 30 s de error); este
// componente no tiene timers propios para mantenerse tonto y testable.
export function SupportTicket({
  token,
  phase,
  technical,
}: SupportTicketProps) {
  const [status, setStatus] = useState<Status>(() =>
    hasAlreadySent(token) ? { kind: 'sent' } : { kind: 'idle' },
  );
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().length === 0) return;
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch(`/api/session/${token}/support-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: email.trim(),
          userDescription: description.trim() || undefined,
          phase,
          technical,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setStatus({
          kind: 'error',
          message:
            body?.error?.message ||
            'No se pudo enviar el ticket. Inténtalo de nuevo en unos minutos.',
        });
        return;
      }
      markSent(token);
      setStatus({ kind: 'sent' });
    } catch {
      setStatus({ kind: 'error', message: 'Error de red enviando el ticket.' });
    }
  }

  if (status.kind === 'sent') {
    return (
      <p className="text-xs text-neutral-700">
        Ticket enviado. Te contactaremos al email que has indicado. Si te
        urge, prueba a recargar la página — el enlace de sesión sigue
        siendo válido mientras dure el TTL.
      </p>
    );
  }

  if (status.kind === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setStatus({ kind: 'opening' })}
        className="rounded border border-neutral-400 bg-white px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100"
      >
        Parece que no avanza — generar ticket de soporte
      </button>
    );
  }

  const sending = status.kind === 'sending';

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded border border-neutral-300 bg-white p-3 text-neutral-800"
    >
      <p className="text-xs">
        Si lo prefieres, manda un ticket con tu email. Te escribiremos en
        cuanto lo revisemos. El email se usa sólo para responderte y no
        se guarda en nuestra base de datos.
      </p>
      <div>
        <label htmlFor="support-email" className="block text-xs font-medium">
          Tu email
        </label>
        <input
          id="support-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
          maxLength={254}
          autoComplete="email"
          placeholder="tu@email.com"
          className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:opacity-60"
        />
      </div>
      <div>
        <label htmlFor="support-description" className="block text-xs font-medium">
          Qué ha pasado (opcional)
        </label>
        <textarea
          id="support-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={sending}
          maxLength={500}
          placeholder="Un par de líneas de contexto, si quieres."
          className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:opacity-60"
        />
      </div>
      {status.kind === 'error' && (
        <p role="alert" className="text-xs text-red-800">
          {status.message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={sending || email.trim().length === 0}
          className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? 'Enviando…' : 'Enviar ticket'}
        </button>
        <button
          type="button"
          onClick={() => setStatus({ kind: 'idle' })}
          disabled={sending}
          className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
