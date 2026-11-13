import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig } from './runtime-config';

describe('parseRuntimeConfig', () => {
  it('keeps only the two API addresses', () => {
    const config = parseRuntimeConfig({
      statisticsApiUrl: 'http://localhost:3000',
      qrApiUrl: 'http://localhost:8080',
      extra: true,
    });

    expect(config).toEqual({
      statisticsApiUrl: 'http://localhost:3000',
      qrApiUrl: 'http://localhost:8080',
    });
  });

  it.each([
    ['a missing address', { statisticsApiUrl: 'http://localhost:3000' }],
    ['an empty address', { statisticsApiUrl: '', qrApiUrl: 'http://localhost:8080' }],
    ['an address that is not text', { statisticsApiUrl: 3000, qrApiUrl: 'http://localhost:8080' }],
    ['null', null],
    ['a list', ['http://localhost:3000', 'http://localhost:8080']],
  ])('rejects %s, so that a typo fails at startup', (_description, value) => {
    expect(() => parseRuntimeConfig(value)).toThrow(
      'config.json must define statisticsApiUrl and qrApiUrl',
    );
  });
});
