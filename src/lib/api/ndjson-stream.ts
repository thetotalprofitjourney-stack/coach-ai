// Utilidad para devolver respuestas NDJSON (newline-delimited JSON) en
// endpoints que streamean al cliente. Cada línea es un objeto JSON; el
// cliente las parsea a medida que llegan. Se usa en /phase2/bootstrap y
// /phase2/message para emitir los tokens del coach según los produce Opus,
// además de un evento final "done" con la metadata del turno.

// `X-Accel-Buffering: no` evita que proxys tipo nginx buffereen la
// respuesta y rompan el efecto "lo veo pensar" (UX.md §4.1).
const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, no-transform',
  'X-Accel-Buffering': 'no',
} as const;

export type NdjsonEmit = (event: unknown) => void;

export function ndjsonStreamResponse(
  producer: (emit: NdjsonEmit) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: NdjsonEmit = (event) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };
      try {
        await producer(emit);
      } catch (err) {
        // El productor debería capturar sus propios errores y emitir un
        // evento {type:'error'}. Si algo se escapa, lo emitimos genérico
        // para que el cliente no se quede esperando indefinidamente.
        console.error('ndjsonStreamResponse: error no capturado', err);
        try {
          emit({
            type: 'error',
            code: 'INTERNAL',
            message: 'Error inesperado en el stream.',
          });
        } catch {
          // enqueue puede fallar si el controlador ya está cerrado.
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: NDJSON_HEADERS,
  });
}
