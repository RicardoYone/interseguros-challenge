import express, { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { ProblemError } from '../../shared/http/problem.js';
import { parseBody } from '../../shared/http/validation.js';
import { calculateStatistics, NonFiniteStatisticsError } from '../domain/statistics.js';

const matrixSchema = z.object({
  name: z.string().min(1).max(64),
  values: z
    .array(z.array(z.number()).min(1))
    .min(1)
    .refine((rows) => rows.every((row) => row.length === rows[0]?.length), {
      error: 'all rows must have the same length',
    }),
});

const statisticsRequestSchema = z.object({
  matrices: z.array(matrixSchema).min(1),
});

export interface StatisticsRouterOptions {
  readonly requireAuth: RequestHandler;
  readonly bodyLimit: string;
}

export function createStatisticsRouter({ requireAuth, bodyLimit }: StatisticsRouterOptions): Router {
  const router = Router();

  // The token is checked before the body is read, so that an anonymous client
  // cannot make the server parse large payloads.
  router.post('/', requireAuth, express.json({ limit: bodyLimit }), (request, response) => {
    const { matrices } = parseBody(statisticsRequestSchema, request.body);

    try {
      response.json(calculateStatistics(matrices));
    } catch (error) {
      if (error instanceof NonFiniteStatisticsError) {
        throw new ProblemError(422, 'The statistics exceed the range of representable numbers.');
      }
      throw error;
    }
  });

  return router;
}
