-- CreateTable
CREATE TABLE "daily_stats" (
    "date" DATE NOT NULL,
    "sessions_created" INTEGER NOT NULL DEFAULT 0,
    "sessions_form_submitted" INTEGER NOT NULL DEFAULT 0,
    "sessions_phase1_completed" INTEGER NOT NULL DEFAULT 0,
    "sessions_phase2_completed" INTEGER NOT NULL DEFAULT 0,
    "sessions_closed" INTEGER NOT NULL DEFAULT 0,
    "sessions_abandoned" INTEGER NOT NULL DEFAULT 0,
    "reports_downloaded" INTEGER NOT NULL DEFAULT 0,
    "avg_phase2_turns" DOUBLE PRECISION,
    "avg_duration_seconds" DOUBLE PRECISION,
    "p50_duration_seconds" INTEGER,
    "p95_duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "idx_sessions_created_status" ON "sessions"("created_at", "status");
