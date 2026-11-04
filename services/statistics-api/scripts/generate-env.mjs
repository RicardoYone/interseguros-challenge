// Generates the local .env file read by compose.yaml.
// Usage: npm run generate-env [-- --force]
// The password comes from DEMO_PASSWORD, or is generated and printed once.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createEnvironment } from './environment.mjs';

const OUTPUT_PATH = resolve(import.meta.dirname, '../../../.env');

const { values } = parseArgs({ options: { force: { type: 'boolean', default: false } } });

if (existsSync(OUTPUT_PATH) && !values.force) {
  console.error(`${OUTPUT_PATH} already exists. Pass --force to replace it.`);
  process.exit(1);
}

const password = process.env.DEMO_PASSWORD ?? randomBytes(12).toString('base64url');
const environment = await createEnvironment(password);

const content = Object.entries(environment)
  .map(([name, value]) => `${name}=${value}`)
  .join('\n');

writeFileSync(OUTPUT_PATH, `${content}\n`, { mode: 0o600 });

console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`Demo user: ${environment.DEMO_USERNAME}`);
if (process.env.DEMO_PASSWORD === undefined) {
  console.log(`Demo password (shown only once): ${password}`);
}
