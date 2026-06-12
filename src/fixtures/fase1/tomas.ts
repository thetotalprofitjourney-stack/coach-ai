import type { Fase1Fixture } from '@/lib/fase1/types';

// Tomás Iriarte — perfil I-D (reverse-engineered del hand-off piloto
// docs/handoff-06-tomas.md). Dominante I (letra B en mayoría de ítems,
// estilo relacional y movilizador) con componente D que aflora en los
// ítems de acción una vez decidido. Vocabulario clave del piloto:
// "oportunidad única", "bueno para todos", "lo tenemos claro", "apoyo".
export const fixtureTomas: Fase1Fixture = {
  slug: 'tomas',
  label: 'Tomás Iriarte (I-D, oferta internacional con familia)',
  formulario: {
    alias: 'Tomás Iriarte',
    edad: 35,
    estado_civil_y_familia:
      'Casado con María desde hace 9 años. Dos hijas (5 y 2 años). María es abogada en activo con carrera consolidada.',
    momento_profesional:
      'Gerente en una farmacéutica española, 8 años en el sector. Acaba de recibir una oferta sustancial de una multinacional con sede en Zúrich.',
    disparador:
      'Tengo una oferta muy buena en Suiza y queremos mudarnos en familia. Quiero planificarlo bien y no dejar cabos sueltos.',
    reto_dominio: 'general',
  },
  respuestas: [
    { letter: 'B', freeText: 'Aprovecho para abrir conversaciones con gente del sector.' },
    { letter: 'B', freeText: 'Mis dudas las planteo como matices que enriquecen la propuesta.' },
    { letter: 'A', freeText: 'Lo acepto. Es una oportunidad única y vamos haciendo sobre la marcha.' },
    { letter: 'B', freeText: 'Un café informal con él y entender qué le pasa.' },
    { letter: 'B', freeText: 'Necesito hablar con gente que haya pasado por algo parecido.' },
    { letter: 'B' },
    { letter: 'B', freeText: 'Llamo a dos o tres personas de confianza para contrastar mi intuición.' },
    { letter: 'A', freeText: 'Me comprometo sin dudar y movilizo al equipo.' },
    { letter: 'B' },
    { letter: 'B', freeText: 'Una cena tranquila, lo planteo y vemos cómo reaccionan. Lo tenemos claro como familia.' },
    { letter: 'B', freeText: 'Le animo a rodearse de gente que le empuje hacia delante.' },
    { letter: 'B', freeText: 'Reconducir hacia un terreno más ligero.' },
    { letter: 'A', freeText: 'Si me convence, nos ponemos en marcha. Mi mujer y yo estamos alineados.' },
    { letter: 'B', freeText: 'Un plan con familia y amigos. Sin compañía se me hace raro.' },
    { letter: 'B', freeText: 'Le transmito mi preocupación en positivo, mi apoyo pase lo que pase.' },
    { letter: 'B', freeText: 'Hablo mucho del tema, comparto con los míos. Es como lo proceso. Creo que esto va a ser bueno para todos.' },
  ],
};
