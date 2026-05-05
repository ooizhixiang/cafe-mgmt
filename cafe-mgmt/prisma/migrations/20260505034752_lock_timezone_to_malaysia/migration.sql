-- Lock cafe timezone to Malaysia (Asia/Kuala_Lumpur).
-- The application now reads CAFE_TIMEZONE from a single constant; the per-cafe
-- column is no longer used. UPDATE before DROP is defence-in-depth: in the
-- atomic migration this is functionally equivalent to a straight DROP, but if
-- any audit/CDC tooling captures the pre-DROP state, it will see KL rather
-- than the legacy NY default.

-- Step 1: backfill all existing cafes to the locked timezone.
UPDATE "Cafe" SET "timezone" = 'Asia/Kuala_Lumpur';

-- Step 2: drop the column.
ALTER TABLE "Cafe" DROP COLUMN "timezone";
