import { booleanEnv, corsOrigins, positiveInt } from './security-config';

describe('security configuration helpers', () => {
  it('accepts only bounded positive integers', () => {
    expect(positiveInt('10', 1)).toBe(10);
    expect(positiveInt('0', 1)).toBe(1);
    expect(positiveInt('nope', 1)).toBe(1);
    expect(positiveInt('-2', 1)).toBe(1);
    expect(positiveInt('1.5', 1)).toBe(1);
    expect(positiveInt('999999', 1, 100)).toBe(1);
  });
  it('parses trust proxy and cors origins safely', () => {
    expect(booleanEnv('true')).toBe(true);
    expect(booleanEnv('false', true)).toBe(false);
    expect(corsOrigins('https://a.example, https://b.example')).toEqual(['https://a.example', 'https://b.example']);
    expect(corsOrigins(' * ')).toEqual([]);
  });
});
