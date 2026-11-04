import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';

function runGuard(isAuthenticated: boolean): unknown {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { isAuthenticated: signal(isAuthenticated) } },
    ],
  });

  return TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
}

describe('authGuard', () => {
  it('lets a signed-in user through', () => {
    expect(runGuard(true)).toBe(true);
  });

  it('sends everyone else to the login page', () => {
    const result = runGuard(false);

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });
});
