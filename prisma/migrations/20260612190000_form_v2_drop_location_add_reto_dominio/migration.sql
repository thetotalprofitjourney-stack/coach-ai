-- Formulario v2: elimina zona geográfica (no aporta al coach) y añade
-- reto_dominio para determinar qué bloque DISC se administra.
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "user_location";
ALTER TABLE "sessions" ADD COLUMN "user_reto_dominio" TEXT;
