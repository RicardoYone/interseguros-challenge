/** The username or password is wrong. Deliberately does not say which one. */
export class InvalidCredentialsError extends Error {
  override readonly name = 'InvalidCredentialsError';

  constructor() {
    super('invalid credentials');
  }
}

/** The access token is missing, malformed, forged, expired or meant for someone else. */
export class InvalidTokenError extends Error {
  override readonly name = 'InvalidTokenError';

  constructor(options?: ErrorOptions) {
    super('invalid access token', options);
  }
}
