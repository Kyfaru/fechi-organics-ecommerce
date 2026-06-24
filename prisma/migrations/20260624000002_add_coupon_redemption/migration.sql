-- Add couponRedemption table to track which users have redeemed which coupons
-- on which orders. Enforces one redemption per user per coupon.

CREATE TABLE "public"."couponRedemption" (
    "id"         TEXT         NOT NULL,
    "couponId"   TEXT         NOT NULL,
    "userId"     TEXT         NOT NULL,
    "orderId"    TEXT         NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "couponRedemption_pkey" PRIMARY KEY ("id")
);

-- one redemption per order
CREATE UNIQUE INDEX "couponRedemption_orderId_key"
    ON "public"."couponRedemption"("orderId");

-- one redemption per (coupon, user) pair
CREATE UNIQUE INDEX "couponRedemption_couponId_userId_key"
    ON "public"."couponRedemption"("couponId", "userId");

CREATE INDEX "couponRedemption_couponId_idx"
    ON "public"."couponRedemption"("couponId");

CREATE INDEX "couponRedemption_userId_idx"
    ON "public"."couponRedemption"("userId");
