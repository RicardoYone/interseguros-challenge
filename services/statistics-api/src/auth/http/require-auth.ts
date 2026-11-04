import type { RequestHandler } from 'express';
import { ProblemError } from '../../shared/http/problem.js';
import { InvalidTokenError } from '../domain/errors.js';
import type { TokenVerifier } from '../domain/ports.js';

const BEARER_PREFIX = 'Bearer ';

/** Rejects any request that does not carry a valid access token. */
export function createRequireAuth(tokenVerifier: TokenVerifier): RequestHandler {
  return async (request, response, next) => {
    const header = request.headers.authorization;

    try {
      if (!header?.startsWith(BEARER_PREFIX)) {
        throw new InvalidTokenError();
      }
      await tokenVerifier.verify(header.slice(BEARER_PREFIX.length));
      next();
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        response.setHeader('WWW-Authenticate', 'Bearer');
        throw new ProblemError(401, 'A valid access token is required.');
      }
      throw error;
    }
  };
}
