import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { RUNTIME_CONFIG, type RuntimeConfig } from './app/core/config/runtime-config';

/** Reads the API addresses before starting, so that they are available from the first moment. */
async function start(): Promise<void> {
  const response = await fetch('/config.json');
  if (!response.ok) {
    throw new Error(`config.json answered ${String(response.status)}`);
  }
  const config = (await response.json()) as RuntimeConfig;

  await bootstrapApplication(App, {
    ...appConfig,
    providers: [...appConfig.providers, { provide: RUNTIME_CONFIG, useValue: config }],
  });
}

start().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = 'No se pudo iniciar la aplicación. Revisa su configuración.';
});
