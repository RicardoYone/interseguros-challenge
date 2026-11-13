import { InjectionToken } from '@angular/core';

/** Where the APIs live. It is read at startup, so one build runs in every environment. */
export interface RuntimeConfig {
  readonly statisticsApiUrl: string;
  readonly qrApiUrl: string;
}

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG');

/** Checks config.json, so that a typo fails at startup instead of on the first request. */
export function parseRuntimeConfig(value: unknown): RuntimeConfig {
  const statisticsApiUrl = readText(value, 'statisticsApiUrl');
  const qrApiUrl = readText(value, 'qrApiUrl');
  if (statisticsApiUrl === undefined || qrApiUrl === undefined) {
    throw new Error('config.json must define statisticsApiUrl and qrApiUrl');
  }

  return { statisticsApiUrl, qrApiUrl };
}

function readText(value: unknown, key: keyof RuntimeConfig): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const field: unknown = Reflect.get(value, key);

  return typeof field === 'string' && field !== '' ? field : undefined;
}
