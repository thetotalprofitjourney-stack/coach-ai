import type { Prisma, Session, SessionStatus } from '@prisma/client';
import { NextResponse } from 'next/server';

import { jsonError, type ApiErrorBody } from '@/lib/api/response';
import { sessionTokenSchema } from '@/lib/api/schemas';
import { prisma } from '@/lib/prisma';

export interface LoadedSession {
  session: Session;
}

// Devuelve la sesión ya validada o una NextResponse con el error adecuado.
// El caller hace `if ('session' in result) { ... } else return result;`.
export async function loadSessionOrResponse(
  token: string,
  allowedStatuses?: readonly SessionStatus[],
): Promise<LoadedSession | NextResponse<ApiErrorBody>> {
  const tokenParse = sessionTokenSchema.safeParse(token);
  if (!tokenParse.success) {
    return jsonError('INVALID_INPUT', 'Token de sesión inválido.', 400);
  }

  const session = await prisma.session.findUnique({
    where: { id: tokenParse.data },
  });
  if (!session) {
    return jsonError('SESSION_NOT_FOUND', 'La sesión no existe.', 404);
  }

  if (allowedStatuses && !allowedStatuses.includes(session.status)) {
    return jsonError(
      'INVALID_STATE',
      `La sesión no admite esta operación en el estado "${session.status}".`,
      409,
    );
  }

  return { session };
}

// Transición de status con guardia optimista: el UPDATE sólo afecta filas
// cuyo status actual sea `from`. Si no afecta ninguna, la sesión avanzó
// por otro camino y devolvemos false para que el caller decida.
export async function transitionStatus(
  tx: Prisma.TransactionClient,
  sessionId: string,
  from: SessionStatus,
  to: SessionStatus,
): Promise<boolean> {
  const result = await tx.session.updateMany({
    where: { id: sessionId, status: from },
    data: { status: to },
  });
  return result.count === 1;
}
