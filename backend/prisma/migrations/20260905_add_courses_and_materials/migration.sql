-- Create courses table
CREATE TABLE IF NOT EXISTS "courses" (
  "id" SERIAL PRIMARY KEY,
  "course_code" VARCHAR(50) UNIQUE NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "teacher_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add optional course_id to sessions table
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "course_id" INTEGER REFERENCES "courses"("id") ON DELETE SET NULL;

-- Create course_materials table
CREATE TABLE IF NOT EXISTS "course_materials" (
  "id" SERIAL PRIMARY KEY,
  "course_id" INTEGER NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "session_id" INTEGER REFERENCES "sessions"("id") ON DELETE SET NULL,
  "title" VARCHAR(255) NOT NULL,
  "file_url" TEXT NOT NULL,
  "public_id" VARCHAR(255) NOT NULL,
  "file_type" VARCHAR(50) DEFAULT 'pdf' NOT NULL,
  "file_size" INTEGER,
  "category" VARCHAR(100) DEFAULT 'Lecture Slides',
  "uploaded_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
