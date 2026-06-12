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
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Una sesión para trabajar
              <br className="hidden sm:inline" /> una decisión difícil
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-300 sm:text-xl">
              Coaching profesional asistido por IA. Anónimo, sin registro, con
              informe descargable al finalizar.
            </p>
            <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <BuyButton variant="light" />
              <PreviewButton variant="light" />
            </div>
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
            No sugiere caminos, no valida emocionalmente, no alaba la respuesta
            fácil. Su único instrumento es la pregunta. La claridad y la decisión
            salen de ti.
          </p>
        </section>

        {/* Cómo funciona */}
        <section className="border-t border-neutral-100">
          <div className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              Cómo funciona
            </p>
            <ol className="mt-10 space-y-10">
              <li className="flex gap-6">
                <span className="flex-none select-none text-3xl font-light text-neutral-200">
                  01
                </span>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">
                    Formulario breve
                  </h3>
                  <p className="mt-2 leading-relaxed text-neutral-600">
                    Dos o tres minutos con tus datos básicos y el dilema o
                    decisión que quieres trabajar hoy.
                  </p>
                </div>
              </li>
              <li className="flex gap-6">
                <span className="flex-none select-none text-3xl font-light text-neutral-200">
                  02
                </span>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">
                    Cuestionario y sesión de coaching
                  </h3>
                  <p className="mt-2 leading-relaxed text-neutral-600">
                    Una fase inicial conversacional de 15 a 20 minutos para
                    calibrar tu perfil y, a continuación, una sesión de
                    coaching de 40 a 50 minutos sobre tu decisión.
                  </p>
                </div>
              </li>
              <li className="flex gap-6">
                <span className="flex-none select-none text-3xl font-light text-neutral-200">
                  03
                </span>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">
                    Informe final
                  </h3>
                  <p className="mt-2 leading-relaxed text-neutral-600">
                    Al cerrar, descargas un informe estructurado en PDF y Word
                    con tu objetivo, razones, decisión y primer paso.
                  </p>
                </div>
              </li>
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
                  title: 'Informe estructurado',
                  body: 'Objetivo, razones, decisión y primer paso. Descargable en PDF y Word.',
                },
                {
                  title: 'Anonimato total',
                  body: 'Sin cuenta, sin email. Tus datos no se conservan más allá de la sesión.',
                },
                {
                  title: 'Una sola sesión',
                  body: 'Sin suscripción, sin seguimiento, sin próxima cita.',
                },
                {
                  title: 'Privacidad por diseño',
                  body: 'Todo se elimina cuando cierras. Nada queda en el servidor.',
                },
              ].map(({ title, body }) => (
                <li
                  key={title}
                  className="rounded-xl border border-neutral-200 bg-white p-5"
                >
                  <p className="font-semibold text-neutral-900">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-600">
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
