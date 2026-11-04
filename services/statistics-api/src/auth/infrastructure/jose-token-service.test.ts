import { createHmac } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader, importPKCS8, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  generateTestKeyPair,
  TEST_AUDIENCE,
  TEST_ISSUER,
  TEST_TTL_SECONDS,
  type TestKeyPair,
} from '../../testing/auth-fixtures.js';
import { InvalidTokenError } from '../domain/errors.js';
import { JoseTokenService } from './jose-token-service.js';

const base64Url = (value: string): string => Buffer.from(value).toString('base64url');

const nowInSeconds = (): number => Math.floor(Date.now() / 1000);

describe('JoseTokenService', () => {
  let keys: TestKeyPair;
  let service: JoseTokenService;

  /** Signs a token with the real private key so that only its claims can be at fault. */
  const signWithClaims = async (
    claims: { iss?: string; aud?: string; sub?: string; exp?: number },
  ): Promise<string> => {
    const privateKey = await importPKCS8(keys.privateKeyPem, 'ES256');
    return new SignJWT(claims).setProtectedHeader({ alg: 'ES256' }).sign(privateKey);
  };

  beforeAll(async () => {
    keys = generateTestKeyPair();
    service = await JoseTokenService.create({
      ...keys,
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
      ttlSeconds: TEST_TTL_SECONDS,
    });
  });

  describe('issue', () => {
    it('signs with ES256 and declares issuer, audience, subject and lifetime', async () => {
      const issued = await service.issue('demo');

      const claims = decodeJwt(issued.token);
      expect(decodeProtectedHeader(issued.token).alg).toBe('ES256');
      expect(claims).toMatchObject({ iss: TEST_ISSUER, aud: TEST_AUDIENCE, sub: 'demo' });
      expect(Number(claims.exp) - Number(claims.iat)).toBe(TEST_TTL_SECONDS);
      expect(issued.expiresInSeconds).toBe(TEST_TTL_SECONDS);
    });
  });

  describe('verify', () => {
    it('accepts a token it issued and reveals its subject', async () => {
      const { token } = await service.issue('demo');

      await expect(service.verify(token)).resolves.toEqual({ subject: 'demo' });
    });

    it('rejects an unsigned token using alg none', async () => {
      const header = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
      const payload = base64Url(
        JSON.stringify({
          iss: TEST_ISSUER,
          aud: TEST_AUDIENCE,
          sub: 'attacker',
          exp: nowInSeconds() + 600,
        }),
      );

      await expect(service.verify(`${header}.${payload}.`)).rejects.toThrow(InvalidTokenError);
    });

    it('rejects an HS256 token signed with the public key as shared secret', async () => {
      const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = base64Url(
        JSON.stringify({
          iss: TEST_ISSUER,
          aud: TEST_AUDIENCE,
          sub: 'attacker',
          exp: nowInSeconds() + 600,
        }),
      );
      const signature = createHmac('sha256', keys.publicKeyPem)
        .update(`${header}.${payload}`)
        .digest('base64url');

      await expect(service.verify(`${header}.${payload}.${signature}`)).rejects.toThrow(
        InvalidTokenError,
      );
    });

    it('rejects a token whose claims were tampered with', async () => {
      const { token } = await service.issue('demo');
      const [header, , signature] = token.split('.');
      const forgedPayload = base64Url(
        JSON.stringify({
          iss: TEST_ISSUER,
          aud: TEST_AUDIENCE,
          sub: 'attacker',
          exp: nowInSeconds() + 600,
        }),
      );

      await expect(service.verify(`${String(header)}.${forgedPayload}.${String(signature)}`)).rejects.toThrow(
        InvalidTokenError,
      );
    });

    it('rejects a token signed with another key', async () => {
      const otherService = await JoseTokenService.create({
        ...generateTestKeyPair(),
        issuer: TEST_ISSUER,
        audience: TEST_AUDIENCE,
        ttlSeconds: TEST_TTL_SECONDS,
      });
      const { token } = await otherService.issue('demo');

      await expect(service.verify(token)).rejects.toThrow(InvalidTokenError);
    });

    it.each([
      ['it expired', { iss: TEST_ISSUER, aud: TEST_AUDIENCE, sub: 'demo', exp: nowInSeconds() - 60 }],
      ['it has no expiration', { iss: TEST_ISSUER, aud: TEST_AUDIENCE, sub: 'demo' }],
      ['it has no subject', { iss: TEST_ISSUER, aud: TEST_AUDIENCE, exp: nowInSeconds() + 600 }],
      ['it comes from another issuer', { iss: 'other', aud: TEST_AUDIENCE, sub: 'demo', exp: nowInSeconds() + 600 }],
      ['it targets another audience', { iss: TEST_ISSUER, aud: 'other', sub: 'demo', exp: nowInSeconds() + 600 }],
    ])('rejects a correctly signed token when %s', async (_description, claims) => {
      const token = await signWithClaims(claims);

      await expect(service.verify(token)).rejects.toThrow(InvalidTokenError);
    });

    it('rejects text that is not a token', async () => {
      await expect(service.verify('not-a-token')).rejects.toThrow(InvalidTokenError);
    });
  });
});
