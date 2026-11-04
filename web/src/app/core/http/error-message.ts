import { HttpErrorResponse } from '@angular/common/http';

const MESSAGES: Readonly<Record<number, string>> = {
  0: 'No se pudo conectar con el servidor.',
  413: 'El servidor rechazó la matriz. Revisa sus valores y su tamaño.',
  422: 'El servidor rechazó la matriz. Revisa sus valores y su tamaño.',
  429: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  502: 'El servicio de estadísticas no está disponible.',
  504: 'El servicio de estadísticas tardó demasiado. Inténtalo de nuevo.',
};

const UNEXPECTED_MESSAGE = 'Ocurrió un error inesperado.';

/** Translates a failed request into a message for the user. `overrides` adapt it to a page. */
export function describeHttpError(
  error: unknown,
  overrides: Readonly<Record<number, string>> = {},
): string {
  if (!(error instanceof HttpErrorResponse)) {
    return UNEXPECTED_MESSAGE;
  }

  return overrides[error.status] ?? MESSAGES[error.status] ?? UNEXPECTED_MESSAGE;
}
