import type { Fase1Fixture } from '@/lib/fase1/types';

// Daniel Morales — perfil D-C alto (reverse-engineered del hand-off
// piloto docs/handoff-01-daniel.md). Elecciones mayoritarias de factor
// D (letras A en la mayoría de ítems del banco actual) con presencia
// fuerte del factor C (letra D en los ítems donde el rigor analítico
// aflora). Vocabulario: "listo", "dar el salto", "independencia",
// "mi propio jefe". Freetext ocasional para que la síntesis pueda
// detectar términos subjetivos.
export const fixtureDaniel: Fase1Fixture = {
  slug: 'daniel',
  label: 'Daniel Morales (D-C, consultor en transición)',
  formulario: {
    nombre: 'Daniel Morales',
    edad: 38,
    estado_civil_y_familia: 'Casado, una hija de 6 años.',
    zona_geografica: 'Barcelona. Sin disposición declarada a moverse.',
    momento_profesional:
      'En activo por cuenta ajena, 12 años en la misma empresa como especialista de un área estrecha de recursos humanos.',
    disparador:
      'Quiero montar mi propio negocio como consultor. Llevo años pensándolo y ahora sí creo que estoy listo para dar el salto.',
  },
  respuestas: [
    { letter: 'A', freeText: 'Lo tengo claro, un nuevo reto ya.' },
    { letter: 'A' },
    { letter: 'D', freeText: 'Sin objetivos claros no me comprometo.' },
    { letter: 'A' },
    { letter: 'D', freeText: 'Antes haría números y escenarios.' },
    { letter: 'A', freeText: 'Si lo que hago funciona no veo motivo de cambio.' },
    { letter: 'A' },
    { letter: 'A' },
    { letter: 'A', freeText: 'Prefiero poner las cosas sobre la mesa.' },
    { letter: 'A' },
    { letter: 'A', freeText: 'Le doy mi opinión clara aunque no sea la que quiere oír.' },
    { letter: 'A' },
    { letter: 'A' },
    { letter: 'D', freeText: 'Aprovecharía el fin de semana con un plan.' },
    { letter: 'A' },
    { letter: 'A', freeText: 'Hacer cosas me ayuda más que rumiar. Quiero independencia.' },
  ],
};
