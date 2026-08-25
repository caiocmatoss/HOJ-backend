-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN     "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Friendship_status_idx" ON "Friendship"("status");
