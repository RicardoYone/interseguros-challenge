import { InvalidCredentialsError } from '../domain/errors.js';
import type { AccessToken, PasswordVerifier, TokenIssuer } from '../domain/ports.js';

export interface LoginServiceOptions {
  readonly username: string;
  readonly passwordHash: string;
  readonly passwordVerifier: PasswordVerifier;
  readonly tokenIssuer: TokenIssuer;
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

/** Exchanges the credentials of the single demo user for an access token. */
export class LoginService {
  readonly #options: LoginServiceOptions;

  constructor(options: LoginServiceOptions) {
    this.#options = options;
  }

  /** @throws {InvalidCredentialsError} when the username or password is wrong. */
  async login({ username, password }: Credentials): Promise<AccessToken> {
    const { passwordHash, passwordVerifier, tokenIssuer } = this.#options;

    // The password is checked first and unconditionally: answering faster for an
    // unknown username would reveal which usernames exist.
    const passwordMatches = await passwordVerifier.verify(password, passwordHash);
    if (!passwordMatches || username !== this.#options.username) {
      throw new InvalidCredentialsError();
    }

    return tokenIssuer.issue(username);
  }
}
