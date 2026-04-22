import { getEmailContext } from './client';

export interface SendSupportTicketInput {
  // Email al que escribe el usuario (Reply-To, sin persistir en BD).
  userEmail: string;
  // Mensaje libre que el usuario añade opcionalmente.
  userDescription?: string;
  // Token de la sesión con la incidencia.
  sessionToken: string;
  // Qué fase estaba ejecutándose ("phase1" | "phase2" | "report" | ...).
  phase: string;
  // Mensaje técnico del último error visible (ej. "phase2/message coach
  // stream → HTTP 502"). Para el operador, no para el usuario.
  technical?: string;
  // User-agent bruto si el cliente lo envía. No es PII estable — sólo
  // ayuda a diagnosticar incidencias ligadas a un navegador concreto.
  userAgent?: string;
}

export function isSupportConfigured(): boolean {
  return !!process.env.SUPPORT_EMAIL?.trim();
}

// Envía un email al operador (SUPPORT_EMAIL) con los datos mínimos para
// investigar y decidir reembolso. NO adjunta conversación ni PII: el
// operador busca en BD por `sessionToken` (vive 48 h, configurable) para
// ver el estado real. Pone al usuario como Reply-To para que contestar
// desde el cliente de email vaya directo a él.
export async function sendSupportTicket(
  input: SendSupportTicketInput,
): Promise<void> {
  const supportTo = process.env.SUPPORT_EMAIL?.trim();
  if (!supportTo) {
    throw new Error(
      'support: SUPPORT_EMAIL no configurado; el endpoint debería rechazar antes.',
    );
  }

  const { transporter, from } = getEmailContext();
  const tokenShort = input.sessionToken.slice(0, 8);
  const subject = `Coach AI · Incidencia en sesión ${tokenShort}`;

  const description = input.userDescription?.trim()
    ? input.userDescription.trim()
    : '(sin descripción del usuario)';
  const technical = input.technical?.trim() ?? '(sin detalle técnico)';
  const userAgent = input.userAgent?.trim() ?? '(no disponible)';

  const text = [
    `Ticket de soporte generado desde la propia sesión.`,
    ``,
    `Token de sesión: ${input.sessionToken}`,
    `Fase: ${input.phase}`,
    `Error técnico: ${technical}`,
    `User-Agent: ${userAgent}`,
    ``,
    `Email del usuario: ${input.userEmail}`,
    `Descripción:`,
    description,
    ``,
    `— Responde a este email para contactar con el usuario (Reply-To`,
    `apunta a su dirección). Busca por token en la BD para el estado`,
    `completo de la sesión antes de decidir reembolso.`,
  ].join('\n');

  await transporter.sendMail({
    from,
    to: supportTo,
    replyTo: input.userEmail,
    subject,
    text,
  });
}
