-- AlterTable
ALTER TABLE "admin"."blogPost" ADD COLUMN IF NOT EXISTS "authorIds" TEXT[] DEFAULT '{}';
