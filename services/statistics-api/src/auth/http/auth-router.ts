import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ProblemError } from '../../shared/http/problem.js';
import { parseBody } from '../../shared/http/validation.js';
import type { LoginService } from '../application/login-service.js';
import { InvalidCredentialsError } from '../domain/errors.js';

const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;

/** bcrypt ignores everything after its first 72 bytes. */
const BCRYPT_MAX_BYTES = 72;

const credentialsSchema = z.object({
  username: z.string().min(1).max(128),
  password: z
    .string()
    .min(1)
    .refine((password) => Buffer.byteLength(password) <= BCRYPT_MAX_BYTES, {
      error: `must be at most ${String(BCRYPT_MAX_BYTES)} bytes`,
    }),
});

export interface AuthRouterOptions {
  readonly loginService: LoginService;
  readonly loginRateLimit: number;
}

export function createAuthRouter({ loginService, loginRateLimit }: AuthRouterOptions): Router {
  const router = Router();

  router.post(
    '/token',
    rateLimit({
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
      limit: loginRateLimit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_request, _response, next) => {
        next(new ProblemError(429, 'Too many login attempts. Try again later.'));
      },
    }),
    express.json({ limit: '1kb' }),
    async (request, response) => {
      const credentials = parseBody(credentialsSchema, request.body);

      try {
        const { token, expiresInSeconds } = await loginService.login(credentials);
        // RFC 6749: a response carrying a token must not be stored by any cache.
        response.setHeader('Cache-Control', 'no-store');
        response.json({ accessToken: token, expiresIn: expiresInSeconds });
      } catch (error) {
        if (error instanceof InvalidCredentialsError) {
          throw new ProblemError(401, 'The username or password is incorrect.');
        }
        throw error;
      }
    },
  );

  return router;
}
