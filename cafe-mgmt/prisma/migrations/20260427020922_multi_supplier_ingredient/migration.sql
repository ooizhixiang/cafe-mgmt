-- 1. Create new tables -------------------------------------------------------

-- CreateTable
CREATE TABLE "IngredientSupplier" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "priceInCents" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngredientSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientPurchase" (
    "id" TEXT NOT NULL,
    "ingredientSupplierId" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "totalPriceInCents" INTEGER NOT NULL,
    "supplierCallLogId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngredientSupplier_ingredientId_supplierId_cafeId_key"
    ON "IngredientSupplier"("ingredientId", "supplierId", "cafeId");

-- CreateIndex
CREATE INDEX "IngredientSupplier_cafeId_idx" ON "IngredientSupplier"("cafeId");

-- CreateIndex
CREATE INDEX "IngredientPurchase_cafeId_createdAt_idx"
    ON "IngredientPurchase"("cafeId", "createdAt");

-- CreateIndex
CREATE INDEX "IngredientPurchase_ingredientSupplierId_idx"
    ON "IngredientPurchase"("ingredientSupplierId");

-- AddForeignKey
ALTER TABLE "IngredientSupplier" ADD CONSTRAINT "IngredientSupplier_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientSupplier" ADD CONSTRAINT "IngredientSupplier_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientSupplier" ADD CONSTRAINT "IngredientSupplier_cafeId_fkey"
    FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPurchase" ADD CONSTRAINT "IngredientPurchase_ingredientSupplierId_fkey"
    FOREIGN KEY ("ingredientSupplierId") REFERENCES "IngredientSupplier"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPurchase" ADD CONSTRAINT "IngredientPurchase_supplierCallLogId_fkey"
    FOREIGN KEY ("supplierCallLogId") REFERENCES "SupplierCallLog"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPurchase" ADD CONSTRAINT "IngredientPurchase_cafeId_fkey"
    FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientPurchase" ADD CONSTRAINT "IngredientPurchase_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill IngredientSupplier from existing Ingredient.supplierId ----------
INSERT INTO "IngredientSupplier" (
    "id", "ingredientId", "supplierId", "cafeId",
    "priceInCents", "unit", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    i."id",
    i."supplierId",
    i."cafeId",
    COALESCE(i."costPerUnitInCents", 0),
    'kg',
    NOW(),
    NOW()
FROM "Ingredient" i
WHERE i."supplierId" IS NOT NULL;

-- 3. Drop FK, index, and column from Ingredient ------------------------------

-- DropForeignKey
ALTER TABLE "Ingredient" DROP CONSTRAINT "Ingredient_supplierId_fkey";

-- DropIndex
DROP INDEX "Ingredient_supplierId_idx";

-- AlterTable
ALTER TABLE "Ingredient" DROP COLUMN "supplierId";
