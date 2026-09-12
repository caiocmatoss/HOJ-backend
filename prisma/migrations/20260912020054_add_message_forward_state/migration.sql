-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "isForwarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isForwarded" BOOLEAN NOT NULL DEFAULT false;
