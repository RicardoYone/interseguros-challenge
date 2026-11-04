import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { RUNTIME_CONFIG } from '../config/runtime-config';
import { AuthService } from './auth.service';

const UNAUTHORIZED = 401;

/**
 * Attaches the token to requests for our own APIs, and ends the session when they reject it.
 * The trailing slash in the comparison is what stops the token from reaching a different
 * site whose name merely starts like one of the APIs.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const { qrApiUrl, statisticsApiUrl } = inject(RUNTIME_CONFIG);

  const isOwnApi = [qrApiUrl, statisticsApiUrl].some((baseUrl) =>
    request.url.startsWith(`${baseUrl}/`),
  );
  const token = auth.accessToken();
  const authorized =
    isOwnApi && token !== null
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      const isRejectedToken =
        error instanceof HttpErrorResponse &&
        error.status === UNAUTHORIZED &&
        request.url !== auth.loginUrl;

      if (isOwnApi && isRejectedToken) {
        auth.logout();
        void router.navigate(['/login']);
      }

      return throwError(() => error);
    }),
  );
};
