-- Add roles and content provenance metadata without changing existing records.
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "VenueSource" AS ENUM ('MANUAL', 'IMPORTED');
CREATE TYPE "EventSource" AS ENUM ('MANUAL', 'IMPORTED');

ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "Venue" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "Venue" ADD COLUMN "source" "VenueSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Venue" ADD COLUMN "externalProvider" TEXT;
ALTER TABLE "Venue" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Event" ADD COLUMN "source" "EventSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Event" ADD COLUMN "externalProvider" TEXT;
ALTER TABLE "Event" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "Venue_externalProvider_externalId_key" ON "Venue"("externalProvider", "externalId");
CREATE UNIQUE INDEX "Event_externalProvider_externalId_key" ON "Event"("externalProvider", "externalId");