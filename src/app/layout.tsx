import type { Metadata } from 'next';
import { Lora } from 'next/font/google';
import './globals.css';

// Lora se usa exclusivamente para el h1 del hero en la landing (clase
// font-serif). El resto de la app usa la pila sans por defecto de Tailwind.
const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
});

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
    <html lang="es" className={lora.variable}>
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
