export function databaseNameFromUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Refusing integration tests: DATABASE_URL_TEST is invalid.');
  }
  const name = decodeURIComponent(url.pathname.replace(/^\/+/, '')).split('/')[0]?.trim();
  if (!name) throw new Error('Refusing integration tests: DATABASE_URL_TEST has no database name.');
  return name;
}

export function assertTestDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error('Refusing integration tests: DATABASE_URL_TEST is required.');
  const name = databaseNameFromUrl(value);
  if (name.toLowerCase() === 'hojeond') throw new Error('Refusing integration tests against database hojeond.');
  if (!/(test|integration|e2e)/i.test(name)) throw new Error('Refusing integration tests: database name must explicitly identify a test database.');
  return name;
}
