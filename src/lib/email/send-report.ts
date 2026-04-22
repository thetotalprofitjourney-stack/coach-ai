import { getEmailContext } from './client';

export interface SendReportEmailInput {
  to: string;
  userName: string | null;
  createdAt: Date;
  pdfBuffer: Buffer;
  pdfFilename: string;
  docxBuffer: Buffer;
  docxFilename: string;
}

// Envía el informe final como email con PDF + DOCX adjuntos. El cuerpo es
// sobrio e informativo: no repite el contenido del informe (el informe
// mismo viaja adjunto), sólo confirma el envío y recuerda la política de
// borrado. La dirección `to` NO se persiste en BD: viaja al proveedor
// SMTP y se olvida.
export async function sendReportEmail(input: SendReportEmailInput): Promise<void> {
  const { transporter, from, subject } = getEmailContext();

  const greeting = input.userName
    ? `Hola ${input.userName},`
    : 'Hola,';
  const generatedAt = input.createdAt.toLocaleString('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  });

  const text = [
    greeting,
    '',
    'Adjunto encontrarás el informe de tu sesión de Coach AI en PDF y en Word.',
    '',
    `Generado el ${generatedAt}.`,
    '',
    'Como recordatorio: esta copia por email es el único lugar donde conservamos',
    'el informe a partir de ahora. En nuestros servidores ya lo hemos marcado',
    'para borrado según la política de privacidad.',
    '',
    'Un saludo,',
    'Coach AI',
  ].join('\n');

  await transporter.sendMail({
    from,
    to: input.to,
    subject,
    text,
    attachments: [
      {
        filename: input.pdfFilename,
        content: input.pdfBuffer,
        contentType: 'application/pdf',
      },
      {
        filename: input.docxFilename,
        content: input.docxBuffer,
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ],
  });
}
