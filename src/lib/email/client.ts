import nodemailer, { type Transporter } from 'nodemailer';

// Cliente SMTP genérico. El operador configura SMTP_* y EMAIL_FROM en el
// entorno; la app usa nodemailer sin ningún SDK de proveedor específico.
// Si falta la configuración mínima el formulario del informe se oculta y
// los endpoints responden 503; así nunca intentamos un envío silencioso
// que se pierda.

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
  subject: string;
}

function readConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!host || !from) return null;

  const portRaw = process.env.SMTP_PORT?.trim();
  const port = portRaw ? parseInt(portRaw, 10) : 587;
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null;

  const secure = (process.env.SMTP_SECURE?.trim() || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim();
  const auth = user && pass ? { user, pass } : undefined;

  const subject = process.env.EMAIL_SUBJECT?.trim() || 'Tu informe de Coach AI';

  return { host, port, secure, auth, from, subject };
}

export function isEmailConfigured(): boolean {
  return readConfig() !== null;
}

let cachedTransporter: Transporter | null = null;
let cachedConfigSignature: string | null = null;

// Crea (o recicla) el transporter. Incluye un "signature" de la config
// para que si el operador cambia una env var entre despliegues sin
// reiniciar el proceso, el transporter nuevo refleje el cambio. No
// esperado en producción (Vercel reinicia el lambda), pero barato.
export function getEmailContext(): {
  transporter: Transporter;
  from: string;
  subject: string;
} {
  const config = readConfig();
  if (!config) {
    throw new Error('email: SMTP no está configurado (SMTP_HOST + EMAIL_FROM).');
  }
  const signature = JSON.stringify({
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth?.user ?? null,
  });
  if (!cachedTransporter || cachedConfigSignature !== signature) {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
    cachedConfigSignature = signature;
  }
  return {
    transporter: cachedTransporter,
    from: config.from,
    subject: config.subject,
  };
}
