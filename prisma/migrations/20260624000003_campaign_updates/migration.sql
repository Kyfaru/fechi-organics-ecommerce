ALTER TABLE "admin"."campaign" ADD COLUMN IF NOT EXISTS "heading" TEXT;
ALTER TABLE "admin"."campaign" ADD COLUMN IF NOT EXISTS "previewText" TEXT;
ALTER TABLE "admin"."campaign" ADD COLUMN IF NOT EXISTS "audienceCustomerIds" TEXT[] DEFAULT '{}';
ALTER TYPE "admin"."CampaignType" ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE "admin"."CampaignType" ADD VALUE IF NOT EXISTS 'ALL';
