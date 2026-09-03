ALTER TABLE "Venue" ADD COLUMN "locality" TEXT;
ALTER TABLE "Venue" ADD COLUMN "region" TEXT;
ALTER TABLE "Venue" ADD COLUMN "country" TEXT;
ALTER TABLE "Venue" ADD COLUMN "postcode" TEXT;
ALTER TABLE "Venue" ADD COLUMN "phone" TEXT;
ALTER TABLE "Venue" ADD COLUMN "website" TEXT;
ALTER TABLE "Venue" ADD COLUMN "sourceRefreshedAt" TIMESTAMP(3);
ALTER TABLE "Venue" ADD COLUMN "sourceClosedAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN "endsAt" TIMESTAMP(3);
CREATE TABLE "VenueImage" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenueImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Venue_locality_idx" ON "Venue"("locality");
CREATE INDEX "Venue_region_idx" ON "Venue"("region");
CREATE INDEX "Venue_country_idx" ON "Venue"("country");
CREATE INDEX "Venue_source_idx" ON "Venue"("source");
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");
CREATE INDEX "Event_endsAt_idx" ON "Event"("endsAt");
CREATE INDEX "VenueImage_venueId_position_idx" ON "VenueImage"("venueId", "position");
ALTER TABLE "VenueImage" ADD CONSTRAINT "VenueImage_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
