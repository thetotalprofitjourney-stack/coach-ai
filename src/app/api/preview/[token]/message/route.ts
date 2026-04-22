import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { handleAnthropicError } from '@/lib/api/anthropic-errors';
import { jsonError, jsonOk } from '@/lib/api/response';
import { sessionTokenSchema } from '@/lib/api/schemas';
import {
  callPreviewCoach,
  PREVIEW_MAX_TURNS,
  type PreviewTurn,
} from '@/lib/preview/call-preview-coach';
import { prisma } from '@/lib/prisma';

export const maxDuration = 60;

const bodySchema = z.object({
  userMessage: z.string().trim().min(1).max(500),
});

// Schema de los turnos persistidos en `preview_sessions.turns` (JSON).
// Validamos al leer porque el tipo nominal de Prisma para Json es `any`
// efectivo y queremos fallar rápido si algo metió basura.
const turnSchema = z.object({
  role: z.enum(['coach', 'user']),
  content: z.string(),
  turnNumber: z.number().int().min(1),
});
const turnsSchema = z.array(turnSchema);

// POST /api/preview/{token}/message
// Avanza un turno de la demo: persiste el mensaje del visitante, llama al
// coach (turno 2 o 3) y devuelve la respuesta. Cuando turnsUsed alcanza
// PREVIEW_MAX_TURNS, el endpoint rechaza ulteriores mensajes — el frontend
// ya debería haber ocultado el input, pero lo defendemos igualmente.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const tokenParse = sessionTokenSchema.safeParse(token);
  if (!tokenParse.success) {
    return jsonError('INVALID_INPUT', 'Token de demo inválido.', 400);
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
      'Mensaje inválido (vacío o demasiado largo).',
      400,
      parsed.error.flatten(),
    );
  }
  const userMessage = parsed.data.userMessage;

  const row = await prisma.previewSession.findUnique({
    where: { id: tokenParse.data },
  });
  if (!row) {
    return jsonError('SESSION_NOT_FOUND', 'Demo no encontrada o expirada.', 404);
  }

  if (row.turnsUsed >= PREVIEW_MAX_TURNS) {
    return jsonError(
      'INVALID_STATE',
      'Has agotado los turnos de la demo.',
      409,
    );
  }

  const turnsResult = turnsSchema.safeParse(row.turns);
  if (!turnsResult.success) {
    console.error('preview/message: turnos persistidos inválidos', turnsResult.error);
    return jsonError('INTERNAL', 'La demo tiene un estado corrupto.', 500);
  }
  const history: PreviewTurn[] = turnsResult.data;

  const userTurn: PreviewTurn = {
    role: 'user',
    content: userMessage,
    turnNumber: row.turnsUsed,
  };
  const historyWithUser = [...history, userTurn];

  const nextCoachTurnNumber = row.turnsUsed + 1;
  if (nextCoachTurnNumber !== 2 && nextCoachTurnNumber !== 3) {
    // Defensa ante estados imposibles. PREVIEW_MAX_TURNS=3 implica que
    // sólo llegamos aquí con coachTurnNumber ∈ {2, 3}.
    return jsonError('INVALID_STATE', 'La demo está en un turno inesperado.', 409);
  }

  let coachResult;
  try {
    coachResult = await callPreviewCoach({
      history: historyWithUser,
      coachTurnNumber: nextCoachTurnNumber,
      lastUserMessage: userMessage,
    });
  } catch (err) {
    return handleAnthropicError(err, 'preview/message');
  }

  const coachTurn: PreviewTurn = {
    role: 'coach',
    content: coachResult.text,
    turnNumber: nextCoachTurnNumber,
  };
  const updatedTurns = [...historyWithUser, coachTurn];

  await prisma.previewSession.update({
    where: { id: row.id },
    data: {
      turns: updatedTurns as unknown as Prisma.InputJsonValue,
      turnsUsed: nextCoachTurnNumber,
    },
  });

  return jsonOk({
    coachMessage: coachResult.text,
    turnsUsed: nextCoachTurnNumber,
    turnsTotal: PREVIEW_MAX_TURNS,
    finished: nextCoachTurnNumber >= PREVIEW_MAX_TURNS,
  });
}
