import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

import { handleAnthropicError } from '@/lib/api/anthropic-errors';
import { jsonError, jsonOk } from '@/lib/api/response';
import {
  callPreviewCoach,
  PREVIEW_MAX_TURNS,
} from '@/lib/preview/call-preview-coach';
import {
  checkPreviewQuota,
  consumePreviewQuota,
  extractClientIp,
  hashClientIp,
} from '@/lib/preview/quota';
import { prisma } from '@/lib/prisma';

// Timeout holgado para Haiku (suele tardar 2-4s, pero el cold start
// puede añadir varios segundos más). No necesitamos los 300s de la
// Fase 2 real porque aquí no hay thinking ni Opus.
export const maxDuration = 60;

// POST /api/preview/start
// Crea una PreviewSession, consume cupo por IP, llama al coach (turno 1)
// y devuelve { token, coachMessage, turnsUsed, turnsTotal }. El frontend
// redirige a /preview/{token} con el primer turno ya persistido.
export async function POST(req: NextRequest) {
  const ip = extractClientIp(req);
  const ipHash = hashClientIp(ip);
  if (!ipHash) {
    console.error('preview/start: PREVIEW_IP_HASH_SALT no está configurado');
    return jsonError(
      'INTERNAL',
      'La demo no está disponible en este entorno.',
      500,
    );
  }

  const quotaView = await checkPreviewQuota(ipHash);
  if (!quotaView.allowed) {
    return jsonError(
      'INVALID_STATE',
      'Has llegado al límite de demos diarias. Vuelve mañana o inicia la sesión completa.',
      429,
    );
  }

  const reserved = await consumePreviewQuota(ipHash);
  if (!reserved) {
    return jsonError(
      'INVALID_STATE',
      'Has llegado al límite de demos diarias. Vuelve mañana o inicia la sesión completa.',
      429,
    );
  }

  // Llamamos al coach ANTES de crear la fila: si Haiku falla, devolvemos
  // cupo (no conservamos el slot). Decremento best-effort — si también
  // falla, el visitante pierde un cupo, lo cual es un coste aceptable.
  let coachResult;
  try {
    coachResult = await callPreviewCoach({
      history: [],
      coachTurnNumber: 1,
      lastUserMessage: '',
    });
  } catch (err) {
    await rollbackQuota(ipHash);
    return handleAnthropicError(err, 'preview/start');
  }

  const coachTurn = {
    role: 'coach' as const,
    content: coachResult.text,
    turnNumber: 1,
  };

  const row = await prisma.previewSession.create({
    data: {
      turns: [coachTurn] as unknown as Prisma.InputJsonValue,
      turnsUsed: 1,
    },
  });

  return jsonOk({
    token: row.id,
    coachMessage: coachResult.text,
    turnsUsed: 1,
    turnsTotal: PREVIEW_MAX_TURNS,
  });
}

async function rollbackQuota(ipHash: string): Promise<void> {
  try {
    await prisma.previewQuota.update({
      where: { ipHash },
      data: { previewCount: { decrement: 1 } },
    });
  } catch (err) {
    console.error('preview/start: rollback de cupo falló', err);
  }
}
