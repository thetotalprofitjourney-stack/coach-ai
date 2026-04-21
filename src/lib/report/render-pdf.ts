// Renderiza el informe final (§5.4) a PDF con portada + 11 bloques + pie.
// Usa pdfkit en modo imperativo. Las fuentes estándar (Helvetica) van
// embebidas en el propio paquete; Next.js las entrega correctamente en
// serverless siempre que `pdfkit` esté listado en `serverExternalPackages`
// (ver next.config.ts).

import PDFDocument from 'pdfkit';

import {
  REPORT_BLOCK_KEYS,
  type FinalReportContent,
} from '@/lib/fase2/parse-report';

import {
  BLOCK_TITLES,
  PRODUCT_NAME,
  RAW_FALLBACK_NOTICE,
  formatDateEs,
} from './titles';

export interface RenderReportInput {
  report: FinalReportContent;
  userName: string | null;
  createdAt: Date;
}

// A4 con márgenes 2.5 cm ~ 72 pt. Pie a 30 pt por encima del borde.
const MARGINS = { top: 72, bottom: 96, left: 72, right: 72 };

export function renderReportPdf(input: RenderReportInput): Promise<Buffer> {
  const { report, userName, createdAt } = input;

  const doc = new PDFDocument({
    size: 'A4',
    margins: MARGINS,
    info: {
      Title: 'Informe de sesión',
      Author: PRODUCT_NAME,
      Creator: PRODUCT_NAME,
      Producer: PRODUCT_NAME,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const footerText = `Informe generado por ${PRODUCT_NAME} — ${formatDateEs(createdAt)}`;
  const drawFooter = () => {
    const { page } = doc;
    const y = page.height - page.margins.bottom + 40;
    doc
      .save()
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(footerText, page.margins.left, y, {
        width: page.width - page.margins.left - page.margins.right,
        align: 'center',
        lineBreak: false,
      })
      .restore();
  };
  doc.on('pageAdded', drawFooter);

  // Página 1 (portada) — pdfkit la crea automáticamente al instanciar el
  // documento, así que el evento `pageAdded` no se dispara para ella.
  drawFooter();
  drawCover(doc, userName, createdAt);

  // Cuerpo.
  doc.addPage();

  if (report.parseStatus === 'parsed') {
    REPORT_BLOCK_KEYS.forEach((key, index) => {
      writeBlock(doc, index + 1, BLOCK_TITLES[key], report.blocks[key] ?? '—');
    });
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#92400e')
      .text(RAW_FALLBACK_NOTICE, { align: 'left' });
    doc.moveDown(1);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#1f2937')
      .text(report.rawText, { align: 'left', lineGap: 2 });
  }

  doc.end();
  return done;
}

function drawCover(
  doc: PDFKit.PDFDocument,
  userName: string | null,
  createdAt: Date,
): void {
  const centerY = doc.page.height / 2 - 120;
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#6b7280')
    .text(PRODUCT_NAME.toUpperCase(), MARGINS.left, centerY, {
      width: doc.page.width - MARGINS.left - MARGINS.right,
      align: 'center',
      characterSpacing: 2,
    });
  doc.moveDown(3);
  doc
    .font('Helvetica-Bold')
    .fontSize(30)
    .fillColor('#111827')
    .text('Informe de tu sesión', {
      align: 'center',
    });
  doc.moveDown(2);
  if (userName) {
    doc
      .font('Helvetica')
      .fontSize(16)
      .fillColor('#374151')
      .text(userName, { align: 'center' });
    doc.moveDown(0.4);
  }
  doc
    .font('Helvetica')
    .fontSize(13)
    .fillColor('#6b7280')
    .text(formatDateEs(createdAt), { align: 'center' });
}

function writeBlock(
  doc: PDFKit.PDFDocument,
  number: number,
  title: string,
  body: string,
): void {
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#111827')
    .text(`${number}. ${title}`, { align: 'left' });
  doc.moveDown(0.35);
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#1f2937')
    .text(body, { align: 'left', lineGap: 2 });
  doc.moveDown(1);
}
