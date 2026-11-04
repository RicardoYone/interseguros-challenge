import type { z } from 'zod';
import { ProblemError } from './problem.js';

/** Enough to fix a request. Without a cap, a 4 MB body could produce a 100 MB error response. */
const MAX_REPORTED_ERRORS = 20;

/**
 * Validates a request body against its schema.
 *
 * @throws {ProblemError} a 422 listing the first invalid fields.
 */
export function parseBody<Schema extends z.ZodType>(schema: Schema, body: unknown): z.output<Schema> {
  const result = schema.safeParse(body);
  if (result.success) {
    return result.data;
  }

  throw new ProblemError(
    422,
    'The request body is invalid.',
    result.error.issues.slice(0, MAX_REPORTED_ERRORS).map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}
