import { assertTestDatabaseUrl, databaseNameFromUrl } from './test-database-guard';

describe('test database guard', () => {
  it('rejects missing, invalid and development database URLs', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow('DATABASE_URL_TEST is required');
    expect(() => assertTestDatabaseUrl('not-a-url')).toThrow('invalid');
    expect(() => assertTestDatabaseUrl('postgresql://user:pass@localhost:5432/hojeond')).toThrow('hojeond');
    expect(() => assertTestDatabaseUrl('postgresql://user:pass@localhost:5432/production')).toThrow('test database');
  });

  it('accepts only explicitly named test databases without exposing credentials', () => {
    expect(assertTestDatabaseUrl('postgresql://user:secret@localhost:5432/hojeond_test')).toBe('hojeond_test');
    expect(assertTestDatabaseUrl('postgresql://user:secret@localhost:5432/hojeond_integration')).toBe('hojeond_integration');
    expect(databaseNameFromUrl('postgresql://user:secret@localhost:5432/hojeond_e2e')).toBe('hojeond_e2e');
  });
});
