-- AlterTable
ALTER TABLE "user" ADD COLUMN     "lastPasswordChange" TIMESTAMP(3),
ADD COLUMN     "passwordChanges" INTEGER NOT NULL DEFAULT 0;

