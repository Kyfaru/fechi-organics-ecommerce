-- CreateEnum
CREATE TYPE "admin"."CampaignChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "admin"."RecipientStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'SPAM', 'FAILED', 'OPENED', 'CLICKED');

-- AlterTable
ALTER TABLE "admin"."campaign" ADD COLUMN     "lastError" TEXT;

-- CreateTable
CREATE TABLE "admin"."campaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "admin"."CampaignChannel" NOT NULL,
    "status" "admin"."RecipientStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaignRecipient_providerMessageId_idx" ON "admin"."campaignRecipient"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "campaignRecipient_campaignId_userId_channel_key" ON "admin"."campaignRecipient"("campaignId", "userId", "channel");

