import { generateKeyPairSync } from 'node:crypto';

export const TEST_ISSUER = 'test-issuer';
export const TEST_AUDIENCE = 'test-audience';
export const TEST_TTL_SECONDS = 900;

export interface TestKeyPair {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
}

/** Generates a throwaway P-256 key pair, the curve required by ES256. */
export function generateTestKeyPair(): TestKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}
