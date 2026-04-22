// Cliente para consumir los streams NDJSON del coach que emiten
// /api/session/{token}/phase2/bootstrap y /api/session/{token}/phase2/message.
// Cada línea del body es un objeto JSON con `type`:
//   - "delta":   { type:'delta', text: string }         token entrante
//   - "done":    { type:'done', ...metadata }           fin normal
//   - "error":   { type:'error', code, message }        fallo dentro del stream
// El servidor responde 200 OK con headers NDJSON y cierra la conexión tras
// emitir done|error. Este helper expone una API por callbacks para mantener
// el componente de chat lo más simple posible.

export type CoachStreamEvent =
  | { type: 'delta'; text: string }
  | ({ type: 'done' } & Record<string, unknown>)
  | { type: 'error'; code?: string; message: string };

export interface ConsumeCoachStreamOptions {
  onDelta: (delta: string) => void;
  onDone: (event: Record<string, unknown>) => void;
  onError: (event: { code?: string; message: string }) => void;
  signal?: AbortSignal;
}

// Devuelve true si el stream terminó con {type:'done'}, false si terminó
// con {type:'error'} o se cortó sin evento final. El caller decide cómo
// manejar cada caso (persistencia UI, mensaje de error, etc.).
export async function consumeCoachStream(
  response: Response,
  { onDelta, onDone, onError, signal }: ConsumeCoachStreamOptions,
): Promise<boolean> {
  if (!response.body) {
    onError({ message: 'Respuesta sin cuerpo.' });
    return false;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;
  let receivedError = false;

  const abortListener = () => {
    void reader.cancel();
  };
  signal?.addEventListener('abort', abortListener);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;

        let event: CoachStreamEvent;
        try {
          event = JSON.parse(line) as CoachStreamEvent;
        } catch {
          continue;
        }

        if (event.type === 'delta') {
          onDelta(event.text);
        } else if (event.type === 'done') {
          receivedDone = true;
          const { type: _type, ...rest } = event;
          void _type;
          onDone(rest);
        } else if (event.type === 'error') {
          receivedError = true;
          onError({ code: event.code, message: event.message });
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', abortListener);
  }

  if (!receivedDone && !receivedError) {
    onError({ message: 'Conexión interrumpida.' });
  }

  return receivedDone;
}
