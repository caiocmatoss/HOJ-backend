-- DropIndex
DROP INDEX "Checkin_userId_checkedOutAt_expiresAt_idx";

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3);
