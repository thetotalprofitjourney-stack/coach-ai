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

  // `closed` se comparte entre start() y cancel() para que emit() sea un
  // no-op en cuanto el cliente desconecte. Sin este flag, el setInterval de
  // keepalive del productor sigue disparando sobre un controller cancelado y
  // Node.js lanza ERR_INVALID_STATE como uncaughtException.
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: NdjsonEmit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // El enqueue falló (p.ej. race con cancel); marcamos cerrado para
          // que los siguientes emit del productor sean silenciosos.
          closed = true;
        }
      };
      try {
        await producer(emit);
      } catch (err) {
        // El productor debería capturar sus propios errores y emitir un
        // evento {type:'error'}. Si algo se escapa, lo emitimos genérico
        // para que el cliente no se quede esperando indefinidamente.
        if (!closed) console.error('ndjsonStreamResponse: error no capturado', err);
        emit({
          type: 'error',
          code: 'INTERNAL',
          message: 'Error inesperado en el stream.',
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Ya cancelado por el cliente; ignorar.
        }
      }
    },
    cancel() {
      // El cliente ha cerrado la conexión. Marcamos como cerrado para que
      // cualquier emit pendiente (p.ej. el ping de keepalive) sea un no-op.
      closed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: NDJSON_HEADERS,
  });
}
