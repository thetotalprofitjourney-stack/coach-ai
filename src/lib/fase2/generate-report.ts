import { anthropic } from '@/lib/anthropic/client';
import { MODELS } from '@/lib/anthropic/models';
import { parseFinalReport, type FinalReportContent } from './parse-report';
import type { Turn } from './types';

// Señal interna que el coach añade al final de su mensaje de cierre.
// Se almacena en BD pero se filtra antes de mostrarla al usuario.
export const SESSION_COMPLETE_MARKER = '[[SESSION_COMPLETE]]';

const SYSTEM_PROMPT = `\
Eres un asistente que genera el informe estructurado de cierre de una sesión de coaching.

Se te proporciona la transcripción completa de la sesión. Tu tarea es extraer, únicamente de lo que el USUARIO dijo, el contenido de once bloques predefinidos. No añadas interpretaciones tuyas, no extrapoles, no inventes contenido.

Si en la conversación no hubo información suficiente para completar un bloque (porque la sesión fue breve o se interrumpió), escribe "—" en ese bloque.

Genera los once bloques con exactamente este formato, sin ningún texto adicional antes ni después:

**1. Objetivo inicial expresado.**
[literalmente lo que el usuario expresó como su objetivo al inicio]

**2. Razón de peso identificada.**
[la razón que el usuario priorizó como la más importante]

**3. Significado concreto de los términos clave.**
[las definiciones operativas que el usuario dio a palabras subjetivas]

**4. Objetivo reformulado.**
[si el usuario lo concretó o cambió durante la sesión, cómo quedó al final]

**5. Capacidades y recursos reconocidos.**
[lo que el usuario admitió tener a favor]

**6. Carencias y puntos ciegos admitidos.**
[lo que el usuario admitió no tener o no saber]

**7. Riesgos y renuncias identificados.**
[los que el usuario nombró]

**8. Decisión tomada.**
[en las palabras del usuario]

**9. Primer paso comprometido.**
[acción concreta con plazo que el usuario comprometió]

**10. Señales de revisión.**
[indicadores que el usuario dijo que mirará para saber si va bien o mal]

**11. Preguntas abiertas.**
[lo que quedó sin resolver y el usuario se lleva para seguir pensando]

Genera únicamente los once bloques. Nada antes ni después.`;

export async function generateReport(turns: Turn[]): Promise<FinalReportContent> {
  const transcript = turns
    .map((t) => {
      const role = t.role === 'coach' ? 'COACH' : 'USUARIO';
      const content = t.content.replace(SESSION_COMPLETE_MARKER, '').trim();
      return `${role}: ${content}`;
    })
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: MODELS.sintesisHandoff,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Transcripción de la sesión:\n\n${transcript}\n\nGenera el informe de cierre.`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim();

  return parseFinalReport(text);
}
