-- AlterTable
ALTER TABLE "SalesEntry" ADD COLUMN "submissionId" TEXT;
ALTER TABLE "SalesEntry" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "SalesEntry" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "SalesEntry" ADD COLUMN "voidReason" TEXT;

-- CreateIndex
CREATE INDEX "SalesEntry_cafeId_saleDate_submissionId_idx" ON "SalesEntry"("cafeId", "saleDate", "submissionId");

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
