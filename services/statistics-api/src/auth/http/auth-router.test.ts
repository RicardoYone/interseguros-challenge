import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_TTL_SECONDS } from '../../testing/auth-fixtures.js';
import { createTestApp, DEMO_PASSWORD, DEMO_USERNAME } from '../../testing/test-app.js';

const TOKEN_PATH = '/api/v1/auth/token';

describe('POST /api/v1/auth/token', () => {
  it('returns a token that the protected endpoints accept', async () => {
    const { app } = await createTestApp();

    const login = await request(app)
      .post(TOKEN_PATH)
      .send({ username: DEMO_USERNAME, password: DEMO_PASSWORD });

    expect(login.status).toBe(200);
    expect(login.body.expiresIn).toBe(TEST_TTL_SECONDS);

    const statistics = await request(app)
      .post('/api/v1/statistics')
      .set('Authorization', `Bearer ${String(login.body.accessToken)}`)
      .send({ matrices: [{ name: 'A', values: [[1]] }] });

    expect(statistics.status).toBe(200);
  });

  it.each([
    ['a wrong password', { username: DEMO_USERNAME, password: 'wrong' }],
    ['an unknown user', { username: 'intruder', password: DEMO_PASSWORD }],
  ])('responds 401 to %s with the same message', async (_description, credentials) => {
    const { app } = await createTestApp();

    const response = await request(app).post(TOKEN_PATH).send(credentials);

    expect(response.status).toBe(401);
    expect(response.type).toBe('application/problem+json');
    expect(response.body.detail).toBe('The username or password is incorrect.');
  });

  it.each([
    ['a missing password', { username: DEMO_USERNAME }],
    ['a missing username', { password: DEMO_PASSWORD }],
    ['a password that is not text', { username: DEMO_USERNAME, password: 123 }],
    ['a password longer than bcrypt can hash', { username: DEMO_USERNAME, password: 'x'.repeat(73) }],
  ])('responds 422 to %s', async (_description, body) => {
    const { app } = await createTestApp();

    const response = await request(app).post(TOKEN_PATH).send(body);

    expect(response.status).toBe(422);
  });

  it('responds 429 once the attempts exceed the limit', async () => {
    const { app } = await createTestApp({ loginRateLimit: 2 });
    const attempt = () => request(app).post(TOKEN_PATH).send({ username: 'a', password: 'b' });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.type).toBe('application/problem+json');
  });
});
