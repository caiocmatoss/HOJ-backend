/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `UserLocation` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "UserLocation_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "UserLocation_userId_key" ON "UserLocation"("userId");
