import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from './config.js';

const toBase64 = (value: string): string => Buffer.from(value).toString('base64');

const VALID_ENVIRONMENT = {
  JWT_PRIVATE_KEY_B64: toBase64('private-pem'),
  JWT_PUBLIC_KEY_B64: toBase64('public-pem'),
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
  DEMO_USERNAME: 'demo',
  DEMO_PASSWORD_HASH_B64: toBase64('$2b$hash'),
  CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
};

describe('loadConfig', () => {
  it('decodes secrets and splits the allowed origins', () => {
    const config = loadConfig(VALID_ENVIRONMENT);

    expect(config.jwt.privateKeyPem).toBe('private-pem');
    expect(config.jwt.publicKeyPem).toBe('public-pem');
    expect(config.demoUser.passwordHash).toBe('$2b$hash');
    expect(config.corsAllowedOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('applies defaults to optional settings', () => {
    const config = loadConfig(VALID_ENVIRONMENT);

    expect(config).toMatchObject({
      port: 3000,
      logLevel: 'info',
      trustProxyHops: 0,
      bodyLimit: '4mb',
      loginRateLimit: 10,
    });
    expect(config.jwt.ttlSeconds).toBe(900);
  });

  it('reads numeric settings from text', () => {
    const config = loadConfig({ ...VALID_ENVIRONMENT, PORT: '8080', JWT_TTL_SECONDS: '60' });

    expect(config.port).toBe(8080);
    expect(config.jwt.ttlSeconds).toBe(60);
  });

  it.each([
    'JWT_PRIVATE_KEY_B64',
    'JWT_PUBLIC_KEY_B64',
    'JWT_ISSUER',
    'JWT_AUDIENCE',
    'DEMO_USERNAME',
    'DEMO_PASSWORD_HASH_B64',
    'CORS_ALLOWED_ORIGINS',
  ])('refuses to start without %s and names it', (variable) => {
    const environment = { ...VALID_ENVIRONMENT, [variable]: undefined };

    expect(() => loadConfig(environment)).toThrow(ConfigurationError);
    expect(() => loadConfig(environment)).toThrow(variable);
  });

  it('refuses a wildcard origin', () => {
    expect(() => loadConfig({ ...VALID_ENVIRONMENT, CORS_ALLOWED_ORIGINS: '*' })).toThrow(
      ConfigurationError,
    );
  });

  it('refuses a port out of range', () => {
    expect(() => loadConfig({ ...VALID_ENVIRONMENT, PORT: '70000' })).toThrow(ConfigurationError);
  });

  it('does not reveal secret values in the error', () => {
    const environment = { ...VALID_ENVIRONMENT, PORT: 'invalid' };

    expect(() => loadConfig(environment)).not.toThrow('private-pem');
    expect(() => loadConfig(environment)).toThrow('PORT');
  });
});
