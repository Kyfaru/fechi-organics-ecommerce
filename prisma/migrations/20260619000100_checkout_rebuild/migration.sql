-- Checkout rebuild: delivery zones, scoped admins, receipt state, branch coordinates.

ALTER TABLE "public"."branch"
  ADD COLUMN "lat" DOUBLE PRECISION,
  ADD COLUMN "lng" DOUBLE PRECISION;

CREATE TABLE "public"."DeliveryZone" (
  "id" TEXT NOT NULL,
  "county" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "branchId" TEXT,
  "deliveryFeeKes" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryZone_county_isActive_idx"
  ON "public"."DeliveryZone"("county", "isActive");

CREATE INDEX "DeliveryZone_branchId_idx"
  ON "public"."DeliveryZone"("branchId");

ALTER TABLE "public"."DeliveryZone"
  ADD CONSTRAINT "DeliveryZone_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "public"."branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."order"
  ADD COLUMN "deliveryZone" TEXT,
  ADD COLUMN "receiptSent" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "admin"."adminProfile"
  ADD COLUMN "branchId" TEXT,
  ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "adminProfile_branchId_idx"
  ON "admin"."adminProfile"("branchId");

ALTER TABLE "admin"."adminProfile"
  ADD CONSTRAINT "adminProfile_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "public"."branch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
