import Link from 'next/link';
import type { Metadata } from 'next';
import LandingCTAs from './_components/landing-ctas';

export const metadata: Metadata = {
  title: 'Coach AI — Una sesión para una decisión',
  description:
    'Sesión única de coaching profesional asistida por IA, completamente anónima, sin registro.',
};

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-md text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Coach AI
          </p>
          <h1 className="mt-4 font-serif text-3xl font-semibold leading-snug tracking-tight text-neutral-900 sm:text-4xl">
            Para tomar la decisión
            <br />
            que llevas tiempo aplazando.
          </h1>

          <div className="mt-10">
            <LandingCTAs />
          </div>

          <p className="mt-8 text-xs text-neutral-400">
            Sin cuenta · Sin email · Lo que importa ya está contigo
          </p>
        </div>
      </main>

      <footer className="border-t border-neutral-100 py-5 text-center">
        <Link
          href="/privacidad"
          className="text-xs text-neutral-400 underline-offset-4 hover:text-neutral-600 hover:underline"
        >
          Política de privacidad
        </Link>
      </footer>
    </div>
  );
}
