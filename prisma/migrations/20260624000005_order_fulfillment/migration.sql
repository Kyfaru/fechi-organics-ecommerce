ALTER TABLE "public"."order" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT;
ALTER TABLE "public"."order" ADD COLUMN IF NOT EXISTS "processingBy" TEXT;
ALTER TABLE "public"."order" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3);
ALTER TABLE "public"."order" ADD COLUMN IF NOT EXISTS "confirmedBy" TEXT;
ALTER TABLE "public"."order" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "public"."order" ADD COLUMN IF NOT EXISTS "shippedAt" TIMESTAMP(3);

-- Backfill orderNumber for existing orders
UPDATE "public"."order"
SET "orderNumber" = 'FO-' || TO_CHAR("createdAt", 'YYYY') || '-' || LPAD(ROW_NUMBER() OVER (ORDER BY "createdAt")::TEXT, 4, '0')
WHERE "orderNumber" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "order_orderNumber_key" ON "public"."order"("orderNumber");

ALTER TABLE "admin"."adminProfile" ADD COLUMN IF NOT EXISTS "twoFaMethod" TEXT NOT NULL DEFAULT 'totp';
