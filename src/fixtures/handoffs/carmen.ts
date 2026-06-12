import type { HandoffFixture } from '@/lib/fase2/types';

// Puntuaciones DISC inferidas para este fixture de validación (Paso 5) a partir
// de la lectura conductual del hand-off piloto en docs/handoff-02-carmen.md.
// En el flujo real de Fase 1 las producirá el administrador DISC.
export const carmenFixture: HandoffFixture = {
  slug: 'carmen',
  label: 'Carmen Velasco — S-D, sucesión',
  handoff: {
    contexto_personal: {
      alias: 'Carmen Velasco',
      edad: 62,
      estado_civil_y_familia:
        'Viuda (marido fallecido hace 4 años). Dos hijos adultos: Pablo, 36 años, trabaja en la empresa familiar como responsable comercial desde hace 10 años; Marta, 33 años, médico, ejerce en otra ciudad y nunca ha querido incorporarse al negocio',
      momento_profesional:
        'Fundadora y directora de una empresa industrial mediana (55 empleados). Al frente desde hace 30 años',
    },
    perfil_disc: {
      puntuaciones: { D: 55, I: 40, S: 80, C: 50 },
      lectura_conductual:
        'Perfil de estabilidad dominante con un componente de dominancia secundaria (S-D). Carmen decide despacio, escuchando, buscando acomodar intereses antes de pronunciarse. Su instinto es preservar lo que funciona y cuidar las relaciones; los cambios que introduce son incrementales, no disruptivos.\n\nBajo tensión tiende a aplazar la confrontación directa y a buscar salidas que eviten daño a los demás. Esto se observó con nitidez en varios ítems familiares, donde ante conflictos prolongados eligió sistemáticamente la espera activa ("dar tiempo") sobre la resolución inmediata.\n\nSu componente D aparece de manera matizada en decisiones profesionales de calado: cuando algo afecta a la continuidad del negocio es capaz de tomar decisiones firmes, pero rara vez en contra del bienestar percibido de su entorno más próximo.',
    },
    patron_personal_familiar:
      'Orientación marcada a la protección familiar. En los ítems de escenario personal se observó una resistencia a establecer jerarquías o tratos diferenciados entre personas cercanas, incluso cuando la situación lo requería. Evita declarar preferencias que pudieran interpretarse como favoritismo.',
    patron_profesional:
      'Liderazgo paciente, con foco en consolidación. En los ítems profesionales, frente al dilema entre dejar una estructura probada o renovarla, prefirió sistemáticamente la renovación progresiva. Apego emocional alto al proyecto profesional, declarado en varios momentos del DISC.',
    terminos_subjetivos: ['Legado', 'Justo', 'Buenas manos', 'Tranquilidad'],
    observaciones_y_tensiones: [
      {
        id: 'H1',
        contenido:
          'Carmen verbaliza querer "dejar la empresa en buenas manos", pero no ha explicitado qué considera "buenas manos". El criterio parece estar mezclado con protección afectiva. Sondear qué capacidades concretas espera de un sucesor y si ella percibe que están presentes, sin mencionar a su hijo Pablo por su nombre a menos que ella lo haga primero.',
      },
      {
        id: 'H2',
        contenido:
          'El concepto "justo" está presente en su formulación y probablemente se refiere al equilibrio entre sus dos hijos. Pero Pablo trabaja en la empresa y Marta no, lo que hace que "igualdad" y "justicia" puedan no coincidir. Explorar cómo define ella el equilibrio entre sus hijos sin imponerle el marco.',
      },
      {
        id: 'H3',
        contenido:
          'La opción de cerrar la empresa, aunque Carmen la mencionó como posibilidad, encaja mal con su perfil S y con su vínculo emocional declarado. Puede estar en la lista por completitud mental, no como alternativa real. Explorar si es una posibilidad viva o una cortesía al pensamiento.',
      },
    ],
    disparador_fase2:
      'Quiero jubilarme pero no tengo claro qué hacer con la empresa. Hay tres opciones que me rondan — pasarla al que está dentro, venderla, o incluso cerrarla. Ninguna me acaba de convencer del todo.',
  },
};
