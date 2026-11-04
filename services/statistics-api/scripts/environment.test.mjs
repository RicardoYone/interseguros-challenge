import { describe, expect, it } from 'vitest';
import { createEnvironment } from './environment.mjs';

describe('createEnvironment', () => {
  it.each([
    ['an empty password', ''],
    ['a password bcrypt would truncate', 'x'.repeat(73)],
    ['a password over 72 bytes in fewer characters', 'ñ'.repeat(40)],
  ])('refuses %s, which the login would reject', async (_description, password) => {
    await expect(createEnvironment(password)).rejects.toThrow('1 to 72 bytes');
  });

  it('accepts the longest password the login allows', async () => {
    const environment = await createEnvironment('x'.repeat(72));

    expect(environment.DEMO_USERNAME).toBe('demo');
  });
});
