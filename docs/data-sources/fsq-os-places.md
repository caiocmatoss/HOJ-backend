# FSQ OS Places ingestion

HOJE É ONDE uses FSQ OS Places only as an ingestion source. PostgreSQL remains the canonical catalog.

- `externalProvider`: `FSQ_OS`
- `externalId`: FSQ place identifier
- Source: https://opensource.foursquare.com/os-places/
- License: Apache License 2.0; preserve the dataset NOTICE/attribution required by the distribution.

The importer accepts a user-provided normalized CSV and supports dry-run validation. Imported fields are identity, address, coordinates, locality/region/postcode/country, telephone, website, refresh/closure metadata and provenance. Capacity, occupancy, ratings, images and gallery are deliberately not imported from this dataset.

Run `npm run venues:import:fsq -- --file <path> --dry-run` to audit a file. A real import requires explicit authorization and uses idempotent `(externalProvider, externalId)` upserts.
