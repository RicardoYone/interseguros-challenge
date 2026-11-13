import type { RequestHandler, Response } from 'express';
import { ProblemError } from '../../shared/http/problem.js';
import { InvalidTokenError } from '../domain/errors.js';
import type { TokenVerifier } from '../domain/ports.js';

const BEARER_PREFIX = 'Bearer ';

/** Rejects any request that does not carry a valid access token. */
export function createRequireAuth(tokenVerifier: TokenVerifier): RequestHandler {
  return async (request, response, next) => {
    const header = request.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw unauthorized(response);
    }

    try {
      await tokenVerifier.verify(header.slice(BEARER_PREFIX.length));
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw unauthorized(response);
      }
      throw error;
    }

    next();
  };
}

function unauthorized(response: Response): ProblemError {
  response.setHeader('WWW-Authenticate', 'Bearer');
  return new ProblemError(401, 'A valid access token is required.');
}
