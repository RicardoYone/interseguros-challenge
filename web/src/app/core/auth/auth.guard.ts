import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Sends anyone without a session to the login page. */
export const authGuard: CanActivateFn = () => {
  const isAuthenticated = inject(AuthService).isAuthenticated();

  return isAuthenticated || inject(Router).createUrlTree(['/login']);
};
