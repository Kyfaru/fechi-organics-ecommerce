-- AlterTable
ALTER TABLE "public"."order" ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "invoicePdfKey" TEXT;

-- AlterTable
ALTER TABLE "public"."branch" ADD COLUMN "address" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "order_invoiceNumber_key" ON "public"."order"("invoiceNumber");
