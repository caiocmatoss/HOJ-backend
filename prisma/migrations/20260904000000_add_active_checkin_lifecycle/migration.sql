ALTER TABLE "Checkin" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "Checkin_userId_checkedOutAt_expiresAt_idx" ON "Checkin"("userId", "checkedOutAt", "expiresAt");