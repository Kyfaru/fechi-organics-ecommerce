ALTER TABLE "public"."user" ADD COLUMN IF NOT EXISTS "username" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "user_username_key" ON "public"."user"("username");
ALTER TABLE "admin"."adminProfile" ADD COLUMN IF NOT EXISTS "accessExpiresAt" TIMESTAMP(3);
ALTER TABLE "admin"."adminProfile" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'viewer';
