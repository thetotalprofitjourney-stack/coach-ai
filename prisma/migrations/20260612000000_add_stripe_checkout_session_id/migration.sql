-- Vincula cada fila de `sessions` al Checkout Session de Stripe que la originó.
-- Nullable porque las sesiones creadas antes de este cambio (o vía
-- POST /api/session/create manual) no tienen checkout asociado.
-- El índice UNIQUE es la garantía de idempotencia: si el webhook y el
-- endpoint /api/checkout/resolve intentan crear la sesión simultáneamente,
-- solo el primero en hacer INSERT gana; el segundo recibe un error de
-- unicidad y vuelve a leer la fila ya existente.
ALTER TABLE sessions ADD COLUMN stripe_checkout_session_id TEXT;
CREATE UNIQUE INDEX sessions_stripe_checkout_session_id_key
  ON sessions (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
