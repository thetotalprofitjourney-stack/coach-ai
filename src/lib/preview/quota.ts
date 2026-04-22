import { createHash } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { prisma } from '@/lib/prisma';

// Cupo diario por IP para arrancar previews. Sólo se aplica al crear una
// nueva sesión de demo; los 3 turnos de una preview ya iniciada no tocan
// este cupo. La IP se almacena hasheada con salt para no persistir PII
// (§6.4, anonimato).

const DEFAULT_DAILY_LIMIT = 3;

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

// Extrae la IP del cliente respetando X-Forwarded-For (Vercel y la
// mayoría de proxies la rellenan). Si no hay cabecera, cae a "unknown";
// en ese caso todos los visitantes sin IP válida comparten un mismo
// cupo, lo que es un límite conservador aceptable.
export function extractClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

// SHA-256(salt + ip). El salt evita colisiones con otras instalaciones y
// hace que el hash no sea reversible sólo por fuerza bruta del espacio
// IPv4 (4.3B) — con salt de 32 bytes, un atacante necesitaría conocerlo
// para derivar IPs. Si PREVIEW_IP_HASH_SALT falta, devolvemos null para
// indicar que no podemos aplicar el cupo (el endpoint decide qué hacer).
export function hashClientIp(ip: string): string | null {
  const salt = process.env.PREVIEW_IP_HASH_SALT;
  if (!salt) return null;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function dailyLimit(): number {
  const raw = process.env.PREVIEW_DAILY_LIMIT_PER_IP;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_DAILY_LIMIT;
  return parsed;
}

// Comprueba el cupo sin mutarlo. Útil para decidir si responder 429 antes
// de reservar el slot.
export async function checkPreviewQuota(
  ipHash: string,
): Promise<QuotaCheckResult> {
  const limit = dailyLimit();
  const today = todayUtc();
  const row = await prisma.previewQuota.findUnique({ where: { ipHash } });
  if (!row || row.resetDate.getTime() !== today.getTime()) {
    return { allowed: true, remaining: limit, limit };
  }
  const remaining = Math.max(0, limit - row.previewCount);
  return { allowed: remaining > 0, remaining, limit };
}

// Incrementa el contador del cupo de hoy (UTC). Devuelve false si el
// cupo ya estaba agotado al momento de intentar reservar: el endpoint
// debe rechazar con 429 en ese caso. Usa upsert con transacción implícita
// para evitar condiciones de carrera cuando dos peticiones concurrentes
// intentan reservar el último slot.
export async function consumePreviewQuota(ipHash: string): Promise<boolean> {
  const limit = dailyLimit();
  const today = todayUtc();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.previewQuota.findUnique({ where: { ipHash } });
    if (!existing || existing.resetDate.getTime() !== today.getTime()) {
      await tx.previewQuota.upsert({
        where: { ipHash },
        create: {
          ipHash,
          resetDate: today,
          previewCount: 1,
          lastPreviewAt: new Date(),
        },
        update: {
          resetDate: today,
          previewCount: 1,
          lastPreviewAt: new Date(),
        },
      });
      return true;
    }
    if (existing.previewCount >= limit) return false;
    await tx.previewQuota.update({
      where: { ipHash },
      data: {
        previewCount: { increment: 1 },
        lastPreviewAt: new Date(),
      },
    });
    return true;
  });
}
