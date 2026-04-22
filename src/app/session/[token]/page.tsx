import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { sessionTokenSchema } from '@/lib/api/schemas';
import { buildResumeLinkData } from '@/lib/session/resume-link';
import { isEmailConfigured } from '@/lib/email/client';
import { InitialForm } from './InitialForm';
import { Phase1Chat } from './Phase1Chat';
import { Phase1Placeholder } from './Phase1Placeholder';
import { Phase2Bootstrap } from './Phase2Bootstrap';
import { Phase2Chat } from './Phase2Chat';
import { ReportView } from './ReportView';
import { ClosedScreen } from './ClosedScreen';
import type { FinalReportContent } from '@/lib/fase2/parse-report';

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
    select: { status: true, createdAt: true },
  });
  if (!session) notFound();

  // Datos del aviso de retomar (URL pública + expiresAt). Se renderiza
  // en los tres screens de entrada (InitialForm, Phase1Chat,
  // Phase2Bootstrap). No aparece ni en Phase2Chat (foco de conversación)
  // ni en ReportView (que tiene su propio timer de 10 min) ni en la
  // sesión cerrada.
  const resumeLink = buildResumeLinkData(tokenParse.data, session.createdAt);

  switch (session.status) {
    case 'created':
      return <InitialForm token={tokenParse.data} resumeLink={resumeLink} />;
    case 'phase1_in_progress':
      return <Phase1Chat token={tokenParse.data} resumeLink={resumeLink} />;
    case 'phase1_completed':
      return (
        <Phase2Bootstrap token={tokenParse.data} resumeLink={resumeLink} />
      );
    case 'phase2_in_progress': {
      const [turnRows, stateRow] = await Promise.all([
        prisma.phase2Turn.findMany({
          where: { sessionId: tokenParse.data },
          orderBy: [{ turnNumber: 'asc' }, { createdAt: 'asc' }],
          select: { role: true, content: true, turnNumber: true },
        }),
        prisma.phase2State.findUnique({
          where: { sessionId: tokenParse.data },
          select: { currentLevel: true },
        }),
      ]);
      const coachTurnNumber = turnRows
        .filter((t) => t.role === 'coach')
        .reduce((max, t) => Math.max(max, t.turnNumber), 0);
      return (
        <Phase2Chat
          token={tokenParse.data}
          initialTurns={turnRows}
          initialCoachTurnNumber={coachTurnNumber}
          initialLevel={stateRow?.currentLevel ?? 1}
        />
      );
    }
    case 'phase2_completed': {
      const row = await prisma.session.findUnique({
        where: { id: tokenParse.data },
        select: {
          userName: true,
          createdAt: true,
          finalReport: {
            select: {
              reportContent: true,
              downloadedAt: true,
              emailedAt: true,
            },
          },
        },
      });
      if (!row?.finalReport) return <Phase1Placeholder />;
      const report = row.finalReport.reportContent as unknown as FinalReportContent;
      return (
        <ReportView
          token={tokenParse.data}
          report={report}
          userName={row.userName}
          createdAt={row.createdAt.toISOString()}
          initialDownloadedAt={row.finalReport.downloadedAt?.toISOString() ?? null}
          initialEmailedAt={row.finalReport.emailedAt?.toISOString() ?? null}
          emailEnabled={isEmailConfigured()}
        />
      );
    }
    case 'closed':
      return <ClosedScreen />;
  }
}
