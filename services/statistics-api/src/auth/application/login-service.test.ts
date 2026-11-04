import { describe, expect, it, vi } from 'vitest';
import { InvalidCredentialsError } from '../domain/errors.js';
import type { PasswordVerifier, TokenIssuer } from '../domain/ports.js';
import { LoginService } from './login-service.js';

const ISSUED_TOKEN = { token: 'issued-token', expiresInSeconds: 900 };

function createService(passwordMatches: boolean) {
  const issue = vi.fn<TokenIssuer['issue']>().mockResolvedValue(ISSUED_TOKEN);
  const verify = vi.fn<PasswordVerifier['verify']>().mockResolvedValue(passwordMatches);
  const service = new LoginService({
    username: 'demo',
    passwordHash: 'stored-hash',
    passwordVerifier: { verify },
    tokenIssuer: { issue },
  });

  return { service, issue, verify };
}

describe('LoginService', () => {
  it('issues a token for the user when the credentials match', async () => {
    const { service, issue, verify } = createService(true);

    const result = await service.login({ username: 'demo', password: 'secret' });

    expect(result).toEqual(ISSUED_TOKEN);
    expect(verify).toHaveBeenCalledWith('secret', 'stored-hash');
    expect(issue).toHaveBeenCalledWith('demo');
  });

  it('rejects a wrong password without issuing a token', async () => {
    const { service, issue } = createService(false);

    await expect(service.login({ username: 'demo', password: 'wrong' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('rejects an unknown user without issuing a token', async () => {
    const { service, issue } = createService(true);

    await expect(service.login({ username: 'intruder', password: 'secret' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(issue).not.toHaveBeenCalled();
  });

  it('checks the password for unknown users so response time does not reveal who exists', async () => {
    const { service, verify } = createService(false);

    await expect(service.login({ username: 'intruder', password: 'guess' })).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(verify).toHaveBeenCalledWith('guess', 'stored-hash');
  });
});
