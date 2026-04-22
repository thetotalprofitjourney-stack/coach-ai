import { notFound } from 'next/navigation';
import { z } from 'zod';

import { sessionTokenSchema } from '@/lib/api/schemas';
import { PREVIEW_MAX_TURNS } from '@/lib/preview/call-preview-coach';
import { prisma } from '@/lib/prisma';

import { PreviewChat } from './PreviewChat';

export const dynamic = 'force-dynamic';

const turnSchema = z.object({
  role: z.enum(['coach', 'user']),
  content: z.string(),
  turnNumber: z.number().int().min(1),
});
const turnsSchema = z.array(turnSchema);

// GET /preview/{token}
// Carga la PreviewSession y pinta el chat de la demo con el historial
// persistido. Si el token no existe o los turnos están corruptos, 404.
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const parse = sessionTokenSchema.safeParse(token);
  if (!parse.success) notFound();

  const row = await prisma.previewSession.findUnique({
    where: { id: parse.data },
  });
  if (!row) notFound();

  const turnsParse = turnsSchema.safeParse(row.turns);
  if (!turnsParse.success) notFound();

  return (
    <PreviewChat
      token={parse.data}
      initialTurns={turnsParse.data}
      initialTurnsUsed={row.turnsUsed}
      turnsTotal={PREVIEW_MAX_TURNS}
    />
  );
}
