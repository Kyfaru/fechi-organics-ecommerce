-- Add phone number to branch (shown to pickup customers)
ALTER TABLE "public"."branch" ADD COLUMN "phone" TEXT;

-- Add review/user/order links + optional photos to testimonial
ALTER TABLE "public"."testimonial"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "userId" TEXT,
  ALTER COLUMN "beforeKey" DROP NOT NULL,
  ALTER COLUMN "afterKey" DROP NOT NULL;

-- Track when an order has been reviewed
ALTER TABLE "public"."order" ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Additional 2FA method flags on user
ALTER TABLE "public"."user"
  ADD COLUMN "twoFaEmail" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFaPhone" BOOLEAN NOT NULL DEFAULT false;
