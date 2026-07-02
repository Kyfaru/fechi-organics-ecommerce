-- AlterEnum
ALTER TYPE "public"."OrderStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "public"."order" ADD COLUMN "customerPickupConfirmedAt" TIMESTAMP(3),
ADD COLUMN "staffPickupConfirmedAt" TIMESTAMP(3);
