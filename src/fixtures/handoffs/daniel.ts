import type { HandoffFixture } from '@/lib/fase2/types';

// Puntuaciones DISC inferidas para este fixture de validación (Paso 5) a partir
// de la lectura conductual del hand-off piloto en docs/handoff-01-daniel.md.
// En el flujo real de Fase 1 las producirá el administrador DISC.
export const danielFixture: HandoffFixture = {
  slug: 'daniel',
  label: 'Daniel Morales — D-C, autónomo',
  handoff: {
    contexto_personal: {
      alias: 'Daniel Morales',
      edad: 38,
      estado_civil_y_familia: 'Casado, una hija de 6 años',
      momento_profesional:
        'En activo por cuenta ajena, lleva 12 años en la misma empresa como especialista en una disciplina estrecha del área de recursos humanos',
    },
    perfil_disc: {
      puntuaciones: { D: 82, I: 30, S: 28, C: 78 },
      lectura_conductual:
        'Perfil con dominancia alta y análisis alto (D-C). Decide con rapidez una vez que considera tener suficientes datos, pero los datos que considera "suficientes" provienen casi siempre de su propia observación interna, no de contrastarlos con terceros. Tolera mal la ambigüedad y tiende a resolverla afirmando una certeza en lugar de investigarla.\n\nBajo tensión adopta una actitud de defensa argumentada: no se retira, no pide opinión, justifica. Su estilo comunicativo es directo, claro, con poco rodeo emocional. En ítems que medían apertura a la contradicción — por ejemplo, cómo reacciona cuando alguien discrepa públicamente de él — mostró una preferencia consistente por reafirmarse antes que por explorar la discrepancia.',
    },
    patron_personal_familiar:
      'En los ítems de escenario familiar se reflejó una tendencia a resolver rápido y por iniciativa propia, con poca consulta. Ante un conflicto prolongado en el entorno cercano su elección preferida fue confrontar directamente; la opción de consultar con terceros o mediar quedó descartada.',
    patron_profesional:
      'Alta tolerancia al riesgo profesional declarado, pero ausencia de diversidad de entornos en la trayectoria: sus elecciones en escenarios laborales reflejan continuidad, especialización y profundidad sobre una misma realidad organizativa. Valora el dominio técnico por encima del aprendizaje transversal.',
    terminos_subjetivos: ['Independencia', 'Ser mi propio jefe', 'Estar listo', 'Dar el salto'],
    observaciones_y_tensiones: [
      {
        id: 'H1',
        contenido:
          'Daniel afirma que "está listo" para ser autónomo, pero su trayectoria — 12 años en una única empresa y especialización en un nicho estrecho — sugiere baja exposición a entornos distintos al suyo. Conviene sondear con qué evidencia concreta sostiene esa sensación de preparación, no asumir el juicio.',
      },
      {
        id: 'H2',
        contenido:
          'Su perfil D-C es compatible con el arranque de un negocio propio en términos de decisión y rigor, pero débil en los factores que típicamente pesan en la captación comercial (I bajo). No mencionar esto al usuario; sondear con preguntas sobre cómo imagina conseguir sus primeros clientes, qué ha hecho ya en esa dirección, qué red tiene activa.',
      },
      {
        id: 'H3',
        contenido:
          'La palabra "independencia" puede estar funcionando más como reacción a algo de su situación actual que como objetivo positivo por sí mismo. Explorar qué le molesta hoy antes de aceptar la autonomía como meta definida.',
      },
    ],
    disparador_fase2:
      'Quiero montar mi propio negocio como consultor. Llevo años pensándolo y ahora sí creo que estoy listo para dar el salto.',
  },
};
