import bcrypt from 'bcryptjs';
import { pino, type Logger } from 'pino';
import { createApp, type AppDependencies } from '../app.js';
import { LoginService } from '../auth/application/login-service.js';
import { BcryptPasswordVerifier } from '../auth/infrastructure/bcrypt-password-verifier.js';
import { JoseTokenService } from '../auth/infrastructure/jose-token-service.js';
import { generateTestKeyPair, TEST_AUDIENCE, TEST_ISSUER, TEST_TTL_SECONDS } from './auth-fixtures.js';

export const DEMO_USERNAME = 'demo';
export const DEMO_PASSWORD = 'correct-password';
export const ALLOWED_ORIGIN = 'https://allowed.example';

/** bcrypt's minimum cost: these tests exercise behavior, not hashing strength. */
const FAST_BCRYPT_ROUNDS = 4;

const silentLogger: Logger = pino({ level: 'silent' });

/** Builds the real application, with real tokens and hashing, around throwaway keys. */
export async function createTestApp(overrides: Partial<AppDependencies> = {}) {
  const tokenService = await JoseTokenService.create({
    ...generateTestKeyPair(),
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    ttlSeconds: TEST_TTL_SECONDS,
  });
  const loginService = new LoginService({
    username: DEMO_USERNAME,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, FAST_BCRYPT_ROUNDS),
    passwordVerifier: new BcryptPasswordVerifier(),
    tokenIssuer: tokenService,
  });
  const app = createApp({
    logger: silentLogger,
    corsAllowedOrigins: [ALLOWED_ORIGIN],
    trustProxyHops: 0,
    bodyLimit: '1mb',
    loginRateLimit: 100,
    loginService,
    tokenVerifier: tokenService,
    ...overrides,
  });
  const { token } = await tokenService.issue(DEMO_USERNAME);

  return { app, validToken: token };
}
