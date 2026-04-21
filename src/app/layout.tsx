import type { Metadata } from 'next';
import './globals.css';

// `metadataBase` resuelve URLs relativas de Open Graph. En prod apunta al
// dominio público configurado en `APP_PUBLIC_URL` (mismo valor que ya
// consume el backend para construir `success_url` de Stripe); en dev cae
// al localhost para que el build local no reviente.
const baseUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'Coach AI — Sesión única de coaching profesional anónima',
    template: '%s — Coach AI',
  },
  description:
    'Una sesión de coaching profesional asistida por IA, completamente anónima, sin registro ni seguimiento. Un pago, una sesión, un informe descargable.',
  applicationName: 'Coach AI',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    siteName: 'Coach AI',
    title: 'Coach AI — Sesión única de coaching profesional anónima',
    description:
      'Una sesión de coaching profesional asistida por IA, completamente anónima. Un pago, una sesión, un informe descargable.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
