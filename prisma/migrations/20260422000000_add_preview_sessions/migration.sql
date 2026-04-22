-- CreateTable
CREATE TABLE "preview_sessions" (
    "id" UUID NOT NULL,
    "turns" JSONB NOT NULL DEFAULT '[]',
    "turns_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preview_sessions_created_at_idx" ON "preview_sessions"("created_at");

-- CreateTable
CREATE TABLE "preview_quotas" (
    "ip_hash" TEXT NOT NULL,
    "reset_date" DATE NOT NULL,
    "preview_count" INTEGER NOT NULL DEFAULT 0,
    "last_preview_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_quotas_pkey" PRIMARY KEY ("ip_hash")
);

-- CreateIndex
CREATE INDEX "preview_quotas_reset_date_idx" ON "preview_quotas"("reset_date");
