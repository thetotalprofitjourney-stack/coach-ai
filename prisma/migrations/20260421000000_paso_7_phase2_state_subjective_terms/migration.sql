-- AlterTable
ALTER TABLE "phase2_state" ADD COLUMN "subjective_terms_resolved" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "phase2_state" ADD COLUMN "subjective_terms_pending" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "phase2_state" ALTER COLUMN "hypotheses_explored" SET DEFAULT ARRAY[]::TEXT[];
