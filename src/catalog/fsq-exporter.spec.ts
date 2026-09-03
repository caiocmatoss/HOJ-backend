const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const exporter = require('../../scripts/export-fsq-os-places.cjs');

function fakeRunner(binary, args, options) {
  if (args.includes('--version')) return { status: 0, stdout: 'v1.5.5\n', stderr: '' };
  return { status: 0, stdout: 'eligible_up_to_limit\n50\n', stderr: '' };
}

describe('FSQ DuckDB exporter', () => {
  it('uses native list expressions rather than correlated UNNEST', () => { const sql=exporter.buildQuery({bbox:[-47,-24,-46,-23],limit:50}); expect(sql).toContain('list_has_any'); expect(sql).toContain('list_transform'); expect(sql).toContain('list_filter'); expect(sql).not.toMatch(/FROM UNNEST/i); });
  it('emits Restaurant predicate only once', () => { const predicate=exporter.categoryPredicate(); expect((predicate.match(/lower\(label\) = 'restaurant'/g)||[])).toHaveLength(1); });
  it('accepts product categories and rejects bakery/barber false positives', () => { const accepted=['Dining and Drinking > Restaurant > Pizzeria','Dining and Drinking > Restaurant > Burger Joint','Dining and Drinking > Bar','Cocktail Bar','Pub','Night Club','Nightclub','Music Venue','Concert Hall']; for(const label of accepted) expect(exporter.categoryLabelsSupported([label])).toBe(true); expect(exporter.categoryLabelsSupported(['Dining and Drinking > Bakery'])).toBe(false); expect(exporter.categoryLabelsSupported(['Business and Professional Services > Barber Shop'])).toBe(false); });
  it('handles critical flags and null/empty flags', () => { expect(exporter.flagsAllowed(null)).toBe(true); expect(exporter.flagsAllowed([])).toBe(true); expect(exporter.flagsAllowed(['alguma_flag_nao_critica'])).toBe(true); expect(exporter.flagsAllowed(['duplicate'])).toBe(false); expect(exporter.flagsAllowed(['closed'])).toBe(false); });
  it('preserves geography, open filter and bounded limit', () => { const bbox=exporter.buildQuery({bbox:[-47,-24,-46,-23],limit:50}); expect(bbox).toContain('latitude IS NOT NULL'); expect(bbox).toContain('longitude IS NOT NULL'); expect(bbox).toContain('date_closed IS NULL'); expect(bbox).toContain('LIMIT 50'); const country=exporter.buildQuery({country:'BR',limit:10}); expect(country).toContain("country = 'BR'"); });
  it('selects only importer fields and keeps token out of SQL', () => { const sql=exporter.buildDuckDbSql({bbox:[-47,-24,-46,-23],limit:5},'count'); expect(sql).toContain("getenv('FSQ_PLACES_TOKEN')"); expect(sql).not.toContain('Bearer'); expect(sql).not.toContain('SELECT *'); for(const field of exporter.CSV_FIELDS) expect(sql).toContain(field); });
  it('supports version, timeout and redaction helpers', () => { expect(exporter.versionAtLeast([1,4,0])).toBe(true); expect(exporter.versionAtLeast([1,3,9])).toBe(false); expect(exporter.redact('token=abc','abc')).toBe('token=<REDACTED>'); expect(exporter.QUERY_TIMEOUT_MS).toBe(120000); });
  it("parses machine-readable DuckDB counts and rejects invalid values", () => {
    expect(exporter.parseEligibleCount("50\n", 50)).toBe(50);
    expect(exporter.parseEligibleCount("true\n50\n", 50)).toBe(50);
    expect(exporter.parseEligibleCount("true\r\n0\r\n", 50)).toBe(0);
    expect(exporter.parseEligibleCount("true\n50\n", 50)).toBe(50);
    for (const output of ["51\n", "-1\n", "true\nabc\n", ""]) {
      expect(() => exporter.parseEligibleCount(output, 50)).toThrow("Unable to parse eligible count");
    }
  });
  it('ignores an existing output during dry-run and does not create output directory', () => { const root=fs.mkdtempSync(path.join(os.tmpdir(),'fsq-')); const output=path.join(root,'existing','places.csv'); fs.mkdirSync(path.dirname(output)); fs.writeFileSync(output,'keep'); process.env.FSQ_PLACES_TOKEN='test-token'; const result=exporter.run({bbox:[-47,-24,-46,-23],limit:50,dryRun:true,check:false,output,overwrite:false},'duckdb',fakeRunner,()=>{}); expect(result.wrote).toBe(false); expect(fs.readFileSync(output,'utf8')).toBe('keep'); expect(fs.existsSync(path.join(root,'new-output'))).toBe(false); delete process.env.FSQ_PLACES_TOKEN; });
  it('check mode ignores output and remains non-writing', () => { const root=fs.mkdtempSync(path.join(os.tmpdir(),'fsq-')); const output=path.join(root,'existing','places.csv'); fs.mkdirSync(path.dirname(output)); fs.writeFileSync(output,'keep'); const result=exporter.run({bbox:[-47,-24,-46,-23],limit:50,dryRun:false,check:true,output,overwrite:false},'duckdb',fakeRunner,()=>{}); expect(result.network).toBe(false); expect(fs.readFileSync(output,'utf8')).toBe('keep'); });
  it('normal export blocks existing output unless overwrite is set', () => { const root=fs.mkdtempSync(path.join(os.tmpdir(),'fsq-')); const output=path.join(root,'places.csv'); fs.writeFileSync(output,'keep'); process.env.FSQ_PLACES_TOKEN='test-token'; expect(()=>exporter.run({bbox:[-47,-24,-46,-23],limit:50,dryRun:false,check:false,output,overwrite:false},'duckdb',fakeRunner,()=>{})).toThrow(/Output file already exists/); expect(()=>exporter.run({bbox:[-47,-24,-46,-23],limit:50,dryRun:false,check:false,output,overwrite:true},'duckdb',fakeRunner,()=>{})).not.toThrow(); delete process.env.FSQ_PLACES_TOKEN; });
});
