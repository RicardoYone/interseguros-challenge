// Starts the whole system locally: creates .env when it is missing, builds the images
// and waits until the services are ready. Needs Docker and Node.js.
//
//   npm start              start, reusing .env when it exists
//   npm start -- --reset   replace .env with new keys and a new password
//   npm stop               stop everything
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';

const ROOT = resolve(import.meta.dirname, '..');
const ENV_PATH = resolve(ROOT, '.env');
const STATISTICS_API = resolve(ROOT, 'services/statistics-api');

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options }).status;

const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });

if (run('docker', ['info'], { stdio: 'ignore' }) !== 0) {
  fail('Docker is not available. Install or start Docker Desktop, then run this command again.');
}

if (values.reset || !existsSync(ENV_PATH)) {
  // The generator needs the service dependencies. Windows only runs npm through a shell,
  // which is why this is one fixed string: no outside value reaches the command.
  if (!existsSync(resolve(STATISTICS_API, 'node_modules/bcryptjs'))) {
    const installStatus = run('npm ci', [], { cwd: STATISTICS_API, shell: true });
    if (installStatus !== 0) fail('Could not install the dependencies of statistics-api.');
  }

  const generator = resolve(STATISTICS_API, 'scripts/generate-env.mjs');
  const generateStatus = run(process.execPath, [generator, '--force', '--save-password']);
  if (generateStatus !== 0) fail('Could not create .env.');
}

if (run('docker', ['compose', 'up', '--build', '--detach', '--wait']) !== 0) {
  fail('The system did not start. Check that ports 4200, 8080 and 3000 are free, then read: docker compose logs');
}

const { DEMO_USERNAME, DEMO_PASSWORD } = parseEnv(readFileSync(ENV_PATH, 'utf8'));

console.log(`
System ready.

  Frontend         http://localhost:4200
  qr-api           http://localhost:8080
  statistics-api   http://localhost:3000

  User             ${DEMO_USERNAME}
  Password         ${DEMO_PASSWORD ?? 'the one shown when .env was created (forgot it? npm start -- --reset)'}

Stop it with: npm stop
Read the logs with: docker compose logs --follow
`);
