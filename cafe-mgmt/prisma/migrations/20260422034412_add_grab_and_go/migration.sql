-- CreateTable
CREATE TABLE "GrabAndGoItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priceInCents" INTEGER NOT NULL DEFAULT 0,
    "cafeId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrabAndGoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrabAndGoItem_cafeId_idx" ON "GrabAndGoItem"("cafeId");

-- AddForeignKey
ALTER TABLE "GrabAndGoItem" ADD CONSTRAINT "GrabAndGoItem_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
