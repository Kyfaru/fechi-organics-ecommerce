-- Drop CategoryKey enum and migrate category.key to plain TEXT
-- Existing enum values (FACE_CARE etc.) are lowercased to match the new
-- snake_case string convention (e.g. "face_care").

-- Step 1: convert the column to TEXT, casting enum → lowercase string
ALTER TABLE "public"."category"
  ALTER COLUMN "key" TYPE TEXT
  USING lower("key"::TEXT);

-- Step 2: drop the now-unused enum type
DROP TYPE IF EXISTS "public"."CategoryKey";
