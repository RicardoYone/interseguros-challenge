import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from './error-handler.js';

describe('errorHandler', () => {
  it('leaves a response that already started to Express, which closes the connection', () => {
    const failure = new Error('failed while streaming');
    const next: NextFunction = vi.fn();
    const setHeader = vi.fn();
    const request = { log: { error: vi.fn() } } as unknown as Request;
    const response = { headersSent: true, setHeader } as unknown as Response;

    errorHandler(failure, request, response, next);

    expect(next).toHaveBeenCalledWith(failure);
    expect(setHeader).not.toHaveBeenCalled();
  });
});
