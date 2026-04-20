export default function SessionNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10 text-base md:text-[17px]">
      <h1 className="text-2xl font-semibold tracking-tight">
        Sesión no encontrada
      </h1>
      <p className="mt-4 text-neutral-600">
        El enlace no es válido o la sesión ya no existe.
      </p>
    </main>
  );
}
