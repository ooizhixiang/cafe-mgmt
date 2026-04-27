-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'COMP_WARNING');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('WARNING', 'URGENT');

-- CreateEnum
CREATE TYPE "WastageReason" AS ENUM ('SPILLED', 'EXPIRED', 'INCORRECT');

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "unitsPerContainer" INTEGER;

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "countDate" DATE NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dollarValueInCents" INTEGER,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedAlert" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "ingredientId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WastageEntry" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "WastageReason" NOT NULL,
    "dollarValueInCents" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "originalQuantity" INTEGER,
    "correctedQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WastageEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompEntry" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "dollarValueInCents" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompBudget" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "amountInCents" INTEGER NOT NULL,
    "resetDay" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryCount_ingredientId_countDate_idx" ON "InventoryCount"("ingredientId", "countDate");

-- CreateIndex
CREATE INDEX "InventoryCount_cafeId_idx" ON "InventoryCount"("cafeId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_ingredientId_countDate_key" ON "InventoryCount"("ingredientId", "countDate");

-- CreateIndex
CREATE INDEX "FeedAlert_cafeId_resolvedAt_idx" ON "FeedAlert"("cafeId", "resolvedAt");

-- CreateIndex
CREATE INDEX "WastageEntry_cafeId_createdAt_idx" ON "WastageEntry"("cafeId", "createdAt");

-- CreateIndex
CREATE INDEX "CompEntry_cafeId_createdAt_idx" ON "CompEntry"("cafeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompBudget_cafeId_key" ON "CompBudget"("cafeId");

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedAlert" ADD CONSTRAINT "FeedAlert_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedAlert" ADD CONSTRAINT "FeedAlert_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WastageEntry" ADD CONSTRAINT "WastageEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompEntry" ADD CONSTRAINT "CompEntry_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompEntry" ADD CONSTRAINT "CompEntry_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompEntry" ADD CONSTRAINT "CompEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompEntry" ADD CONSTRAINT "CompEntry_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompBudget" ADD CONSTRAINT "CompBudget_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
