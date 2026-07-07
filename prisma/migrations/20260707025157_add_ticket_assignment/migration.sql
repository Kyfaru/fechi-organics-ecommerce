-- AlterTable
ALTER TABLE "public"."supportTicket" ADD COLUMN "assignedAdminId" TEXT;

-- CreateIndex
CREATE INDEX "supportTicket_assignedAdminId_status_idx" ON "public"."supportTicket"("assignedAdminId", "status");

-- AddForeignKey
ALTER TABLE "public"."supportTicket" ADD CONSTRAINT "supportTicket_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "public"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
