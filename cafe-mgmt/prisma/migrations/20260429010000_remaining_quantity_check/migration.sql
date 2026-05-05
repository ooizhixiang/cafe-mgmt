-- Defense-in-depth CHECK constraint guaranteeing FIFO lot remaining quantity
-- never goes negative. Backstops the application-level conditional decrement
-- in `applyConsumeFifo` (see src/lib/lot-consume.ts). Prisma cannot represent
-- CHECK constraints in `schema.prisma`, so this migration has no schema-model
-- counterpart by design.

ALTER TABLE "IngredientPurchase" ADD CONSTRAINT "IngredientPurchase_remainingQuantity_nonnegative" CHECK ("remainingQuantity" >= 0);
