// Renderiza el informe final a DOCX con la misma estructura visual que el
// PDF: portada, 11 bloques titulados (§5.4) y pie sobrio. Usa el paquete
// `docx` — Open XML sin dependencias nativas, funciona en serverless.

import {
  AlignmentType,
  Document,
  Footer,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

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

import type { RenderReportInput } from './render-pdf';

// Unidades: docx usa half-points para tamaño de fuente y twips para
// márgenes (1 inch = 1440 twips, 1 cm ≈ 567 twips).
const MARGIN_TWIP = 1440; // 2.54 cm

const COLOR = {
  heading: '111827',
  body: '1F2937',
  muted: '6B7280',
  subHeading: '374151',
  notice: '92400E',
};

export async function renderReportDocx(
  input: RenderReportInput,
): Promise<Buffer> {
  const { report, userName, createdAt } = input;
  const footerText = `Informe generado por ${PRODUCT_NAME} — ${formatDateEs(createdAt)}`;

  const children: Paragraph[] = [
    ...coverParagraphs(userName, createdAt),
    new Paragraph({ children: [new PageBreak()] }),
    ...bodyParagraphs(report),
  ];

  const doc = new Document({
    creator: PRODUCT_NAME,
    title: 'Informe de sesión',
    description: 'Informe de la sesión de coaching',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: MARGIN_TWIP,
              bottom: MARGIN_TWIP,
              left: MARGIN_TWIP,
              right: MARGIN_TWIP,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: footerText,
                    size: 18,
                    color: COLOR.muted,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as Promise<Buffer>;
}

function coverParagraphs(
  userName: string | null,
  createdAt: Date,
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < 10; i++) {
    paragraphs.push(new Paragraph({ children: [] }));
  }

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: PRODUCT_NAME.toUpperCase(),
          size: 22,
          color: COLOR.muted,
          characterSpacing: 40,
        }),
      ],
    }),
    new Paragraph({ children: [] }),
    new Paragraph({ children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Informe de tu sesión',
          bold: true,
          size: 60,
          color: COLOR.heading,
        }),
      ],
    }),
    new Paragraph({ children: [] }),
  );

  if (userName) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: userName,
            size: 32,
            color: COLOR.subHeading,
          }),
        ],
      }),
    );
  }

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: formatDateEs(createdAt),
          size: 26,
          color: COLOR.muted,
        }),
      ],
    }),
  );

  return paragraphs;
}

function bodyParagraphs(report: FinalReportContent): Paragraph[] {
  if (report.parseStatus === 'parsed') {
    const out: Paragraph[] = [];
    REPORT_BLOCK_KEYS.forEach((key, index) => {
      out.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: `${index + 1}. ${BLOCK_TITLES[key]}`,
              bold: true,
              size: 26,
              color: COLOR.heading,
            }),
          ],
        }),
      );
      for (const line of splitParagraphs(report.blocks[key] ?? '—')) {
        out.push(
          new Paragraph({
            spacing: { after: 120, line: 320 },
            children: [
              new TextRun({
                text: line,
                size: 22,
                color: COLOR.body,
              }),
            ],
          }),
        );
      }
    });
    return out;
  }

  const out: Paragraph[] = [
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: RAW_FALLBACK_NOTICE,
          bold: true,
          size: 22,
          color: COLOR.notice,
        }),
      ],
    }),
  ];
  for (const line of splitParagraphs(report.rawText)) {
    out.push(
      new Paragraph({
        spacing: { after: 120, line: 320 },
        children: [
          new TextRun({
            text: line,
            size: 22,
            color: COLOR.body,
          }),
        ],
      }),
    );
  }
  return out;
}

function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return ['—'];
  return trimmed.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim());
}
