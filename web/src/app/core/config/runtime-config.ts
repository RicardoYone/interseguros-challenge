import { InjectionToken } from '@angular/core';

/** Where the APIs live. It is read at startup, so one build runs in every environment. */
export interface RuntimeConfig {
  readonly statisticsApiUrl: string;
  readonly qrApiUrl: string;
}

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG');
