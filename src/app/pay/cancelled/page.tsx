import Link from 'next/link';

// Página post-pago cancelado (§2.2). Estática, sin query params ni
// llamadas a la API: Stripe redirige aquí cuando el usuario cierra la
// Checkout Session sin completar el pago. No hay fila en `sessions`
// porque la creación está condicionada a `checkout.session.completed`.
export default function CancelledPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          No se ha completado el pago
        </h1>
        <p className="mt-4 text-neutral-600">
          Si fue un error, puedes volver a intentarlo.
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
