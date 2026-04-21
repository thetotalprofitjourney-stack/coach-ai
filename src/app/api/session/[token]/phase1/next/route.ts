import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { handleAnthropicError } from '@/lib/api/anthropic-errors';
import { jsonError, jsonOk } from '@/lib/api/response';
import { factorOf, getItemByIndex } from '@/lib/fase1/banco';
import { callAdministrador } from '@/lib/fase1/call-administrador';
import { parseUserAnswer } from '@/lib/fase1/parse-answer';
import type { Fase1RunState } from '@/lib/fase1/types';
import { loadSessionOrResponse } from '@/lib/session/loader';
import { reconstructFase1RunState } from '@/lib/session/reconstruct';
import { prisma } from '@/lib/prisma';

// Haiku + banco cacheado. Margen amplio para reintentos de red.
export const maxDuration = 60;

const bodySchema = z.object({
  userMessage: z.string().min(1).max(4000),
});

// POST /api/session/{token}/phase1/next
// Recibe la respuesta del usuario al ítem actual. Si parsea letra, upsert
// Phase1Response y pide al administrador que presente el siguiente ítem
// (o despida tras el 16). Si no parsea letra, pide repregunta. La síntesis
// del hand-off es un endpoint separado (/phase1/finish).
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const loaded = await loadSessionOrResponse(token, ['phase1_in_progress']);
  if (loaded instanceof Response) return loaded;
  const { session } = loaded;

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
      'Parámetros inválidos.',
      400,
      parsed.error.flatten(),
    );
  }
  const userMessage = parsed.data.userMessage;

  const responses = await prisma.phase1Response.findMany({
    where: { sessionId: session.id },
  });
  const state = reconstructFase1RunState(session, responses);

  if (state.currentItemIndex >= 16) {
    return jsonError(
      'INVALID_STATE',
      'Todos los ítems ya respondidos. Invoca /phase1/finish para sintetizar.',
      409,
    );
  }

  const parsedAnswer = parseUserAnswer(userMessage);
  const currentItem = getItemByIndex(state.currentItemIndex);

  // Caso repregunta: sin letra detectada. No persistimos respuesta ni
  // avanzamos. El administrador repregunta y la siguiente request del
  // usuario volverá a caer en este mismo ítem.
  if (parsedAnswer.letter === null) {
    try {
      const admin = await callAdministrador({
        state,
        directive: 'repreguntar',
        lastUserMessage: userMessage,
      });
      return jsonOk({
        adminMessage: admin.text,
        itemIndex: state.currentItemIndex,
        totalItems: 16,
        parsedLetter: null,
        done: false,
      });
    } catch (err) {
      return handleAnthropicError(err, 'phase1/next reask');
    }
  }

  // Persistimos la respuesta y calculamos el nuevo estado (in-memory).
  await prisma.phase1Response.upsert({
    where: {
      sessionId_itemNumber: {
        sessionId: session.id,
        itemNumber: currentItem.id,
      },
    },
    create: {
      sessionId: session.id,
      itemNumber: currentItem.id,
      itemContent: currentItem as unknown as object,
      chosenOption: parsedAnswer.letter,
      secondaryOptions: [],
      freeText: parsedAnswer.freeText || null,
    },
    update: {
      chosenOption: parsedAnswer.letter,
      freeText: parsedAnswer.freeText || null,
    },
  });

  const answered = state.currentItemIndex + 1;
  const nextState: Fase1RunState = {
    ...state,
    currentItemIndex: answered,
    answers: [
      ...state.answers,
      {
        itemId: currentItem.id,
        chosenLetter: parsedAnswer.letter,
        chosenFactor: factorOf(currentItem.id, parsedAnswer.letter),
        freeText: parsedAnswer.freeText,
      },
    ],
  };

  const directive = answered >= 16 ? 'despedir' : 'presentar';

  try {
    const admin = await callAdministrador({
      state: nextState,
      directive,
      lastUserMessage: userMessage,
    });
    return jsonOk({
      adminMessage: admin.text,
      itemIndex: answered,
      totalItems: 16,
      parsedLetter: parsedAnswer.letter,
      done: answered >= 16,
    });
  } catch (err) {
    return handleAnthropicError(err, `phase1/next ${directive}`);
  }
}

