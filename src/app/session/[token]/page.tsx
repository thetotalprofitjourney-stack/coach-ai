import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { sessionTokenSchema } from '@/lib/api/schemas';
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
    select: { status: true },
  });
  if (!session) notFound();

  switch (session.status) {
    case 'created':
      return <InitialForm token={tokenParse.data} />;
    case 'phase1_in_progress':
      return <Phase1Chat token={tokenParse.data} />;
    case 'phase1_completed':
      return <Phase2Bootstrap token={tokenParse.data} />;
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
      const reportRow = await prisma.finalReport.findUnique({
        where: { sessionId: tokenParse.data },
        select: { reportContent: true },
      });
      if (!reportRow) return <Phase1Placeholder />;
      const report = reportRow.reportContent as unknown as FinalReportContent;
      return <ReportView token={tokenParse.data} report={report} />;
    }
    case 'closed':
      return <ClosedScreen />;
  }
}
