import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { parseRuntimeConfig, RUNTIME_CONFIG } from './app/core/config/runtime-config';

/** Reads the API addresses before starting, so that they are available from the first moment. */
async function start(): Promise<void> {
  // fetch and not HttpClient: Angular, and therefore HttpClient, does not exist yet.
  const response = await fetch('/config.json');
  if (!response.ok) {
    throw new Error(`config.json answered ${String(response.status)}`);
  }
  const config = parseRuntimeConfig(await response.json());

  await bootstrapApplication(App, {
    ...appConfig,
    providers: [...appConfig.providers, { provide: RUNTIME_CONFIG, useValue: config }],
  });
}

start().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = 'No se pudo iniciar la aplicación. Revisa su configuración.';
});
