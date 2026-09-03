CREATE TYPE "LocationAccuracy" AS ENUM ('HIGH', 'BALANCED');

CREATE TYPE "LocationUpdateFrequency" AS ENUM ('REALTIME', 'FIVE_MINUTES', 'FIFTEEN_MINUTES');

CREATE TABLE "LocationPreferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "precise" BOOLEAN NOT NULL DEFAULT true,
  "accuracy" "LocationAccuracy" NOT NULL DEFAULT 'HIGH',
  "updateFreq" "LocationUpdateFrequency" NOT NULL DEFAULT 'REALTIME',
  "shareWithFriends" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocationPreferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LocationPreferences_userId_key" ON "LocationPreferences"("userId");

ALTER TABLE "LocationPreferences"
  ADD CONSTRAINT "LocationPreferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
