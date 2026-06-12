import type { HandoffFixture } from '@/lib/fase2/types';

// Puntuaciones DISC inferidas para este fixture de validación (Paso 5) a partir
// de la lectura conductual del hand-off piloto en docs/handoff-06-tomas.md.
// En el flujo real de Fase 1 las producirá el administrador DISC.
export const tomasFixture: HandoffFixture = {
  slug: 'tomas',
  label: 'Tomás Iriarte — I-D, mudanza familiar',
  handoff: {
    contexto_personal: {
      alias: 'Tomás Iriarte',
      edad: 35,
      estado_civil_y_familia:
        'Casado con María desde hace 9 años. Dos hijas (5 años y 2 años). María es profesional en activo con carrera propia consolidada en el ámbito jurídico',
      momento_profesional:
        'Gerente en una empresa farmacéutica española, 8 años en el sector. Recientemente ha recibido una oferta sustancial de una multinacional con sede en Zúrich',
    },
    perfil_disc: {
      puntuaciones: { D: 55, I: 82, S: 45, C: 35 },
      lectura_conductual:
        'Perfil influyente con dominancia secundaria (I-D). Tomás combina entusiasmo, facilidad de relación y una capacidad alta de proyectarse en escenarios favorables. Convierte oportunidades en planes con rapidez y tiende a trabajar desde la expectativa de que las personas relevantes compartirán su lectura de la situación.\n\nBajo tensión su mecanismo habitual es la acción social: busca conversación, apoyo, contraste verbal. Pero — y esto es importante — la conversación que busca suele ser confirmatoria más que interrogativa. En varios ítems que ofrecían la opción de "pedir opinión crítica" o "pedir apoyo emocional", eligió la segunda.\n\nEl componente D, aunque secundario, aparece al final del proceso: una vez convencido, empuja para ejecutar y tiene poca tolerancia a revisiones de fondo.',
    },
    patron_personal_familiar:
      'Alta orientación a la familia entendida como grupo en el que se avanza conjuntamente. En ítems que proponían decisiones con impacto diferencial entre miembros de la familia, Tomás eligió mayoritariamente la opción que suponía consenso previo; pero la definición práctica de ese consenso, en varios casos, era la asunción de que todos compartirían el marco de la decisión.',
    patron_profesional:
      'Capacidad de adaptación alta, buena red profesional, trayectoria ascendente con estabilidad de empresa. Los ítems profesionales de cambio de entorno mostraron apertura y proyección positiva, sin exploración sistemática de los costes.',
    terminos_subjetivos: ['Oportunidad única', 'Bueno para todos', 'Lo tenemos claro', 'Apoyo'],
    observaciones_y_tensiones: [
      {
        id: 'H1',
        contenido:
          'Tomás habla en plural ("queremos", "lo tenemos claro", "nosotros vamos a") sobre una decisión que implica a su mujer en un cambio sustancial de su propia carrera y vida. Conviene sondear qué ha dicho concretamente ella, cuándo, y con qué matices — distinguiendo entre conversaciones efectivas y asunciones de consenso.',
      },
      {
        id: 'H2',
        contenido:
          'La expresión "oportunidad única" puede estar funcionando como cierre del debate más que como descripción. Explorar qué haría que no lo fuera, y qué otras oportunidades podrían no estar considerándose por la urgencia percibida de esta.',
      },
      {
        id: 'H3',
        contenido:
          'Su perfil I-D es compatible con la buena ejecución de una mudanza una vez decidida, pero débil en la parte de interrogación crítica previa. El riesgo no es que la decisión sea equivocada; es que se tome con una verificación insuficiente del estado real del consenso familiar y que las renuncias de María emerjan tarde, cuando el cambio ya esté en marcha.',
      },
    ],
    disparador_fase2:
      'Tengo una oferta muy buena en Suiza y queremos mudarnos en familia. Quiero planificarlo bien y no dejar cabos sueltos.',
  },
};
