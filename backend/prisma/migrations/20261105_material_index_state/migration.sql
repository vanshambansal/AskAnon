ALTER TABLE "course_materials" ADD COLUMN "index_status" TEXT NOT NULL DEFAULT 'pending', ADD COLUMN "index_error" TEXT, ADD COLUMN "indexed_at" TIMESTAMP(3);
ALTER TABLE "material_chunks" ADD COLUMN "chunk_index" INTEGER NOT NULL DEFAULT 0;
UPDATE "course_materials" SET "index_status" = CASE WHEN "file_type" <> 'pdf' THEN 'unsupported' WHEN EXISTS (SELECT 1 FROM "material_chunks" WHERE "material_id" = "course_materials"."id") THEN 'ready' ELSE 'pending' END;
