import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { LoginService } from './auth/application/login-service.js';
import type { TokenVerifier } from './auth/domain/ports.js';
import { createAuthRouter } from './auth/http/auth-router.js';
import { createRequireAuth } from './auth/http/require-auth.js';
import { errorHandler, notFoundHandler } from './shared/http/error-handler.js';
import { createRequestLogger } from './shared/http/request-logger.js';
import { createStatisticsRouter } from './statistics/http/statistics-router.js';

export interface AppDependencies {
  readonly logger: Logger;
  readonly corsAllowedOrigins: readonly string[];
  /** Reverse proxies in front of the service, needed to rate limit by the real client address. */
  readonly trustProxyHops: number;
  readonly bodyLimit: string;
  readonly loginRateLimit: number;
  readonly loginService: LoginService;
  readonly tokenVerifier: TokenVerifier;
}

export function createApp(dependencies: AppDependencies): Express {
  const { logger, corsAllowedOrigins, trustProxyHops, bodyLimit, loginRateLimit } = dependencies;
  const { loginService, tokenVerifier } = dependencies;

  const app = express();
  app.set('trust proxy', trustProxyHops);

  app.use(helmet());
  app.use(
    cors({
      origin: [...corsAllowedOrigins],
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
    }),
  );
  app.use(createRequestLogger(logger));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.use('/api/v1/auth', createAuthRouter({ loginService, loginRateLimit }));
  app.use(
    '/api/v1/statistics',
    createStatisticsRouter({ requireAuth: createRequireAuth(tokenVerifier), bodyLimit }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
