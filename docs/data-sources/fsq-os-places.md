# FSQ OS Places ingestion

PostgreSQL remains the canonical HOJE É ONDE catalog. FSQ OS Places is an ingestion source only.

## Verified acquisition flow

Places Portal **Access Data** → DuckDB CLI (>= 1.4.0) → `httpfs` + `iceberg` extensions → REST Iceberg catalog → `places.datasets.places_os` → server-side SQL → local CSV → `scripts/import-fsq-os-places.cjs` → PostgreSQL.

Catalog endpoint: `https://catalog.h3-hub.foursquare.com/iceberg` (override with `FSQ_ICEBERG_ENDPOINT` only when the Portal snippet supplies another endpoint).

Credentials are supplied locally through `FSQ_PLACES_TOKEN`, obtained from the Places Portal OS Places **Access Data** flow. The token is read inside DuckDB via `getenv('FSQ_PLACES_TOKEN')`; it is never placed in SQL, CLI arguments, source, or logs.

The exporter requires exactly one explicit geographic scope (`--bbox minLon,minLat,maxLon,maxLat` or `--country BR`). It filters coordinates, `date_closed IS NULL`, critical unresolved flags, and supported category labels before `LIMIT`. Default limit is 500; the hard maximum is 10,000 and larger pilot exports require `--allow-large-export`.

## Commands

Local validation without network/token:

```powershell
npm run venues:export:fsq -- --bbox "-47,-24,-46,-23" --limit 50 --check
```

Real catalog dry-run (requires a locally configured token and DuckDB; does not write CSV):

```powershell
npm run venues:export:fsq -- --bbox "-47,-24,-46,-23" --limit 50 --dry-run
```

Export and then audit with the existing importer:

```powershell
npm run venues:export:fsq -- --bbox "-47,-24,-46,-23" --limit 50 --output ".\data\imports\fsq-pilot.csv"
npm run venues:import:fsq -- --file ".\data\imports\fsq-pilot.csv" --dry-run
```

FSQ fields selected are limited to the importer contract. `geom`, `bbox`, email, social identifiers and `placemaker_url` are not selected. Capacity, occupancy, rating and images are not imported. The importer remains the final domain allowlist and upsert authority.
