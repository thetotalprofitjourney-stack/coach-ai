import type { Fase1Fixture } from '@/lib/fase1/types';

// Lucía Herrero — perfil C-D (reverse-engineered del hand-off piloto
// docs/handoff-05-lucia.md). Dominante C (letra D, factor C) en casi
// todos los ítems — 'rigor analítico', 'pide datos antes de decidir',
// 'preferencia por reunir más información'. Componente D secundaria
// (letra A) que aparece específicamente en ítems donde el hand-off marca
// 'claridad sobre lo que no quiere' (discrepancia directa, confrontación
// de bajo rendimiento, ruptura de tensión prolongada). Una única C
// (letra C, factor S) en el ítem 7 para reflejar su tendencia declarada
// a 'posponer antes que decidir con incertidumbre'. Vocabulario del
// piloto que debe aflorar: 'propósito', 'algo mío', 'encontrar mi camino',
// 'no avanzo', 'no sé'.
export const fixtureLucia: Fase1Fixture = {
  slug: 'lucia',
  label: 'Lucía Herrero (C-D, fuga de consultoría)',
  formulario: {
    nombre: 'Lucía Herrero',
    edad: 28,
    estado_civil_y_familia: 'Soltera, sin hijos. Vivo sola en alquiler.',
    zona_geografica: 'Bilbao.',
    momento_profesional:
      'Consultora en una firma Big4, llevo 3 años. Tengo un ahorro acumulado equivalente a unos 8 meses de mis gastos actuales.',
    disparador:
      'Tengo claro que no quiero seguir en consultoría, pero no sé qué sí quiero. Llevo mucho tiempo dándole vueltas y no avanzo. Necesito decidir algo ya.',
  },
  respuestas: [
    { letter: 'D', freeText: 'Aprovecharía para optimizar lo que ya funciona. Siempre hay margen si miras los procesos.' },
    { letter: 'D', freeText: 'No opino sin información suficiente. Pido ver los datos primero.' },
    { letter: 'D', freeText: 'Sin objetivos claros y criterios de éxito no me comprometo.' },
    { letter: 'A', freeText: 'Conversación directa esta semana. Tengo claro lo que no encaja y alargarlo no ayuda a nadie.' },
    { letter: 'D', freeText: 'Hago los números de los primeros meses, dibujo escenarios y sólo entonces decido.' },
    { letter: 'D', freeText: 'Le pido que me concrete qué haría distinto y en qué evidencia se basa.' },
    { letter: 'C', freeText: 'Prefiero no precipitarme. Si puedo, elijo lo que menos altera hasta poder valorarlo con calma.' },
    { letter: 'D', freeText: 'Descompongo el objetivo en hitos medibles antes de aceptar el plazo global.' },
    { letter: 'A', freeText: 'Conversación directa. Tengo claro lo que no me encaja, no sirve alargarlo.' },
    { letter: 'D', freeText: 'Preparo la información relevante y la presento. Aunque yo vivo sola, esto lo respondo hipotéticamente.' },
    { letter: 'D', freeText: 'Le hago preguntas para que ordene él los hechos antes de pronunciarme yo.' },
    { letter: 'D', freeText: 'Participo pero pidiendo matices. No me interesa opinar sin base.' },
    { letter: 'D', freeText: 'Pediría concretar: qué implica exactamente, qué costes, qué cambia en el día a día.' },
    { letter: 'D', freeText: 'Lo planifico con antelación. Un fin de semana libre cunde mucho más si sé qué voy a hacer.' },
    { letter: 'D', freeText: 'Le pregunto cómo ha llegado a esa decisión y qué ha considerado, para entender antes de opinar.' },
    { letter: 'D', freeText: 'Intento entender qué me pasa y por qué. Necesito algo mío, un propósito, pero no avanzo y hay que decidir ya.' },
  ],
};
