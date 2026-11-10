-- Additive changes only; existing lecture data and resources are preserved.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "is_paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "content_type" TEXT NOT NULL DEFAULT 'QUESTION';
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "image_public_id" TEXT;
ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "is_visible" BOOLEAN NOT NULL DEFAULT true;
