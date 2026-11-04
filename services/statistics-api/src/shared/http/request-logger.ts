import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const REQUEST_ID_HEADER = 'X-Request-ID';

/** Only harmless characters: the id comes from the client and ends up in the logs. */
const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

/**
 * Logs each request and assigns the id that traces it across services.
 *
 * The serializers list fields explicitly because the defaults include every header,
 * which would write the bearer token to the logs.
 */
export function createRequestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId: (request, response) => {
      const incoming = request.headers['x-request-id'];
      const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
      response.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    autoLogging: { ignore: (request) => request.url === '/health' },
    customLogLevel: (_request, response, error) => {
      if (error !== undefined || response.statusCode >= 500) {
        return 'error';
      }
      return response.statusCode >= 400 ? 'warn' : 'info';
    },
    serializers: {
      req: (request: { id: string; method: string; url: string }) => ({
        id: request.id,
        method: request.method,
        url: request.url,
      }),
      res: (response: { statusCode: number }) => ({ statusCode: response.statusCode }),
    },
  });
}
