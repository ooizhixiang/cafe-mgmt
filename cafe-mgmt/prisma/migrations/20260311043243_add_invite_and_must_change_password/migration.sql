-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cafeId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_code_idx" ON "Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_cafeId_idx" ON "Invite"("cafeId");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_cafeId_fkey" FOREIGN KEY ("cafeId") REFERENCES "Cafe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
