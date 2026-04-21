import Link from 'next/link';
import type { Metadata } from 'next';
import BuyButton from './_components/buy-button';

export const metadata: Metadata = {
  title: 'Coach AI — Una sesión para una decisión',
  description:
    'Sesión única de coaching profesional asistida por IA, completamente anónima, con informe descargable al finalizar.',
};

// Landing pública (§2.1). El copy sale de §1 y §2.1 del documento de
// proyecto; el operador revisa antes de producción (ver TODOs en README).
export default function HomePage() {
  const price = process.env.NEXT_PUBLIC_SESSION_PRICE_DISPLAY?.trim() || '—';
  const videoUrl = process.env.NEXT_PUBLIC_PROMO_VIDEO_URL?.trim();

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-16">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Una sesión para trabajar una decisión
          </h1>
          <p className="mt-5 text-base text-neutral-600 sm:text-lg">
            Coaching profesional asistido por IA. Anónimo, acotado, con
            informe descargable al finalizar.
          </p>
          <div className="mt-10">
            <BuyButton />
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Qué es</h2>
          <p className="mt-4 text-base leading-relaxed text-neutral-700 sm:text-lg">
            No es terapia ni coaching humano. Es una sesión única con una IA
            entrenada para escuchar con rigor y preguntar sin dirigirte. No
            sugiere caminos, no valida emocionalmente, no alaba la respuesta
            fácil. Su único instrumento es la pregunta; la decisión sale de ti.
          </p>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Cómo funciona</h2>
          <ol className="mt-6 space-y-6">
            <li>
              <h3 className="text-lg font-medium">1. Formulario breve</h3>
              <p className="mt-2 text-base leading-relaxed text-neutral-700">
                Dos o tres minutos con tus datos básicos y el dilema que
                quieres trabajar hoy.
              </p>
            </li>
            <li>
              <h3 className="text-lg font-medium">
                2. Conversación inicial y sesión de coaching
              </h3>
              <p className="mt-2 text-base leading-relaxed text-neutral-700">
                Una primera fase conversacional de 15 a 20 minutos para
                calibrar el contexto y, a continuación, una sesión de coaching
                de 40 a 50 minutos sobre tu decisión.
              </p>
            </li>
            <li>
              <h3 className="text-lg font-medium">3. Informe final</h3>
              <p className="mt-2 text-base leading-relaxed text-neutral-700">
                Al cerrar, descargas un informe estructurado en PDF y Word con
                lo que has dicho: objetivo, razones, decisión y primer paso.
              </p>
            </li>
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Qué obtienes</h2>
          <ul className="mt-6 space-y-3 text-base leading-relaxed text-neutral-700">
            <li>
              Informe estructurado con tu objetivo, razones, decisión y primer
              paso.
            </li>
            <li>Anonimato total: sin cuenta, sin email, sin datos conservados.</li>
            <li>Una única sesión, sin suscripción ni seguimiento.</li>
            <li>Descarga en PDF y Word.</li>
          </ul>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Vídeo</h2>
          <div className="mt-6 aspect-video w-full overflow-hidden rounded-md bg-neutral-200">
            {videoUrl ? (
              <iframe
                src={videoUrl}
                title="Vídeo promocional"
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-600">
                Vídeo próximamente
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Precio</h2>
          <p className="mt-4 text-2xl font-medium">Una sesión — {price}</p>
          <p className="mt-3 text-base text-neutral-600">Pago único. Sin suscripción.</p>
          <div className="mt-10">
            <BuyButton />
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-600">
          <Link href="/privacidad" className="underline-offset-4 hover:underline">
            Política de privacidad
          </Link>
        </div>
      </footer>
    </div>
  );
}
