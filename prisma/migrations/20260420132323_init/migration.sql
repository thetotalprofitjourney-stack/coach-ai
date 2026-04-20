-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('created', 'phase1_in_progress', 'phase1_completed', 'phase2_in_progress', 'phase2_completed', 'closed');

-- CreateEnum
CREATE TYPE "TurnRole" AS ENUM ('coach', 'user');

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'created',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "user_name" TEXT NOT NULL,
    "user_age" INTEGER NOT NULL,
    "user_family_context" TEXT NOT NULL,
    "user_location" TEXT NOT NULL,
    "user_professional_moment" TEXT NOT NULL,
    "user_trigger" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase1_responses" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "item_number" INTEGER NOT NULL,
    "item_content" JSONB NOT NULL,
    "chosen_option" CHAR(1),
    "secondary_options" CHAR(1)[],
    "free_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase1_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase1_handoff" (
    "session_id" UUID NOT NULL,
    "handoff_content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase1_handoff_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "phase2_turns" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "role" "TurnRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase2_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase2_state" (
    "session_id" UUID NOT NULL,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "hypotheses_explored" TEXT[],
    "running_summary" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phase2_state_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "final_reports" (
    "session_id" UUID NOT NULL,
    "report_content" JSONB NOT NULL,
    "pdf_path" TEXT,
    "docx_path" TEXT,
    "downloaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "final_reports_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "sessions_status_created_at_idx" ON "sessions"("status", "created_at");

-- CreateIndex
CREATE INDEX "sessions_closed_at_idx" ON "sessions"("closed_at");

-- CreateIndex
CREATE INDEX "phase1_responses_session_id_idx" ON "phase1_responses"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "phase1_responses_session_id_item_number_key" ON "phase1_responses"("session_id", "item_number");

-- CreateIndex
CREATE INDEX "phase2_turns_session_id_idx" ON "phase2_turns"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "phase2_turns_session_id_turn_number_key" ON "phase2_turns"("session_id", "turn_number");

-- AddForeignKey
ALTER TABLE "phase1_responses" ADD CONSTRAINT "phase1_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase1_handoff" ADD CONSTRAINT "phase1_handoff_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase2_turns" ADD CONSTRAINT "phase2_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase2_state" ADD CONSTRAINT "phase2_state_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_reports" ADD CONSTRAINT "final_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

