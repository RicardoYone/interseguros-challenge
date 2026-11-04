import { STATUS_CODES } from 'node:http';

export interface ProblemFieldError {
  readonly path: string;
  readonly message: string;
}

/** An error that maps directly to an RFC 9457 problem document. */
export class ProblemError extends Error {
  override readonly name = 'ProblemError';
  readonly status: number;
  readonly title: string;
  readonly errors: readonly ProblemFieldError[] | undefined;

  /** @param detail A message that is safe to show to the client. */
  constructor(status: number, detail: string, errors?: readonly ProblemFieldError[]) {
    super(detail);
    this.status = status;
    this.title = STATUS_CODES[status] ?? 'Error';
    this.errors = errors;
  }
}
