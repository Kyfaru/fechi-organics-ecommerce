-- CreateEnum
CREATE TYPE "admin"."InStoreFulfillmentStatus" AS ENUM ('CONFIRMED', 'PICKED_UP');

-- CreateEnum
CREATE TYPE "admin"."InStoreProvider" AS ENUM ('MPESA_STK', 'MPESA_C2B', 'PAYSTACK');

-- AlterTable
-- Marks clientProfile rows created via the admin in-store order flow
-- (null for normal self-service signups).
ALTER TABLE "client"."clientProfile" ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "admin"."inStoreOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT,
    "branchId" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "createdByAdminName" TEXT NOT NULL,
    "customerUserId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "subtotalKes" INTEGER NOT NULL,
    "discountKes" INTEGER NOT NULL DEFAULT 0,
    "promoCode" TEXT,
    "totalKes" INTEGER NOT NULL,
    "fulfillmentStatus" "admin"."InStoreFulfillmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceNumber" TEXT,
    "invoicePdfKey" TEXT,
    "receiptSentEmail" BOOLEAN NOT NULL DEFAULT false,
    "receiptSentSms" BOOLEAN NOT NULL DEFAULT false,
    "pickedUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inStoreOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."inStoreOrderItem" (
    "id" TEXT NOT NULL,
    "inStoreOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceKes" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "inStoreOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."inStoreTransaction" (
    "id" TEXT NOT NULL,
    "inStoreOrderId" TEXT NOT NULL,
    "provider" "admin"."InStoreProvider" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "public"."TxStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutRequestId" TEXT,
    "paystackReference" TEXT,
    "mpesaReceiptNumber" TEXT,
    "matchedC2bTransactionId" TEXT,
    "rawCallbackPayload" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inStoreTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Raw, append-only log of every Safaricom C2B confirmation received on a
-- branch till/paybill, logged regardless of whether an admin is actively
-- listening for a match at webhook-receipt time.
CREATE TABLE "admin"."mpesaC2bTransaction" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "transId" TEXT NOT NULL,
    "transAmount" INTEGER NOT NULL,
    "msisdn" TEXT NOT NULL,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "transactionTime" TIMESTAMP(3) NOT NULL,
    "billRefNumber" TEXT,
    "matchedInStoreTransactionId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mpesaC2bTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inStoreOrder_orderNumber_key" ON "admin"."inStoreOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "inStoreOrder_invoiceNumber_key" ON "admin"."inStoreOrder"("invoiceNumber");

-- CreateIndex
CREATE INDEX "inStoreOrder_branchId_createdAt_idx" ON "admin"."inStoreOrder"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "inStoreOrder_branchId_fulfillmentStatus_idx" ON "admin"."inStoreOrder"("branchId", "fulfillmentStatus");

-- CreateIndex
CREATE INDEX "inStoreOrder_customerUserId_idx" ON "admin"."inStoreOrder"("customerUserId");

-- CreateIndex
CREATE INDEX "inStoreOrderItem_inStoreOrderId_idx" ON "admin"."inStoreOrderItem"("inStoreOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "inStoreTransaction_checkoutRequestId_key" ON "admin"."inStoreTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "inStoreTransaction_paystackReference_key" ON "admin"."inStoreTransaction"("paystackReference");

-- CreateIndex
CREATE UNIQUE INDEX "inStoreTransaction_matchedC2bTransactionId_key" ON "admin"."inStoreTransaction"("matchedC2bTransactionId");

-- CreateIndex
CREATE INDEX "inStoreTransaction_inStoreOrderId_idx" ON "admin"."inStoreTransaction"("inStoreOrderId");

-- CreateIndex
CREATE INDEX "inStoreTransaction_status_createdAt_idx" ON "admin"."inStoreTransaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mpesaC2bTransaction_transId_key" ON "admin"."mpesaC2bTransaction"("transId");

-- CreateIndex
-- Backs the C2B "Live Transactions" match query: unmatched rows for a given
-- branch + amount within a short time window since the admin started
-- listening (GET /api/admin/orders/instore/mpesa/c2b/matches?branchId=&amount=).
CREATE INDEX "mpesaC2bTransaction_branchId_transAmount_createdAt_idx" ON "admin"."mpesaC2bTransaction"("branchId", "transAmount", "createdAt");

-- AddForeignKey
ALTER TABLE "admin"."inStoreOrder" ADD CONSTRAINT "inStoreOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."inStoreOrderItem" ADD CONSTRAINT "inStoreOrderItem_inStoreOrderId_fkey" FOREIGN KEY ("inStoreOrderId") REFERENCES "admin"."inStoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."inStoreTransaction" ADD CONSTRAINT "inStoreTransaction_inStoreOrderId_fkey" FOREIGN KEY ("inStoreOrderId") REFERENCES "admin"."inStoreOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."inStoreTransaction" ADD CONSTRAINT "inStoreTransaction_matchedC2bTransactionId_fkey" FOREIGN KEY ("matchedC2bTransactionId") REFERENCES "admin"."mpesaC2bTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."mpesaC2bTransaction" ADD CONSTRAINT "mpesaC2bTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "public"."branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
