import { Suspense } from 'react';
import SuccessClient from './success-client';

// Shell estática con Suspense: `useSearchParams` dentro del Client
// Component obliga a envolverlo en un boundary para no romper el
// prerender estático de Next.js 15.
export default function SuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Suspense fallback={<FallbackSpinner />}>
        <SuccessClient />
      </Suspense>
    </main>
  );
}

function FallbackSpinner() {
  return (
    <div className="max-w-xl text-center">
      <div
        aria-hidden
        className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900"
      />
      <p className="mt-4 text-neutral-600">Confirmando tu pago…</p>
    </div>
  );
}
