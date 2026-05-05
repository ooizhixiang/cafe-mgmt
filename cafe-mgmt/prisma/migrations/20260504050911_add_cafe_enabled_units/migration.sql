-- AlterTable
ALTER TABLE "Cafe" ADD COLUMN     "enabledUnits" TEXT[] DEFAULT ARRAY['kg', 'g', 'L', 'mL', 'each']::TEXT[];
