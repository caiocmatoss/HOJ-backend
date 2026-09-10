-- AlterTable
ALTER TABLE "NotificationPreferences" ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreferences" ADD COLUMN "friendRequests" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreferences" ADD COLUMN "groupInvites" BOOLEAN NOT NULL DEFAULT true;