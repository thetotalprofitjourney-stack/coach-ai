import type { Fase1Fixture } from '@/lib/fase1/types';

// Carmen Velasco — perfil S-D (reverse-engineered del hand-off piloto
// docs/handoff-02-carmen.md). Dominante S en mayoría de ítems (estilo
// paciente, consulta, espera activa), con componente D secundaria que
// aflora en las decisiones profesionales de calado. Vocabulario clave:
// "legado", "buenas manos", "justo", "tranquilidad".
export const fixtureCarmen: Fase1Fixture = {
  slug: 'carmen',
  label: 'Carmen Velasco (S-D, sucesión empresa familiar)',
  formulario: {
    nombre: 'Carmen Velasco',
    edad: 62,
    estado_civil_y_familia:
      'Viuda desde hace 4 años. Dos hijos adultos: Pablo (36), trabaja en la empresa familiar desde hace 10 años como responsable comercial; Marta (33), médico, ejerce en otra ciudad y nunca ha querido incorporarse al negocio.',
    zona_geografica: 'Valencia.',
    momento_profesional:
      'Fundadora y directora de una empresa industrial mediana, 55 empleados. Al frente desde hace 30 años.',
    disparador:
      'Quiero jubilarme pero no tengo claro qué hacer con la empresa. Hay tres opciones que me rondan — pasarla al que está dentro, venderla, o incluso cerrarla. Ninguna me acaba de convencer del todo.',
  },
  respuestas: [
    { letter: 'C' },
    { letter: 'C', freeText: 'Prefiero no forzar el momento.' },
    { letter: 'A', freeText: 'Si es bueno para la empresa acepto y luego voy organizando.' },
    { letter: 'B', freeText: 'Un café informal y ver qué le pasa.' },
    { letter: 'A', freeText: 'Cuando es el futuro del negocio decido con firmeza.' },
    { letter: 'C', freeText: 'Los cambios grandes se piensan despacio.' },
    { letter: 'A', freeText: 'En algo del negocio no me puedo permitir la parálisis.' },
    { letter: 'A' },
    { letter: 'C', freeText: 'Estas cosas a veces se recomponen solas.' },
    { letter: 'C', freeText: 'Hablo con cada uno por separado antes de cerrar nada.' },
    { letter: 'C' },
    { letter: 'C', freeText: 'No merece la pena remover algo que no resolveremos esa tarde.' },
    { letter: 'C', freeText: 'Necesito tiempo para acostumbrarme a la idea.' },
    { letter: 'C', freeText: 'Estar en casa con los míos me da tranquilidad.' },
    { letter: 'C', freeText: 'Es su vida. Quiero que sea algo justo para él.' },
    { letter: 'C', freeText: 'Prefiero no cargar a los demás con lo que me pasa. Pienso mucho en el legado y en dejar todo en buenas manos.' },
  ],
};
