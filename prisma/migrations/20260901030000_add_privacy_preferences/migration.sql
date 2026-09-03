CREATE TABLE "PrivacyPreferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "showStatus" BOOLEAN NOT NULL DEFAULT true,
  "showCheckinHistory" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrivacyPreferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrivacyPreferences_userId_key" ON "PrivacyPreferences"("userId");

ALTER TABLE "PrivacyPreferences"
  ADD CONSTRAINT "PrivacyPreferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
