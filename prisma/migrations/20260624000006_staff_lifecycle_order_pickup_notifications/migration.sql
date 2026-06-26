-- W4: mustChangePassword for forced password change on first admin login
ALTER TABLE "public"."user"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- W5: Pickup flow fields on order
ALTER TABLE "public"."order"
  ADD COLUMN "pickupCode" TEXT,
  ADD COLUMN "pickupCodeExpiresAt" TIMESTAMP(3),
  ADD COLUMN "pickedUpAt" TIMESTAMP(3);

-- W6: Admin notifications model
CREATE TABLE "admin"."notification" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_read_createdAt_idx"
  ON "admin"."notification"("read", "createdAt");
