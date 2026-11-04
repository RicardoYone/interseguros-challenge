import type { NextFunction, Request, Response } from 'express';
import { ProblemError } from './problem.js';

const INTERNAL_ERROR_DETAIL = 'An unexpected error occurred.';

/** Client-facing messages for the errors raised by Express's body parser. */
const BODY_PARSER_DETAILS: Readonly<Record<string, string>> = {
  'entity.parse.failed': 'The request body is not valid JSON.',
  'entity.too.large': 'The request body exceeds the allowed size.',
};

interface HttpLikeError {
  readonly status: number;
  readonly type?: string;
}

function isClientError(error: unknown): error is HttpLikeError {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return false;
  }
  return typeof error.status === 'number' && error.status >= 400 && error.status < 500;
}

function toProblem(error: unknown): ProblemError {
  if (error instanceof ProblemError) {
    return error;
  }
  if (isClientError(error)) {
    const detail = BODY_PARSER_DETAILS[error.type ?? ''] ?? 'The request could not be processed.';
    return new ProblemError(error.status, detail);
  }
  return new ProblemError(500, INTERNAL_ERROR_DETAIL);
}

export function notFoundHandler(_request: Request, _response: Response, next: NextFunction): void {
  next(new ProblemError(404, 'The requested resource does not exist.'));
}

/**
 * Translates every failure into a single problem document format.
 * Express identifies error middleware by its four parameters, so `_next` must stay.
 */
export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const problem = toProblem(error);

  if (problem.status >= 500) {
    request.log.error({ err: error }, 'request failed unexpectedly');
  }

  response
    .status(problem.status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: problem.title,
      status: problem.status,
      detail: problem.message,
      instance: request.path,
      ...(problem.errors === undefined ? {} : { errors: problem.errors }),
    });
}
