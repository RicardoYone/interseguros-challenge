import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGIN, createTestApp } from './testing/test-app.js';

const STATISTICS_PATH = '/api/v1/statistics';

describe('application', () => {
  describe('health', () => {
    it('answers without a token', async () => {
      const { app } = await createTestApp();

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('error format', () => {
    it('responds with a problem document to an unknown route', async () => {
      const { app } = await createTestApp();

      const response = await request(app).get('/nothing-here');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toBe('application/problem+json');
      expect(response.body).toMatchObject({ status: 404, title: 'Not Found' });
    });

    it('responds 400 to malformed JSON', async () => {
      const { app, validToken } = await createTestApp();

      const response = await request(app)
        .post(STATISTICS_PATH)
        .set('Authorization', `Bearer ${validToken}`)
        .set('Content-Type', 'application/json')
        .send('{"matrices":');

      expect(response.status).toBe(400);
      expect(response.type).toBe('application/problem+json');
    });

    it('responds 413 to a body over the limit', async () => {
      const { app, validToken } = await createTestApp({ bodyLimit: '100b' });

      const response = await request(app)
        .post(STATISTICS_PATH)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ matrices: [{ name: 'A', values: [new Array<number>(100).fill(1)] }] });

      expect(response.status).toBe(413);
      expect(response.type).toBe('application/problem+json');
    });

    it('hides the cause of an unexpected failure from the client', async () => {
      const { app } = await createTestApp({
        tokenVerifier: {
          verify: () => Promise.reject(new Error('database password is hunter2')),
        },
      });

      const response = await request(app)
        .post(STATISTICS_PATH)
        .set('Authorization', 'Bearer any')
        .send({ matrices: [{ name: 'A', values: [[1]] }] });

      expect(response.status).toBe(500);
      expect(response.type).toBe('application/problem+json');
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
    });
  });

  describe('CORS', () => {
    it('allows a configured origin', async () => {
      const { app } = await createTestApp();

      const response = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);

      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('does not allow any other origin', async () => {
      const { app } = await createTestApp();

      const response = await request(app).get('/health').set('Origin', 'https://evil.example');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('security headers', () => {
    it('does not reveal the framework and sets protective headers', async () => {
      const { app } = await createTestApp();

      const response = await request(app).get('/health');

      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('request id', () => {
    it('echoes a well-formed incoming id so a request can be traced across services', async () => {
      const { app } = await createTestApp();

      const response = await request(app).get('/health').set('X-Request-ID', 'abc-123');

      expect(response.headers['x-request-id']).toBe('abc-123');
    });

    it('generates an id when none arrives', async () => {
      const { app } = await createTestApp();

      const response = await request(app).get('/health');

      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('replaces an id that could inject content into the logs', async () => {
      const { app } = await createTestApp();

      const response = await request(app).get('/health').set('X-Request-ID', 'bad id {"level":60}');

      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('logging', () => {
    it('never writes the access token to the logs', async () => {
      const lines: string[] = [];
      const logger = pino({ level: 'info' }, { write: (line) => lines.push(line) });
      const { app, validToken } = await createTestApp({ logger });

      await request(app)
        .post(STATISTICS_PATH)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ matrices: [{ name: 'A', values: [[1]] }] });

      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('')).not.toContain(validToken);
    });
  });
});
