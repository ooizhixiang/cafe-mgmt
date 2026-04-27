-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('ORDERED', 'NO_ANSWER', 'CALL_BACK');

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "lastOrderDate" TIMESTAMP(3),
ADD COLUMN     "reminderDays" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "SupplierCallLog" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "outcome" "CallOutcome" NOT NULL,
    "calledById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "servingSize" TEXT,
    "cafeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityPerServing" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeStep" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierCallLog_supplierId_createdAt_idx" ON "SupplierCallLog"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "Recipe_cafeId_idx" ON "Recipe"("cafeId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeStep_recipeId_idx" ON "RecipeStep"("recipeId");

-- AddForeignKey
ALTER TABLE "SupplierCallLog" ADD CONSTRAINT "SupplierCallLog_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCallLog" ADD CONSTRAINT "SupplierCallLog_calledById_fkey" FOREIGN KEY ("calledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeStep" ADD CONSTRAINT "RecipeStep_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
