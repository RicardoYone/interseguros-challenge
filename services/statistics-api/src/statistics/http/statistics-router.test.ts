import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../testing/test-app.js';

const STATISTICS_PATH = '/api/v1/statistics';

describe('POST /api/v1/statistics', () => {
  let app: Express;
  let validToken: string;

  const postMatrices = (body: unknown) =>
    request(app)
      .post(STATISTICS_PATH)
      .set('Authorization', `Bearer ${validToken}`)
      .send(body as object);

  beforeAll(async () => {
    ({ app, validToken } = await createTestApp());
  });

  it('returns the statistics of the matrices it receives', async () => {
    const response = await postMatrices({
      matrices: [
        {
          name: 'Q',
          values: [
            [1, 0],
            [0, 1],
          ],
        },
        { name: 'R', values: [[2, 4]] },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      max: 4,
      min: 0,
      average: 8 / 6,
      sum: 8,
      hasDiagonalMatrix: true,
      matrices: [
        { name: 'Q', isDiagonal: true },
        { name: 'R', isDiagonal: false },
      ],
    });
  });

  it('rejects a request without a token', async () => {
    const response = await request(app)
      .post(STATISTICS_PATH)
      .send({ matrices: [{ name: 'A', values: [[1]] }] });

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.type).toBe('application/problem+json');
  });

  it('rejects a request with an invalid token', async () => {
    const response = await request(app)
      .post(STATISTICS_PATH)
      .set('Authorization', 'Bearer forged')
      .send({ matrices: [{ name: 'A', values: [[1]] }] });

    expect(response.status).toBe(401);
  });

  it('rejects an authorization header that is not a bearer token', async () => {
    const response = await request(app)
      .post(STATISTICS_PATH)
      .set('Authorization', `Basic ${validToken}`)
      .send({ matrices: [{ name: 'A', values: [[1]] }] });

    expect(response.status).toBe(401);
  });

  it.each([
    ['no matrices field', {}],
    ['an empty list of matrices', { matrices: [] }],
    ['a matrix without a name', { matrices: [{ values: [[1]] }] }],
    ['a matrix without rows', { matrices: [{ name: 'A', values: [] }] }],
    ['a row without values', { matrices: [{ name: 'A', values: [[]] }] }],
    ['rows of different lengths', { matrices: [{ name: 'A', values: [[1, 2], [3]] }] }],
    ['a value that is not a number', { matrices: [{ name: 'A', values: [['1']] }] }],
  ])('responds 422 to %s and points at the problem', async (_description, body) => {
    const response = await postMatrices(body);

    expect(response.status).toBe(422);
    expect(response.type).toBe('application/problem+json');
    expect(response.body).toMatchObject({ status: 422 });
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it('responds 422 when a value overflows while parsing', async () => {
    const response = await request(app)
      .post(STATISTICS_PATH)
      .set('Authorization', `Bearer ${validToken}`)
      .set('Content-Type', 'application/json')
      .send('{"matrices":[{"name":"A","values":[[1e999]]}]}');

    expect(response.status).toBe(422);
  });

  it('responds 422 when the sum overflows instead of returning null', async () => {
    const response = await postMatrices({
      matrices: [{ name: 'A', values: [[1.7e308, 1.7e308]] }],
    });

    expect(response.status).toBe(422);
    expect(response.type).toBe('application/problem+json');
  });
});
