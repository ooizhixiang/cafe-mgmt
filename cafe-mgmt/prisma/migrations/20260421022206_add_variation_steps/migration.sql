-- CreateTable
CREATE TABLE "VariationStep" (
    "id" TEXT NOT NULL,
    "variationId" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariationStep_variationId_idx" ON "VariationStep"("variationId");

-- AddForeignKey
ALTER TABLE "VariationStep" ADD CONSTRAINT "VariationStep_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "RecipeVariation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
