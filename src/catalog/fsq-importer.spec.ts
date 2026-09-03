// Pure importer contract tests; no database writes.
const { normalizeRow, normalizeCategory, parseCsv } = require('../../scripts/import-fsq-os-places.cjs');

describe('FSQ OS Places importer rules', () => {
  it('accepts a supported valid place', () => expect(normalizeRow({ fsq_place_id: 'p1', name: 'Club', latitude: '-23', longitude: '-46', fsq_category_labels: 'night club' }).ok).toBe(true));
  it('rejects missing id and invalid coordinates', () => {
    expect(normalizeRow({ name: 'x', latitude: '-23', longitude: '-46', fsq_category_labels: 'bar' }).reason).toBe('missing_id');
    expect(normalizeRow({ fsq_place_id: 'p2', name: 'x', latitude: '100', longitude: '-46', fsq_category_labels: 'bar' }).reason).toBe('invalid_latitude');
  });
  it('rejects closed and unsupported records', () => {
    expect(normalizeRow({ fsq_place_id: 'p3', name: 'x', latitude: '-23', longitude: '-46', date_closed: '2025-01-01', fsq_category_labels: 'bar' }).reason).toBe('closed');
    expect(normalizeCategory({ fsq_category_labels: 'bank' })).toBeNull();
  });
  it('parses quoted CSV fields', () => expect(parseCsv('fsq_place_id,name\n1,"A, B"')[0].name).toBe('A, B'));
});
