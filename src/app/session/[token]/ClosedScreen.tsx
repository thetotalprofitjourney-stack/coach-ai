export function ClosedScreen() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10 text-base md:text-[17px]">
      <h1 className="text-2xl font-semibold tracking-tight">
        Esta sesión ya está cerrada
      </h1>
      <p className="mt-4 text-neutral-600">
        Todos los datos han sido eliminados. No es posible volver a acceder a
        esta sesión.
      </p>
    </main>
  );
}
