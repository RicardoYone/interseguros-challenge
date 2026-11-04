export interface AccessToken {
  readonly token: string;
  readonly expiresInSeconds: number;
}

export interface VerifiedIdentity {
  readonly subject: string;
}

export interface TokenIssuer {
  issue(subject: string): Promise<AccessToken>;
}

export interface TokenVerifier {
  /** @throws {InvalidTokenError} when the token cannot be trusted. */
  verify(token: string): Promise<VerifiedIdentity>;
}

export interface PasswordVerifier {
  verify(password: string, passwordHash: string): Promise<boolean>;
}
