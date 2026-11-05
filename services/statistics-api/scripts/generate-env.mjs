// Generates the local .env file read by compose.yaml.
// Usage: npm run generate-env [-- --force] [-- --save-password]
// The password comes from DEMO_PASSWORD, or is generated and printed once.
// --save-password also stores it in the file, for local use only: it adds no power,
// because the file already holds the private key that signs the tokens.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createEnvironment } from './environment.mjs';

const OUTPUT_PATH = resolve(import.meta.dirname, '../../../.env');

const { values } = parseArgs({
  options: {
    force: { type: 'boolean', default: false },
    'save-password': { type: 'boolean', default: false },
  },
});
const savePassword = values['save-password'];

if (existsSync(OUTPUT_PATH) && !values.force) {
  console.error(`${OUTPUT_PATH} already exists. Pass --force to replace it.`);
  process.exit(1);
}

const password = process.env.DEMO_PASSWORD ?? randomBytes(12).toString('base64url');
const environment = await createEnvironment(password, { keepPassword: savePassword });

const content = Object.entries(environment)
  .map(([name, value]) => `${name}=${value}`)
  .join('\n');

writeFileSync(OUTPUT_PATH, `${content}\n`, { mode: 0o600 });
// The mode above only applies to a new file: --force could keep wider permissions.
chmodSync(OUTPUT_PATH, 0o600);

console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`Demo user: ${environment.DEMO_USERNAME}`);
if (process.env.DEMO_PASSWORD === undefined && !savePassword) {
  console.log(`Demo password (shown only once): ${password}`);
}
