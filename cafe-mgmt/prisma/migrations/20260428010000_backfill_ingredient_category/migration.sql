-- Backfill any existing Ingredient rows where category IS NULL to "Unassigned".
-- Idempotent: WHERE category IS NULL matches nothing on rerun.
UPDATE "Ingredient" SET "category" = 'Unassigned' WHERE "category" IS NULL;
