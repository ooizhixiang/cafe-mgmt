-- CreateTable
CREATE TABLE "RecipeVariation" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariationIngredient" (
    "id" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityPerServing" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariationIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeVariation_recipeId_idx" ON "RecipeVariation"("recipeId");

-- CreateIndex
CREATE INDEX "VariationIngredient_variationId_idx" ON "VariationIngredient"("variationId");

-- AddForeignKey
ALTER TABLE "RecipeVariation" ADD CONSTRAINT "RecipeVariation_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationIngredient" ADD CONSTRAINT "VariationIngredient_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "RecipeVariation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariationIngredient" ADD CONSTRAINT "VariationIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
