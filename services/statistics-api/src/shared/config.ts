import { z } from 'zod';

const decodeBase64 = (value: string): string => Buffer.from(value, 'base64').toString('utf8');

const base64Secret = z.string().min(1).transform(decodeBase64);

/** True for a scheme and a host only, which rejects wildcards, empty items and URLs with a path. */
function isOrigin(value: string): boolean {
  return URL.canParse(value) && new URL(value).origin === value;
}

const originList = z
  .string()
  .min(1)
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .refine((origins) => origins.every(isOrigin), {
    error: 'must list http or https origins, without wildcards',
  });

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ALLOWED_ORIGINS: originList,
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  BODY_LIMIT: z.string().min(1).default('4mb'),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  JWT_PRIVATE_KEY_B64: base64Secret,
  JWT_PUBLIC_KEY_B64: base64Secret,
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWT_TTL_SECONDS: z.coerce.number().int().min(1).default(900),
  DEMO_USERNAME: z.string().min(1),
  DEMO_PASSWORD_HASH_B64: base64Secret,
});

export interface Config {
  readonly port: number;
  readonly logLevel: string;
  readonly corsAllowedOrigins: readonly string[];
  readonly trustProxyHops: number;
  readonly bodyLimit: string;
  readonly loginRateLimit: number;
  readonly jwt: {
    readonly privateKeyPem: string;
    readonly publicKeyPem: string;
    readonly issuer: string;
    readonly audience: string;
    readonly ttlSeconds: number;
  };
  readonly demoUser: {
    readonly username: string;
    readonly passwordHash: string;
  };
}

/** The environment is invalid. The message names the variables, never their values. */
export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
}

/**
 * Validates the environment so that a misconfigured service stops at startup
 * instead of failing later on the first request.
 *
 * @throws {ConfigurationError} listing every invalid variable.
 */
export function loadConfig(environment: Readonly<Record<string, string | undefined>>): Config {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigurationError(`invalid environment: ${problems.join('; ')}`);
  }

  const variables = result.data;
  return {
    port: variables.PORT,
    logLevel: variables.LOG_LEVEL,
    corsAllowedOrigins: variables.CORS_ALLOWED_ORIGINS,
    trustProxyHops: variables.TRUST_PROXY_HOPS,
    bodyLimit: variables.BODY_LIMIT,
    loginRateLimit: variables.LOGIN_RATE_LIMIT_MAX,
    jwt: {
      privateKeyPem: variables.JWT_PRIVATE_KEY_B64,
      publicKeyPem: variables.JWT_PUBLIC_KEY_B64,
      issuer: variables.JWT_ISSUER,
      audience: variables.JWT_AUDIENCE,
      ttlSeconds: variables.JWT_TTL_SECONDS,
    },
    demoUser: {
      username: variables.DEMO_USERNAME,
      passwordHash: variables.DEMO_PASSWORD_HASH_B64,
    },
  };
}
