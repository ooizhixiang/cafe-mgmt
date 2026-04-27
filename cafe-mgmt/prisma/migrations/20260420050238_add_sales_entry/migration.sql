-- CreateTable
CREATE TABLE "SalesEntry" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipeName" TEXT NOT NULL,
    "qtySold" INTEGER NOT NULL,
    "saleDate" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesEntry_cafeId_saleDate_idx" ON "SalesEntry"("cafeId", "saleDate");

-- CreateIndex
CREATE INDEX "SalesEntry_recipeId_saleDate_idx" ON "SalesEntry"("recipeId", "saleDate");

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesEntry" ADD CONSTRAINT "SalesEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
