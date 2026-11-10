-- Additive durable lecture cleanup; existing classroom data is retained.
CREATE TABLE "session_deletion_jobs" (
  "id" TEXT NOT NULL,
  "owner_id" INTEGER NOT NULL,
  "sessions" JSONB NOT NULL,
  "batch" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMP(3),
  "lease_token" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "session_deletion_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "session_deletion_jobs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "sessions" ADD COLUMN "deletion_job_id" TEXT;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deletion_job_id_fkey" FOREIGN KEY ("deletion_job_id") REFERENCES "session_deletion_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "sessions_deletion_job_id_idx" ON "sessions"("deletion_job_id");
CREATE INDEX "session_deletion_jobs_status_available_at_idx" ON "session_deletion_jobs"("status", "available_at");
CREATE INDEX "session_deletion_jobs_owner_id_idx" ON "session_deletion_jobs"("owner_id");
