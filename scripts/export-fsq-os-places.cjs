#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_ENDPOINT = 'https://catalog.h3-hub.foursquare.com/iceberg';
const MIN_DUCKDB_VERSION = [1, 4, 0];
const HARD_MAX = 10000;
const DEFAULT_LIMIT = 500;
const QUERY_TIMEOUT_MS = 120000;
const CATEGORY_TERMS = ['restaurant', '> bar', 'cocktail bar', 'beer bar', 'wine bar', 'pub', 'night club', 'nightclub', 'dance club', 'lounge', 'music venue', 'live music', 'concert hall', 'event venue'];
const CRITICAL_FLAGS = ['closed', 'duplicate', 'delete', 'privatevenue', 'inappropriate', 'doesnt_exist'];
const CSV_FIELDS = ['fsq_place_id', 'name', 'latitude', 'longitude', 'address', 'locality', 'region', 'postcode', 'country', 'date_refreshed', 'date_closed', 'tel', 'website', 'fsq_category_ids', 'fsq_category_labels', 'unresolved_flags'];

function parseVersion(text) { const m = String(text).match(/(\d+)\.(\d+)\.(\d+)/); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; }
function versionAtLeast(actual, minimum = MIN_DUCKDB_VERSION) { if (!actual) return false; return actual[0] > minimum[0] || (actual[0] === minimum[0] && (actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2]))); }
function parseBbox(value) { const parts = String(value || '').split(',').map(Number); if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[0] < -180 || parts[2] > 180 || parts[1] < -90 || parts[3] > 90 || parts[0] >= parts[2] || parts[1] >= parts[3]) throw new Error('bbox must be minLon,minLat,maxLon,maxLat with valid ranges.'); return parts; }
function parseCountry(value) { const country = String(value || '').trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(country)) throw new Error('country must be a two-letter ISO code.'); return country; }
function parseArgs(argv) { const get = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }; const bboxArg = get('--bbox'); const countryArg = get('--country'); if (!!bboxArg === !!countryArg) throw new Error('Provide exactly one of --bbox or --country.'); const rawLimit = get('--limit'); const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit); if (!Number.isInteger(limit) || limit < 1 || limit > HARD_MAX) throw new Error(`--limit must be an integer between 1 and ${HARD_MAX}.`); const allowLarge = argv.includes('--allow-large-export'); if (limit > DEFAULT_LIMIT && !allowLarge) throw new Error(`Exports above ${DEFAULT_LIMIT} require --allow-large-export.`); return { bbox: bboxArg ? parseBbox(bboxArg) : null, country: countryArg ? parseCountry(countryArg) : null, limit, output: path.resolve(get('--output') || path.join('data', 'imports', 'fsq-pilot.csv')), dryRun: argv.includes('--dry-run'), check: argv.includes('--check'), overwrite: argv.includes('--overwrite') }; }
function sqlQuote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function categoryLabelsSupported(labels) {
  return (labels || []).some((raw) => {
    const segments = String(raw || '').toLowerCase().split('>').map((segment) => segment.trim());
    return CATEGORY_TERMS.some((term) => segments.includes(term.replace(/^> /, '')));
  });
}
function flagsAllowed(flags) {
  return !(flags || []).some((flag) => CRITICAL_FLAGS.includes(String(flag).trim().toLowerCase()));
}
function categoryPredicate() {
  return CATEGORY_TERMS.map((term) => {
    const name = term.replace(/^> /, '');
    const pattern = `(^| > )${name}( > |$)`;
    return `(lower(label) = ${sqlQuote(name)} OR regexp_matches(lower(label), ${sqlQuote(pattern)}))`;
  }).join(' OR ');
}function buildQuery(options, mode = 'export') { const geography = options.bbox ? `latitude BETWEEN ${options.bbox[1]} AND ${options.bbox[3]} AND longitude BETWEEN ${options.bbox[0]} AND ${options.bbox[2]}` : `country = ${sqlQuote(options.country)}`; const flags = CRITICAL_FLAGS.map(sqlQuote).join(', '); const select = CSV_FIELDS.map((field) => ['fsq_category_ids', 'fsq_category_labels', 'unresolved_flags'].includes(field) ? `array_to_string(${field}, '|') AS ${field}` : field).join(',\n       '); const filtered = `SELECT ${select}\nFROM places.datasets.places_os\nWHERE latitude IS NOT NULL\n  AND longitude IS NOT NULL\n  AND date_closed IS NULL\n  AND ${geography}\n  AND length(list_filter(COALESCE(fsq_category_labels, []::VARCHAR[]), lambda label: ${categoryPredicate()})) > 0\n  AND NOT list_has_any(list_transform(COALESCE(unresolved_flags, []::VARCHAR[]), lambda flag: lower(flag)), [${flags}])\nLIMIT ${options.limit}`; return mode === 'count' ? `SELECT count(*) AS eligible_up_to_limit FROM (${filtered}) AS eligible;` : filtered; }
function buildDuckDbSql(options, mode = 'export') { const endpoint = process.env.FSQ_ICEBERG_ENDPOINT || DEFAULT_ENDPOINT; const setup = `INSTALL httpfs; LOAD httpfs; INSTALL iceberg; LOAD iceberg; CREATE SECRET iceberg_secret (TYPE ICEBERG, TOKEN getenv('FSQ_PLACES_TOKEN')); ATTACH 'places' AS places (TYPE iceberg, SECRET iceberg_secret, ENDPOINT ${sqlQuote(endpoint)});`; return mode === 'export' ? `${setup} COPY (${buildQuery(options)}) TO ${sqlQuote(options.output)} WITH (HEADER, FORMAT CSV);` : `${setup} ${buildQuery(options, 'count')}`; }
function redact(text, token = process.env.FSQ_PLACES_TOKEN) { return token ? String(text).split(token).join('<REDACTED>') : String(text); }
function preflightDuckDb(binary = process.env.DUCKDB_BIN || 'duckdb', runner = spawnSync) { const result = runner(binary, ['--version'], { shell: false, encoding: 'utf8' }); if (result.error) throw new Error(`DuckDB executable not found: ${binary}`); const version = parseVersion(result.stdout); if (!versionAtLeast(version)) throw new Error('DuckDB >= 1.4.0 is required.'); return { binary, version }; }
function parseEligibleCount(stdout, limit) {
  const candidates = String(stdout).split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d+$/.test(line)).map(Number);
  const eligible = candidates.length ? candidates[candidates.length - 1] : NaN;
  if (!Number.isInteger(eligible) || eligible < 0 || eligible > limit) throw new Error('Unable to parse eligible count from DuckDB output.');
  return eligible;
}function run(options, binary = process.env.DUCKDB_BIN || 'duckdb', runner = spawnSync, logger = console.log) {
  const info = preflightDuckDb(binary, runner);
  if (options.check) return { ...info, query: buildDuckDbSql(options, 'count'), network: false, wrote: false };
  if (!process.env.FSQ_PLACES_TOKEN) throw new Error('FSQ_PLACES_TOKEN is required.');
  const timeoutMs = Number(process.env.FSQ_QUERY_TIMEOUT_MS) > 0 ? Number(process.env.FSQ_QUERY_TIMEOUT_MS) : QUERY_TIMEOUT_MS;
  logger(`[FSQ] DuckDB ${info.version.join('.')}`);
  logger('[FSQ] Connecting to Iceberg catalog...');
  logger(`[FSQ] Geography: ${options.bbox ? `bbox ${options.bbox.join(',')}` : `country ${options.country}`}`);
  logger(`[FSQ] Limit: ${options.limit}`);
  logger('[FSQ] Running filtered query...');
  const started = Date.now();
  if (!options.dryRun) {
    if (!options.overwrite && fs.existsSync(options.output)) throw new Error('Output file already exists; use --overwrite to replace it.');
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
  }
  const result = runner(binary, options.dryRun ? ['-csv', '-noheader'] : [], { input: buildDuckDbSql(options, options.dryRun ? 'count' : 'export'), env: { ...process.env }, shell: false, encoding: 'utf8', timeout: timeoutMs });
  if (result.error || result.status !== 0) {
    if (result.error?.code === 'ETIMEDOUT' || result.error?.signal === 'SIGTERM') throw new Error(`FSQ query timed out after ${timeoutMs}ms`);
    throw new Error(redact(result.stderr || result.error?.message || 'DuckDB command failed.'));
  }
  const durationMs = Date.now() - started;
  logger(`[FSQ] Query completed in ${(durationMs / 1000).toFixed(1)}s`);
  let eligibleUpToLimit;
  if (options.dryRun) {
    eligibleUpToLimit = parseEligibleCount(result.stdout, options.limit); logger(`[FSQ] Eligible up to limit: ${eligibleUpToLimit}`);
  } else {
    logger('[FSQ] Export completed');
    logger(`[FSQ] Output: ${options.output}`);
  }
  return { ...info, network: true, wrote: !options.dryRun, output: options.output, durationMs, eligibleUpToLimit, stdout: redact(result.stdout) };
}function main() { try { const options = parseArgs(process.argv.slice(2)); const result = run(options); console.log(JSON.stringify({ mode: options.check ? 'check' : options.dryRun ? 'dry-run' : 'export', duckdb: result.version.join('.'), geography: options.bbox ? { bbox: options.bbox } : { country: options.country }, limit: options.limit, eligibleUpToLimit: result.eligibleUpToLimit, durationMs: result.durationMs, output: options.check || options.dryRun ? undefined : options.output, wrote: result.wrote, query: options.check ? result.query : undefined })); } catch (error) { console.error(redact(error.message)); process.exitCode = 1; } }
if (require.main === module) main();
module.exports = { DEFAULT_ENDPOINT, MIN_DUCKDB_VERSION, HARD_MAX, DEFAULT_LIMIT, QUERY_TIMEOUT_MS, CATEGORY_TERMS, CRITICAL_FLAGS, CSV_FIELDS, parseVersion, versionAtLeast, parseBbox, parseCountry, parseArgs, categoryLabelsSupported, flagsAllowed, categoryPredicate, buildQuery, buildDuckDbSql, redact, preflightDuckDb, parseEligibleCount, run };
