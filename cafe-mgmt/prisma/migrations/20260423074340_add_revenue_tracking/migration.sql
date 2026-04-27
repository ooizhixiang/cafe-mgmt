-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "sellingPriceInCents" INTEGER;

-- AlterTable
ALTER TABLE "RecipeVariation" ADD COLUMN     "sellingPriceInCents" INTEGER;

-- AlterTable
ALTER TABLE "SalesEntry" ADD COLUMN     "costInCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revenueInCents" INTEGER NOT NULL DEFAULT 0;
