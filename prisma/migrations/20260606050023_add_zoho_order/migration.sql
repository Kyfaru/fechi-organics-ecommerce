-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- AlterTable: add zohoItemId to product
ALTER TABLE "public"."product" ADD COLUMN "zohoItemId" TEXT;
CREATE UNIQUE INDEX "product_zohoItemId_key" ON "public"."product"("zohoItemId");

-- CreateTable: order
CREATE TABLE "public"."order" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestEmail" TEXT,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "zohoSoId" TEXT,
    "subtotalKes" INTEGER NOT NULL,
    "deliveryKes" INTEGER NOT NULL DEFAULT 35000,
    "discountKes" INTEGER NOT NULL DEFAULT 0,
    "totalKes" INTEGER NOT NULL,
    "promoCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable: orderItem
CREATE TABLE "public"."orderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceKes" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "orderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_zohoSoId_key" ON "public"."order"("zohoSoId");
CREATE INDEX "order_userId_createdAt_idx" ON "public"."order"("userId", "createdAt");
CREATE INDEX "order_status_createdAt_idx" ON "public"."order"("status", "createdAt");
CREATE INDEX "orderItem_orderId_idx" ON "public"."orderItem"("orderId");

-- AddForeignKey
ALTER TABLE "public"."order" ADD CONSTRAINT "order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orderItem" ADD CONSTRAINT "orderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orderItem" ADD CONSTRAINT "orderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
