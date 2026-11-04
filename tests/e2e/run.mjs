// Starts the whole system with throwaway secrets, runs the end-to-end tests against
// it and stops it. Needs Docker and `npm ci` in services/statistics-api.
//
//   node tests/e2e/run.mjs
//
// The secrets only live in this process, so no .env file is needed or touched.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createEnvironment } from '../../services/statistics-api/scripts/environment.mjs';

const password = randomBytes(12).toString('base64url');
const env = {
  ...process.env,
  ...(await createEnvironment(password)),
  COMPOSE_PROJECT_NAME: 'interseguros-e2e',
  DEMO_PASSWORD: password,
  E2E_CAN_STOP_SERVICES: 'true',
};

const run = (command, args) => spawnSync(command, args, { env, stdio: 'inherit' }).status;

const startStatus = run('docker', ['compose', 'up', '--build', '--detach', '--wait']);
const testStatus = startStatus === 0 ? run(process.execPath, ['--test', 'tests/e2e/flow.test.mjs']) : startStatus;

run('docker', ['compose', 'down', '--volumes']);

process.exit(testStatus ?? 1);
