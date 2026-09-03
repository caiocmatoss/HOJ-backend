ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
