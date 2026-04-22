import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { jsonError, jsonOk } from '@/lib/api/response';
import { sessionTokenSchema } from '@/lib/api/schemas';
import { isEmailConfigured } from '@/lib/email/client';
import {
  isSupportConfigured,
  sendSupportTicket,
} from '@/lib/email/send-support-ticket';
import { prisma } from '@/lib/prisma';

// POST /api/session/{token}/support-ticket
// El usuario pulsa "Generar ticket" tras 30 s+ en error. Envía un email
// al operador (SUPPORT_EMAIL) con el token, la fase, el detalle técnico
// y la descripción/email del usuario (si los ha rellenado). El email
// del usuario se usa como Reply-To; no se persiste en BD. La sesión
// SIGUE válida tras el ticket — el operador decide qué hacer.
export const maxDuration = 30;

const bodySchema = z.object({
  userEmail: z.string().trim().toLowerCase().email().max(254),
  userDescription: z.string().trim().max(500).optional(),
  phase: z.enum([
    'form',
    'phase1',
    'phase2_bootstrap',
    'phase2',
    'report',
    'other',
  ]),
  technical: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  if (!isEmailConfigured() || !isSupportConfigured()) {
    return jsonError(
      'INTERNAL',
      'El soporte por email no está disponible en este despliegue.',
      503,
    );
  }

  const { token } = await context.params;
  const parse = sessionTokenSchema.safeParse(token);
  if (!parse.success) {
    return jsonError('INVALID_INPUT', 'Token de sesión inválido.', 400);
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return jsonError('INVALID_INPUT', 'JSON inválido en el cuerpo.', 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      'INVALID_INPUT',
      'Datos del ticket inválidos.',
      400,
      parsed.error.flatten(),
    );
  }

  // Validamos que la sesión existe antes de notificar; si el token está
  // inventado no tiene sentido abrir ticket. No exponemos el estado al
  // cliente: basta con 404 o 200.
  const session = await prisma.session.findUnique({
    where: { id: parse.data },
    select: { id: true },
  });
  if (!session) {
    return jsonError('SESSION_NOT_FOUND', 'La sesión no existe.', 404);
  }

  try {
    await sendSupportTicket({
      userEmail: parsed.data.userEmail,
      userDescription: parsed.data.userDescription,
      sessionToken: session.id,
      phase: parsed.data.phase,
      technical: parsed.data.technical,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });
  } catch (err) {
    console.error('support-ticket: send failed', err);
    return jsonError(
      'INTERNAL',
      'No se pudo enviar el ticket. Inténtalo de nuevo en unos minutos o escríbenos por otro canal.',
      502,
    );
  }

  return jsonOk({ ok: true });
}
