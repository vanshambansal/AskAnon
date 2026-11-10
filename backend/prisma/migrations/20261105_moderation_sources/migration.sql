ALTER TABLE "questions" ADD COLUMN "moderation_status" TEXT NOT NULL DEFAULT 'legacy', ADD COLUMN "moderation_reason" TEXT;
ALTER TABLE "material_chunks" ADD COLUMN "page_number" INTEGER;
