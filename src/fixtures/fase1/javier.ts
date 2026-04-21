import type { Fase1Fixture } from '@/lib/fase1/types';

// Javier Ponce — perfil D-C (reverse-engineered del hand-off piloto
// docs/handoff-04-javier.md). Dominante D (letra A) en ítems de acción y
// ambición, con componente C secundaria (letra D) en los ítems que piden
// estructura, escenarios o hitos. Ausencia de I/S: el hand-off marca
// expresamente 'bajo registro emocional' y 'acción unánimemente elegida
// frente a opciones relacionales'. Vocabulario del piloto que debe
// aflorar en la síntesis: 'el siguiente nivel', 'lo que haga falta',
// 'apoyo familiar', 'CEO en 4 años'. Nótese que el hand-off piloto
// advierte que Javier procesa los ítems familiares 'con la misma lente
// estratégica que los profesionales' — los freetexts de los ítems 9-16
// lo reflejan manteniendo el tono de efecto y resultado.
export const fixtureJavier: Fase1Fixture = {
  slug: 'javier',
  label: 'Javier Ponce (D-C, CEO en 4 años)',
  formulario: {
    nombre: 'Javier Ponce',
    edad: 44,
    estado_civil_y_familia:
      'Casado desde hace 13 años. Dos hijos: chica de 10 años, chico de 7.',
    zona_geografica:
      'Madrid, con desplazamientos internacionales el 60-70% del tiempo.',
    momento_profesional:
      'COO regional de una multinacional tecnológica. 18 años de trayectoria con tres cambios de empresa para subir peldaño.',
    disparador:
      'Quiero llegar a CEO en los próximos 4 años. Necesito saber qué tengo que hacer para conseguirlo y, sobre todo, qué estoy haciendo mal ahora mismo que esté ralentizando el camino.',
  },
  respuestas: [
    { letter: 'A', freeText: 'La calma dura poco si buscas el siguiente nivel.' },
    { letter: 'A', freeText: 'Si tengo datos, lo digo en el momento. Ir después por pasillos no lleva a nada.' },
    { letter: 'A', freeText: 'Lo acepto. La oportunidad pesa más que la incertidumbre.' },
    { letter: 'A', freeText: 'Conversación directa esta semana con los números sobre la mesa.' },
    { letter: 'D', freeText: 'Plan con escenarios, números y un punto de no retorno antes de comprometerme.' },
    { letter: 'A', freeText: 'Si el resultado está, no veo motivo para cambiar el proceso.' },
    { letter: 'A', freeText: 'Decido con lo que tengo y priorizo la variable que más peso tiene. La parálisis cuesta más que una decisión imperfecta.' },
    { letter: 'D', freeText: 'Descompongo el objetivo en hitos con fechas y responsables antes de comprometer el plazo global.' },
    { letter: 'A', freeText: 'Lo hablo directo y se resuelve. Las cosas se enconan si no las tocas.' },
    { letter: 'A', freeText: 'Decido lo que creo mejor para la familia y luego lo comparto. Mi mujer me apoya.' },
    { letter: 'A', freeText: 'Le digo lo que veo. Prefiero eso a que se quede rumiando sin avanzar.' },
    { letter: 'A', freeText: 'Si tengo postura clara, entro. Callar por no discutir no es mi estilo.' },
    { letter: 'A', freeText: 'Si me convence, al día siguiente nos ponemos en marcha.' },
    { letter: 'D', freeText: 'Lo planifico la semana anterior para que cunda de verdad.' },
    { letter: 'A', freeText: 'Le digo lo que pienso con datos. Después es su vida, pero con mi criterio encima de la mesa.' },
    { letter: 'A', freeText: 'Hacer cosas. Rumiar no arregla nada. Con la familia me apoyo pero sin extenderme. Voy a hacer lo que haga falta.' },
  ],
};
