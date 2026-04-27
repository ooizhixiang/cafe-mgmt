-- AlterTable
ALTER TABLE "ChecklistTemplateItem" ADD COLUMN     "linkRoute" TEXT;

-- CreateTable
CREATE TABLE "DailyChecklist" (
    "id" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "period" "Period" NOT NULL,
    "checklistTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyChecklistItem" (
    "id" TEXT NOT NULL,
    "dailyChecklistId" TEXT NOT NULL,
    "checklistTemplateItemId" TEXT,
    "text" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "notes" TEXT,
    "role" "Role",
    "linkRoute" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,

    CONSTRAINT "DailyChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyChecklist_cafeId_date_idx" ON "DailyChecklist"("cafeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyChecklist_cafeId_date_period_key" ON "DailyChecklist"("cafeId", "date", "period");

-- CreateIndex
CREATE INDEX "DailyChecklistItem_dailyChecklistId_idx" ON "DailyChecklistItem"("dailyChecklistId");

-- AddForeignKey
ALTER TABLE "DailyChecklist" ADD CONSTRAINT "DailyChecklist_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklist" ADD CONSTRAINT "DailyChecklist_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklistItem" ADD CONSTRAINT "DailyChecklistItem_dailyChecklistId_fkey" FOREIGN KEY ("dailyChecklistId") REFERENCES "DailyChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyChecklistItem" ADD CONSTRAINT "DailyChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
