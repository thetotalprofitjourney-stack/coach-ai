'use client';

import Link from 'next/link';
import { useEffect } from 'react';

// Error boundary raíz del App Router. Captura cualquier excepción no
// manejada en Server Components o Client Components. Sin volcado del
// stacktrace al usuario: la app es pública y un mensaje técnico no aporta.
// El botón "Reintentar" invoca `reset()` para rehidratar el segmento
// afectado; el enlace a la home cubre el fallback cuando el reset no
// basta (p. ej. pérdida total del estado de la sesión).
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('root_error', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-neutral-500">
          Error
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Algo no ha ido bien
        </h1>
        <p className="mt-4 text-neutral-600">
          Ha ocurrido un problema inesperado al cargar esta pantalla. Puedes
          reintentarlo o volver al inicio.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-block rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-block rounded-md border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
