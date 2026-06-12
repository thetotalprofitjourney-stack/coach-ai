import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, jsonOk } from '@/lib/api/response';
import {
  formPayloadSchema,
  sessionTokenSchema,
  type FormResponse,
} from '@/lib/api/schemas';
import { logBusinessEvent } from '@/lib/metrics/events';

// POST /api/session/{token}/form
// Recibe los datos del formulario inicial (§2.3), los guarda en `sessions` y
// transiciona el estado `created` → `phase1_in_progress`.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const tokenParse = sessionTokenSchema.safeParse(token);
  if (!tokenParse.success) {
    return jsonError('INVALID_INPUT', 'Token de sesión inválido.', 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('INVALID_INPUT', 'JSON inválido en el cuerpo.', 400);
  }

  const payload = formPayloadSchema.safeParse(body);
  if (!payload.success) {
    return jsonError(
      'INVALID_INPUT',
      'Datos del formulario inválidos.',
      400,
      payload.error.flatten(),
    );
  }

  const session = await prisma.session.findUnique({
    where: { id: tokenParse.data },
    select: { status: true, createdAt: true },
  });
  if (!session) {
    return jsonError('SESSION_NOT_FOUND', 'La sesión no existe.', 404);
  }
  if (session.status !== 'created') {
    return jsonError(
      'INVALID_STATE',
      `La sesión no admite el formulario en el estado "${session.status}".`,
      409,
    );
  }

  const data = payload.data;
  try {
    await prisma.session.update({
      where: { id: tokenParse.data },
      data: {
        userName: data.alias,
        userAge: data.age,
        userFamilyContext: data.familyContext,
        userRetoDominio: data.retoDominio,
        userProfessionalMoment: data.professionalMoment,
        userTrigger: data.trigger,
        status: 'phase1_in_progress',
      },
    });
  } catch (err) {
    console.error('POST /api/session/{token}/form failed', err);
    return jsonError('INTERNAL', 'No se pudo guardar el formulario.', 500);
  }

  logBusinessEvent('form_submitted', {
    durationMs: Date.now() - session.createdAt.getTime(),
  });

  const response: FormResponse = { ok: true, status: 'phase1_in_progress' };
  return jsonOk(response);
}
