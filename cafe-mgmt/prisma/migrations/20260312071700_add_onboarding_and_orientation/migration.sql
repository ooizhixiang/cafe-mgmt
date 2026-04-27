-- CreateEnum
CREATE TYPE "Period" AS ENUM ('OPENING', 'MID_DAY', 'CLOSING');

-- AlterTable
ALTER TABLE "Cafe" ADD COLUMN     "onboardingCompletedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "templateSelected" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "orientationDismissedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "cafeId" TEXT NOT NULL,
    "costPerUnitInCents" INTEGER,
    "snapIncrement" INTEGER,
    "containerProfile" TEXT,
    "category" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "lowStockThreshold" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" "Period" NOT NULL,
    "cafeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "notes" TEXT,
    "role" "Role",
    "checklistTemplateId" TEXT NOT NULL,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "cafeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ingredient_cafeId_idx" ON "Ingredient"("cafeId");

-- CreateIndex
CREATE INDEX "ChecklistTemplate_cafeId_idx" ON "ChecklistTemplate"("cafeId");

-- CreateIndex
CREATE INDEX "ChecklistTemplateItem_checklistTemplateId_idx" ON "ChecklistTemplateItem"("checklistTemplateId");

-- CreateIndex
CREATE INDEX "Supplier_cafeId_idx" ON "Supplier"("cafeId");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
