import { pino } from 'pino';
import { createApp } from './app.js';
import { LoginService } from './auth/application/login-service.js';
import { BcryptPasswordVerifier } from './auth/infrastructure/bcrypt-password-verifier.js';
import { JoseTokenService } from './auth/infrastructure/jose-token-service.js';
import { loadConfig } from './shared/config.js';

/** Upper bound for in-flight requests to finish before the process exits anyway. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig(process.env);
const logger = pino({ level: config.logLevel });

const tokenService = await JoseTokenService.create(config.jwt);
const loginService = new LoginService({
  username: config.demoUser.username,
  passwordHash: config.demoUser.passwordHash,
  passwordVerifier: new BcryptPasswordVerifier(),
  tokenIssuer: tokenService,
});

const app = createApp({
  logger,
  corsAllowedOrigins: config.corsAllowedOrigins,
  trustProxyHops: config.trustProxyHops,
  bodyLimit: config.bodyLimit,
  loginRateLimit: config.loginRateLimit,
  loginService,
  tokenVerifier: tokenService,
});

const server = app.listen(config.port, (error) => {
  if (error !== undefined) {
    logger.fatal({ err: error }, 'server failed to start');
    process.exit(1);
  }
  logger.info({ port: config.port }, 'server listening');
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'shutting down');
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  server.close(() => process.exit(0));
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
