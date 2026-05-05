ALTER TABLE "Ingredient" ALTER COLUMN "costPerUnitInCents" TYPE decimal(12, 4) USING ("costPerUnitInCents"::decimal);
ALTER TABLE "IngredientSupplier" ALTER COLUMN "priceInCents" TYPE decimal(12, 4) USING ("priceInCents"::decimal);
ALTER TABLE "IngredientPurchase" ALTER COLUMN "totalPriceInCents" TYPE decimal(12, 4) USING ("totalPriceInCents"::decimal);
ALTER TABLE "RecipeIngredient" ALTER COLUMN "subtotalOverrideInCents" TYPE decimal(12, 4) USING ("subtotalOverrideInCents"::decimal);
