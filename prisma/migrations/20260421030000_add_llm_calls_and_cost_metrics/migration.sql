-- AlterTable
ALTER TABLE "daily_stats" ADD COLUMN     "total_input_tokens" BIGINT,
ADD COLUMN     "total_output_tokens" BIGINT,
ADD COLUMN     "total_cache_creation_tokens" BIGINT,
ADD COLUMN     "total_cache_read_tokens" BIGINT,
ADD COLUMN     "total_cost_usd" DOUBLE PRECISION,
ADD COLUMN     "avg_cost_usd_per_completed_session" DOUBLE PRECISION,
ADD COLUMN     "avg_latency_ms_haiku" INTEGER,
ADD COLUMN     "avg_latency_ms_sonnet" INTEGER,
ADD COLUMN     "avg_latency_ms_opus" INTEGER;

-- CreateTable
CREATE TABLE "llm_calls" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_creation_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_input_tokens" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_calls_session_id_idx" ON "llm_calls"("session_id");

-- CreateIndex
CREATE INDEX "llm_calls_created_at_idx" ON "llm_calls"("created_at");

-- AddForeignKey
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
