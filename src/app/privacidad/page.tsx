import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de privacidad — Coach AI',
  description:
    'Modelo de anonimato, retención de datos y derechos RGPD de Coach AI.',
};

// Política de privacidad (§6.4). Texto breve redactado en JSX con los datos
// del operador (razón social, NIF y contacto) cableados literalmente. Si
// cambia el operador, esos datos se tocan aquí y en los metadatos del
// layout; no hay configuración en runtime.
export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Política de privacidad
        </h1>
        <p className="mt-5 text-base text-neutral-600">
          Esta política explica qué datos maneja Coach AI, durante cuánto
          tiempo se conservan y cómo se mantienen separados el sistema de
          facturación y el sistema de sesión.
        </p>

        <section className="mt-12 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            1. Anonimato del servicio
          </h2>
          <p className="text-base leading-relaxed text-neutral-700">
            Coach AI no requiere registro ni crea cuentas de usuario. No se
            solicita correo electrónico, no se almacena la dirección IP del
            navegador ni identificadores equivalentes. La única referencia
            interna de tu sesión es un identificador técnico aleatorio
            (UUID v4) generado en el momento del pago. Ese identificador no
            está asociado a tus datos fiscales ni a ningún otro dato
            personal dentro del sistema de sesión.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            2. Separación entre facturación y sesión
          </h2>
          <p className="text-base leading-relaxed text-neutral-700">
            El cobro se procesa a través de Stripe, que trata los datos
            fiscales mínimos necesarios para emitir la factura (nombre,
            dirección, NIF si procede). Esos datos permanecen
            exclusivamente en el sistema de facturación de Stripe y del
            operador, y se conservan durante el plazo que exija la
            normativa fiscal aplicable (habitualmente seis años en España).
          </p>
          <p className="text-base leading-relaxed text-neutral-700">
            El sistema de sesión de Coach AI no recibe esos datos
            fiscales. El único vínculo entre el pago y la sesión vive en
            los metadatos de la Checkout Session de Stripe, y no puede
            reconstruirse desde dentro de la aplicación.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            3. Datos que manejamos durante la sesión
          </h2>
          <p className="text-base leading-relaxed text-neutral-700">
            Para que el coach pueda trabajar contigo, el formulario inicial
            recoge: nombre con el que quieres que te llame, edad, situación
            familiar, zona geográfica, momento profesional y la decisión o
            dilema que quieres abordar. Durante la sesión se registran
            también tus respuestas al cuestionario inicial y los turnos de
            la conversación.
          </p>
          <p className="text-base leading-relaxed text-neutral-700">
            Esta información se utiliza únicamente durante la sesión activa
            y para generar el informe final. No se cruza con ningún otro
            sistema, no se emplea para entrenar modelos y no se comparte
            con terceros, salvo el proveedor externo de modelos de lenguaje
            contratado por el operador para hacer funcionar al coach, que
            procesa cada mensaje bajo acuerdo de confidencialidad y no
            retiene el contenido tras el procesamiento.
          </p>
          <p className="text-base leading-relaxed text-neutral-700">
            Al finalizar la sesión puedes solicitar, de forma totalmente
            opcional, que te enviemos el informe a una dirección de email.
            Si lo haces, la dirección viaja al proveedor de correo
            contratado por el operador junto con el informe adjunto y
            <strong> no se almacena en nuestros servidores</strong>: sólo
            dejamos una marca técnica anónima para impedir reenvíos
            múltiples de la misma sesión. Si no rellenas ese campo, no
            recogemos ningún dato de contacto.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            4. Retención y borrado
          </h2>
          <p className="text-base leading-relaxed text-neutral-700">
            Al cerrar la sesión, de forma manual o automática diez minutos
            después de descargar el informe, los datos de la sesión pasan
            a estado cerrado y se borran en la siguiente ventana nocturna
            de limpieza (entre las 3:00 y las 5:00, hora local del
            servidor). El borrado es definitivo: no existe copia lógica
            recuperable.
          </p>
          <p className="text-base leading-relaxed text-neutral-700">
            Si inicias una sesión y no la completas, tus datos se eliminan
            automáticamente 48 horas después de su creación. Durante ese
            plazo, el enlace con el identificador técnico permite retomar
            la sesión desde cualquier dispositivo —es útil si se te cae la
            conexión o cierras la pestaña por error—; transcurridas las
            48 horas, el enlace deja de ser válido y los datos se borran.
            El operador puede ajustar este plazo en el rango de 12 a 168
            horas sin afectar al modelo de anonimato.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">5. Cookies</h2>
          <p className="text-base leading-relaxed text-neutral-700">
            Coach AI no utiliza cookies publicitarias, analíticas ni de
            terceros. La aplicación puede emplear una cookie técnica
            mínima que contiene únicamente el identificador técnico de la
            sesión durante la visita y se elimina al cerrar la pestaña del
            navegador. Al no haber cookies no funcionales ni seguimiento,
            no se muestra banner de consentimiento.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            6. Responsable del tratamiento y base legal
          </h2>
          <p className="text-base leading-relaxed text-neutral-700">
            El responsable del tratamiento es Total Profit Journey, S.L.,
            con NIF B19344555. La base legal del tratamiento es la ejecución del servicio
            contratado por ti (art. 6.1.b del Reglamento General de
            Protección de Datos). Los datos fiscales se tratan, además,
            por obligación legal (art. 6.1.c RGPD) a efectos de
            facturación.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            7. Tus derechos
          </h2>
          <p className="text-base leading-relaxed text-neutral-700">
            Puedes ejercer los derechos de acceso, rectificación,
            supresión, oposición, limitación del tratamiento y portabilidad
            sobre tus datos fiscales dirigiéndote al operador por los
            canales de contacto indicados más abajo. Debido al modelo
            anónimo del sistema de sesión, los datos generados durante la
            propia sesión no pueden vincularse con tu identidad una vez
            borrados, por lo que los derechos sobre esos datos se ejercen
            en la práctica cerrando la sesión (o esperando las 48 horas si
            se abandona).
          </p>
          <p className="text-base leading-relaxed text-neutral-700">
            También puedes presentar una reclamación ante la Agencia
            Española de Protección de Datos (www.aepd.es) si consideras
            que el tratamiento no se ajusta a la normativa.
          </p>
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">8. Contacto</h2>
          <p className="text-base leading-relaxed text-neutral-700">
            Para cualquier cuestión relacionada con esta política o con el
            tratamiento de tus datos, escribe a{' '}
            <a
              href="mailto:info@totalprofitjourney.com"
              className="underline-offset-4 hover:underline"
            >
              info@totalprofitjourney.com
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="border-t border-neutral-200">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-600">
          <Link href="/" className="underline-offset-4 hover:underline">
            Volver al inicio
          </Link>
        </div>
      </footer>
    </div>
  );
}
