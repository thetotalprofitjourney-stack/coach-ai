import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { sessionTokenSchema } from '@/lib/api/schemas';
import { InitialForm } from './InitialForm';
import { Phase1Placeholder } from './Phase1Placeholder';
import { ClosedScreen } from './ClosedScreen';

// El estado de la sesión cambia por acciones del usuario (POST /form, etc.)
// y no puede cachearse: siempre queremos leer BD en cada request.
export const dynamic = 'force-dynamic';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const tokenParse = sessionTokenSchema.safeParse(token);
  if (!tokenParse.success) notFound();

  const session = await prisma.session.findUnique({
    where: { id: tokenParse.data },
    select: { status: true },
  });
  if (!session) notFound();

  switch (session.status) {
    case 'created':
      return <InitialForm token={tokenParse.data} />;
    case 'phase1_in_progress':
    case 'phase1_completed':
    case 'phase2_in_progress':
    case 'phase2_completed':
      return <Phase1Placeholder />;
    case 'closed':
      return <ClosedScreen />;
  }
}
