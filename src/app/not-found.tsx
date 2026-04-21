import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Página no encontrada',
  robots: { index: false, follow: false },
};

// 404 raíz del App Router. Disparada por Next cuando ninguna ruta casa
// (p. ej. tokens de sesión inválidos que hacen `notFound()` en
// `/session/[token]`). Misma paleta y tipografía que la landing; sin
// enlaces al privacy ni CTA de compra — quien llega aquí está buscando
// algo concreto, no se le redirige a comprar.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-neutral-500">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          No hemos encontrado esta página
        </h1>
        <p className="mt-4 text-neutral-600">
          El enlace puede haber caducado o la dirección puede estar mal
          escrita. Si intentabas retomar una sesión, recuerda que los enlaces
          de sesión expiran 24 horas después de iniciarse.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
