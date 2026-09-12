-- CreateIndex
CREATE INDEX "Checkin_userId_checkedOutAt_expiresAt_idx" ON "Checkin"("userId", "checkedOutAt", "expiresAt");
