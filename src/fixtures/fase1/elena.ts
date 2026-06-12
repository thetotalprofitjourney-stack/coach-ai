import type { Fase1Fixture } from '@/lib/fase1/types';

// Elena Roig — perfil I-S (reverse-engineered del hand-off piloto
// docs/handoff-03-elena.md). Dominante relacional (letra B, factor I) en
// ítems que miden armonía y acompañamiento, con fuerte componente S
// (letra C) en los ítems que ofrecen espera o acomodación bajo tensión.
// Casi ausencia del factor D — la confrontación directa no aparece como
// opción preferida en ningún ítem. Vocabulario del piloto que debe aflorar
// en la síntesis: "volver a ser yo", "esta vida no es la que quiero",
// "cambio", "felicidad", "no lo sé", matización constante ("depende",
// "no lo tengo claro") como rasgo observado en §5.1.3.
export const fixtureElena: Fase1Fixture = {
  slug: 'elena',
  label: 'Elena Roig (I-S, replanteamiento existencial)',
  formulario: {
    alias: 'Elena Roig',
    edad: 48,
    estado_civil_y_familia:
      'Casada desde hace 22 años. Dos hijos: chica de 16 años y chico de 13.',
    momento_profesional:
      'Llevo 18 años sin trabajar fuera de casa. Antes fui correctora y editora junior en una pequeña editorial. Desde que nació la mayor me dediqué a los hijos y a la casa.',
    disparador:
      'Siento que esta vida no es la que quiero. Quiero cambiar, aunque todavía no sé exactamente qué ni cómo. Sólo sé que no puedo seguir así mucho más tiempo.',
    reto_dominio: 'general',
  },
  respuestas: [
    { letter: 'B', freeText: 'Depende, no lo tengo claro. Quizá acercarme a gente que me importa.' },
    { letter: 'C', freeText: 'No suelo ir de frente. Si acaso, luego hablo con la persona a solas.' },
    { letter: 'C', freeText: 'Lo hablaría en casa y con alguna amiga cercana antes de responder.' },
    { letter: 'B', freeText: 'Le buscaría un momento informal para entender qué le pasa, sin presionarle.' },
    { letter: 'C', freeText: 'Lo pensaría mucho. Una cosa así afecta a toda la familia.' },
    { letter: 'B', freeText: 'Me interesa saber qué vería distinto, lo hablaríamos con calma.' },
    { letter: 'C', freeText: 'Prefiero no forzar cambios si no tengo la información suficiente.' },
    { letter: 'C', freeText: 'Antes que nada me aseguro de que nadie en el equipo se vea desbordado.' },
    { letter: 'C', freeText: 'Prefiero no remover. Esas cosas a veces se recomponen solas.' },
    { letter: 'B', freeText: 'Lo planteo en una cena y vamos viendo cómo nos vamos sintiendo todos.' },
    { letter: 'C', freeText: 'Escucho. Más que dar consejo, acompañar. Aunque a veces me cuesta no intervenir.' },
    { letter: 'B', freeText: 'Intento bajarle el tono. Que nadie salga de la reunión con mal cuerpo.' },
    { letter: 'C', freeText: 'Le pido tiempo. A los cambios necesito darles vueltas antes de decir nada.' },
    { letter: 'C', freeText: 'En casa, con los niños, haciendo cosas que no da tiempo entre semana.' },
    { letter: 'B', freeText: 'Le dejo saber que ahí voy a estar, pase lo que pase. No voy a decirle lo que tiene que hacer.' },
    { letter: 'C', freeText: 'Prefiero no cargar a nadie con esto. A veces pienso que quiero volver a ser yo, pero no sé muy bien qué quiere decir eso.' },
  ],
};
