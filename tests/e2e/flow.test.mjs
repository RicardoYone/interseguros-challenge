// End-to-end tests: exercise the whole flow against the real running services.
//
//   DEMO_PASSWORD=<password> node --test tests/e2e/
//
// Point QR_API_URL and STATISTICS_API_URL at another environment to test it.
// Set E2E_CAN_STOP_SERVICES=true only when running against the local compose stack:
// the last test stops the statistics API to prove how the system fails without it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { before, describe, it } from 'node:test';

const QR_API_URL = process.env.QR_API_URL ?? 'http://localhost:8080';
const STATISTICS_API_URL = process.env.STATISTICS_API_URL ?? 'http://localhost:3000';
const DEMO_USERNAME = process.env.DEMO_USERNAME ?? 'demo';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const TOLERANCE = 1e-9;

const postJson = (url, body, token) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

const factorize = (matrix, token) => postJson(`${QR_API_URL}/api/v1/qr-factorizations`, { matrix }, token);

async function waitUntilHealthy(baseUrl) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet: try again.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  assert.fail(`${baseUrl} did not become healthy`);
}

async function login() {
  const response = await postJson(`${STATISTICS_API_URL}/api/v1/auth/token`, {
    username: DEMO_USERNAME,
    password: DEMO_PASSWORD,
  });
  assert.equal(response.status, 200);
  return (await response.json()).accessToken;
}

function assertProblem(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('content-type'), 'application/problem+json');
}

describe('system flow', () => {
  let token;

  before(async () => {
    assert.ok(DEMO_PASSWORD, 'DEMO_PASSWORD is required');
    await Promise.all([waitUntilHealthy(STATISTICS_API_URL), waitUntilHealthy(QR_API_URL)]);
    token = await login();
  });

  it('returns Q and R that rebuild the input, with their statistics', async () => {
    const matrix = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];

    const response = await factorize(matrix, token);

    assert.equal(response.status, 200);
    const { q, r, statistics } = await response.json();

    assert.equal(q.length, 3);
    assert.equal(q[0].length, 2);
    assert.equal(r.length, 2);
    assert.equal(r[0].length, 2);
    for (const [i, row] of matrix.entries()) {
      for (const [j, expected] of row.entries()) {
        const rebuilt = q[i][0] * r[0][j] + q[i][1] * r[1][j];
        assert.ok(Math.abs(rebuilt - expected) < TOLERANCE, `A != QR at (${i}, ${j})`);
      }
    }

    // Statistics calculated independently from the same Q and R.
    const values = [...q.flat(), ...r.flat()];
    const sum = values.reduce((total, value) => total + value, 0);
    assert.ok(Math.abs(statistics.max - Math.max(...values)) < TOLERANCE);
    assert.ok(Math.abs(statistics.min - Math.min(...values)) < TOLERANCE);
    assert.ok(Math.abs(statistics.sum - sum) < TOLERANCE);
    assert.ok(Math.abs(statistics.average - sum / values.length) < TOLERANCE);
    assert.deepEqual(
      statistics.matrices.map((matrixStatistics) => matrixStatistics.name),
      ['Q', 'R'],
    );
  });

  it('detects a diagonal matrix among the results', async () => {
    const response = await factorize([[3, 0], [0, 4]], token);

    assert.equal(response.status, 200);
    const { statistics } = await response.json();
    assert.equal(statistics.hasDiagonalMatrix, true);
  });

  it('lets the statistics API accept the same token directly', async () => {
    const response = await postJson(
      `${STATISTICS_API_URL}/api/v1/statistics`,
      { matrices: [{ name: 'A', values: [[1, 2]] }] },
      token,
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).sum, 3);
  });

  it('propagates the request id', async () => {
    const response = await fetch(`${QR_API_URL}/api/v1/qr-factorizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-ID': 'e2e-trace-1',
      },
      body: JSON.stringify({ matrix: [[1]] }),
    });

    assert.equal(response.headers.get('x-request-id'), 'e2e-trace-1');
  });

  it('rejects wrong credentials', async () => {
    const response = await postJson(`${STATISTICS_API_URL}/api/v1/auth/token`, {
      username: DEMO_USERNAME,
      password: 'wrong-password',
    });

    assertProblem(response, 401);
  });

  it('rejects a factorization without a token', async () => {
    assertProblem(await factorize([[1]]), 401);
  });

  it('rejects a forged token', async () => {
    const [header, , signature] = token.split('.');
    const payload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');

    assertProblem(await factorize([[1]], `${header}.${payload}.${signature}`), 401);
  });

  it('rejects rows of different lengths', async () => {
    assertProblem(await factorize([[1, 2], [3]], token), 422);
  });

  it(
    'answers 502 when the statistics API is down',
    { skip: process.env.E2E_CAN_STOP_SERVICES !== 'true' },
    async () => {
      execFileSync('docker', ['compose', 'stop', 'statistics-api'], { stdio: 'ignore' });
      try {
        assertProblem(await factorize([[1]], token), 502);
      } finally {
        execFileSync('docker', ['compose', 'start', 'statistics-api'], { stdio: 'ignore' });
      }
    },
  );
});
