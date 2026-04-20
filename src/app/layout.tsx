import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Coach AI',
  description: 'Sesión única de coaching asistida por IA, anónima y acotada.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
