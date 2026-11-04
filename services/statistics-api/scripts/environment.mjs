import { generateKeyPairSync } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/** The login accepts up to 72 bytes, which is all that bcrypt reads. */
const MAX_PASSWORD_BYTES = 72;

const toBase64 = (value) => Buffer.from(value).toString('base64');

/**
 * Creates the variables the services need: a new ES256 key pair and the demo user.
 * The secrets only exist in the returned object: the caller decides where they go.
 */
export async function createEnvironment(password) {
  const passwordBytes = Buffer.byteLength(password);
  if (passwordBytes === 0 || passwordBytes > MAX_PASSWORD_BYTES) {
    throw new Error(`the password must have 1 to ${MAX_PASSWORD_BYTES} bytes, or the login would reject it`);
  }

  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  return {
    JWT_PRIVATE_KEY_B64: toBase64(privateKey),
    JWT_PUBLIC_KEY_B64: toBase64(publicKey),
    JWT_ISSUER: 'interseguros-challenge-auth',
    JWT_AUDIENCE: 'interseguros-challenge-api',
    DEMO_USERNAME: 'demo',
    DEMO_PASSWORD_HASH_B64: toBase64(await bcrypt.hash(password, BCRYPT_ROUNDS)),
    CORS_ALLOWED_ORIGINS: 'http://localhost:4200',
  };
}
