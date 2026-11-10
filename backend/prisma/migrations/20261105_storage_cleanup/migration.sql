CREATE TABLE IF NOT EXISTS "storage_cleanup" (
  "public_id" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "not_before" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("public_id", "resource_type")
);
