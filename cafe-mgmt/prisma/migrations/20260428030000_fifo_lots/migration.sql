-- Add columns with defaults
ALTER TABLE "Ingredient" ADD COLUMN "manualCostOverride" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "IngredientPurchase" ADD COLUMN "remainingQuantity" INTEGER NOT NULL DEFAULT 0;

-- Backfill remainingQuantity from quantity for existing rows
UPDATE "IngredientPurchase" SET "remainingQuantity" = "quantity";

-- (manualCostOverride is true for all existing rows via the DEFAULT — no UPDATE needed)

-- Create LotConsumption
CREATE TABLE "LotConsumption" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ingredientPurchaseId" TEXT,
    "quantityConsumed" INTEGER NOT NULL,
    "perUnitInCents" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LotConsumption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LotConsumption_sourceType_sourceId_idx" ON "LotConsumption"("sourceType", "sourceId");
CREATE INDEX "LotConsumption_cafeId_createdAt_idx" ON "LotConsumption"("cafeId", "createdAt");
CREATE INDEX "LotConsumption_ingredientPurchaseId_idx" ON "LotConsumption"("ingredientPurchaseId");
ALTER TABLE "LotConsumption" ADD CONSTRAINT "LotConsumption_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LotConsumption" ADD CONSTRAINT "LotConsumption_ingredientPurchaseId_fkey" FOREIGN KEY ("ingredientPurchaseId") REFERENCES "IngredientPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
