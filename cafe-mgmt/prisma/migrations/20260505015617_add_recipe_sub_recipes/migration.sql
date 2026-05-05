-- DropForeignKey
ALTER TABLE "RecipeIngredient" DROP CONSTRAINT "RecipeIngredient_ingredientId_fkey";

-- DropForeignKey
ALTER TABLE "VariationIngredient" DROP CONSTRAINT "VariationIngredient_ingredientId_fkey";

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "yieldQuantity" INTEGER,
ADD COLUMN     "yieldUnit" TEXT;

-- AlterTable
ALTER TABLE "RecipeIngredient" ADD COLUMN     "subRecipeId" TEXT,
ALTER COLUMN "ingredientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VariationIngredient" ADD COLUMN     "subRecipeId" TEXT,
ALTER COLUMN "ingredientId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationIngredient" ADD CONSTRAINT "VariationIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationIngredient" ADD CONSTRAINT "VariationIngredient_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
