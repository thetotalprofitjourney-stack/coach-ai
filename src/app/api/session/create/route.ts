import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSessionCreateSecret } from '@/lib/api/auth';
import { jsonError, jsonOk } from '@/lib/api/response';
import type { CreateSessionResponse } from '@/lib/api/schemas';

// POST /api/session/create
// Crea una sesión anónima en estado `created` y devuelve el token + URL a la
// que debe redirigirse al usuario tras el pago. Ver docs/proyecto-completo.md
// §2.2 y §3.1: es el puente entre el sistema de facturación y el sistema de
// sesiones. En producción (Paso 10) lo invoca el webhook de Stripe.
export async function POST(req: NextRequest) {
  const unauthorized = requireSessionCreateSecret(req);
  if (unauthorized) return unauthorized;

  try {
    const session = await prisma.session.create({ data: {} });
    const origin = process.env.APP_PUBLIC_URL ?? req.nextUrl.origin;
    const payload: CreateSessionResponse = {
      token: session.id,
      url: `${origin}/session/${session.id}`,
    };
    return jsonOk(payload, 201);
  } catch (err) {
    console.error('POST /api/session/create failed', err);
    return jsonError('INTERNAL', 'No se pudo crear la sesión.', 500);
  }
}
