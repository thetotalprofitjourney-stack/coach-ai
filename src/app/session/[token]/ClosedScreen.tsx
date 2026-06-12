export function ClosedScreen() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
        Coach AI
      </p>
      <h1 className="mt-3 font-serif text-2xl font-semibold tracking-tight text-neutral-900">
        Lo que trabajaste aquí fue real.
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
        La sesión está cerrada y todos los datos han sido eliminados de nuestros
        servidores. Nada queda aquí — lo que importa ya está contigo.
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">
        Si quieres retomar el proceso, puedes iniciar una nueva sesión cuando
        estés listo.
      </p>
    </main>
  );
}
