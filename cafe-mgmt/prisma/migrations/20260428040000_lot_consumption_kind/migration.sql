-- CreateEnum
CREATE TYPE "ConsumptionKind" AS ENUM ('LOT', 'OVER_DEDUCTION');

-- AlterTable
ALTER TABLE "LotConsumption" ADD COLUMN "consumptionKind" "ConsumptionKind" NOT NULL DEFAULT 'LOT';
