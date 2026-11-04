// Generates the local .env file: an ES256 key pair and the demo user.
// Usage: npm run generate-env [-- --force]
// The password comes from DEMO_PASSWORD, or is generated and printed once.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const OUTPUT_PATH = resolve(import.meta.dirname, '../../../.env');

const { values } = parseArgs({ options: { force: { type: 'boolean', default: false } } });

if (existsSync(OUTPUT_PATH) && !values.force) {
  console.error(`${OUTPUT_PATH} already exists. Pass --force to replace it.`);
  process.exit(1);
}

const toBase64 = (value) => Buffer.from(value).toString('base64');

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const username = 'demo';
const password = process.env.DEMO_PASSWORD ?? randomBytes(12).toString('base64url');
const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

const environment = {
  JWT_PRIVATE_KEY_B64: toBase64(privateKey),
  JWT_PUBLIC_KEY_B64: toBase64(publicKey),
  JWT_ISSUER: 'interseguros-challenge-auth',
  JWT_AUDIENCE: 'interseguros-challenge-api',
  DEMO_USERNAME: username,
  DEMO_PASSWORD_HASH_B64: toBase64(passwordHash),
  CORS_ALLOWED_ORIGINS: 'http://localhost:8080,http://localhost:4200',
};

const content = Object.entries(environment)
  .map(([name, value]) => `${name}=${value}`)
  .join('\n');

writeFileSync(OUTPUT_PATH, `${content}\n`, { mode: 0o600 });

console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`Demo user: ${username}`);
if (process.env.DEMO_PASSWORD === undefined) {
  console.log(`Demo password (shown only once): ${password}`);
}
