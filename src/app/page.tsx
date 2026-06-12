import Link from 'next/link';
import type { Metadata } from 'next';
import BuyButton from './_components/buy-button';
import PreviewButton from './_components/preview-button';

export const metadata: Metadata = {
  title: 'Coach AI — Una sesión para una decisión',
  description:
    'Sesión única de coaching profesional asistida por IA, completamente anónima, con informe descargable al finalizar.',
};

export default function HomePage() {
  const price = process.env.NEXT_PUBLIC_SESSION_PRICE_DISPLAY?.trim() || '—';
  const videoUrl = process.env.NEXT_PUBLIC_PROMO_VIDEO_URL?.trim();

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">

        {/* Hero */}
        <section className="bg-stone-950 text-white">
          <div className="mx-auto max-w-3xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
              Coach AI
            </p>
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-[1.2] tracking-tight sm:text-5xl">
              Para tomar la decisión
              <br className="hidden sm:inline" /> que llevas tiempo aplazando
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-300">
              Una sesión de coaching asistida por IA. Anónima, sin registro,
              con informe descargable al finalizar.
            </p>
            <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <BuyButton variant="light" />
              <PreviewButton variant="light" />
            </div>
            {/* Señal de privacidad justo debajo de los CTAs */}
            <p className="mt-5 text-xs text-stone-500">
              Sin cuenta · Sin email · Los datos desaparecen al cerrar la sesión
            </p>
          </div>
        </section>

        {/* Qué es */}
        <section className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
            Qué es
          </p>
          <p className="mt-5 max-w-2xl text-2xl font-medium leading-snug text-neutral-900 sm:text-3xl">
            No es terapia. No es un chatbot. Es un coach que solo pregunta.
          </p>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            No hay juicios. No hay consejos que no pediste. No hay registro de
            lo que digas. Solo preguntas que te ayudan a llegar a lo que ya
            sabes.
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            La conclusión, sea cual sea, sale de ti. El coach no la conoce de
            antemano.
          </p>
        </section>

        {/* Cómo funciona */}
        <section className="border-t border-neutral-100">
          <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Cómo funciona
            </p>
            <ol className="mt-10 space-y-10">
              {[
                {
                  n: '01',
                  title: 'Cuéntame tu situación',
                  body: 'Un formulario de dos o tres minutos: tus datos básicos y la decisión o dilema que quieres trabajar hoy.',
                },
                {
                  n: '02',
                  title: 'Cuestionario breve y sesión de coaching',
                  body: 'Unas preguntas de perfil (15-20 min) para que el coach te entienda bien, seguidas de una sesión de coaching de 40-50 minutos sobre tu decisión.',
                },
                {
                  n: '03',
                  title: 'Tu informe',
                  body: 'Al cerrar, descargas un informe con lo que has dicho: tu objetivo, las razones de peso, la decisión y el primer paso. En PDF y Word.',
                },
              ].map(({ n, title, body }) => (
                <li key={n} className="flex gap-6">
                  <span className="mt-0.5 flex-none select-none text-3xl font-light leading-none text-neutral-200">
                    {n}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-neutral-900">
                      {title}
                    </h3>
                    <p className="mt-2 leading-relaxed text-neutral-600">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Qué obtienes */}
        <section className="border-y border-neutral-100 bg-stone-50">
          <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Qué obtienes
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {[
                {
                  title: 'Nadie sabe que estás aquí',
                  body: 'Sin cuenta, sin email, sin historial. Anónimo por diseño.',
                },
                {
                  title: 'Un informe que es tuyo',
                  body: 'Lo que dijiste, ordenado. Tu objetivo, tus razones, tu decisión, tu primer paso. En PDF y Word.',
                },
                {
                  title: 'Sin compromisos ni seguimiento',
                  body: 'Una sesión, sin suscripción, sin próxima cita, sin newsletter.',
                },
                {
                  title: 'Lo que dijiste, solo para ti',
                  body: 'Los datos se eliminan al cerrar la sesión. Nada queda en el servidor.',
                },
              ].map(({ title, body }) => (
                <li
                  key={title}
                  className="rounded-xl border border-neutral-200 bg-white p-5"
                >
                  <p className="font-semibold text-neutral-900">{title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Vídeo */}
        {videoUrl && (
          <section className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Vídeo
            </p>
            <div className="mt-6 aspect-video w-full overflow-hidden rounded-xl bg-neutral-100">
              <iframe
                src={videoUrl}
                title="Vídeo promocional"
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </section>
        )}

        {/* Precio */}
        <section className="border-t border-neutral-100">
          <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Precio
            </p>
            <p className="mt-5 text-5xl font-light tracking-tight text-neutral-900">
              {price}
            </p>
            <p className="mt-3 text-neutral-500">
              Una sesión · pago único · sin suscripción
            </p>
            <div className="mt-8">
              <BuyButton />
            </div>
          </div>
        </section>

      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-500">
          <Link
            href="/privacidad"
            className="underline-offset-4 hover:text-neutral-700 hover:underline"
          >
            Política de privacidad
          </Link>
        </div>
      </footer>
    </div>
  );
}
