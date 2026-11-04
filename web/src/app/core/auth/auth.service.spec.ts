import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { RUNTIME_CONFIG } from '../config/runtime-config';
import { AuthService } from './auth.service';

const STATISTICS_API_URL = 'https://statistics.example';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RUNTIME_CONFIG,
          useValue: { statisticsApiUrl: STATISTICS_API_URL, qrApiUrl: 'https://qr.example' },
        },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('starts without a session', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
  });

  it('sends the credentials to the statistics API and keeps the token', () => {
    service.login({ username: 'demo', password: 'secret' }).subscribe();

    const request = http.expectOne(`${STATISTICS_API_URL}/api/v1/auth/token`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ username: 'demo', password: 'secret' });
    request.flush({ accessToken: 'token-1', expiresIn: 900 });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.accessToken()).toBe('token-1');
  });

  it('stays without a session when the login fails', () => {
    service.login({ username: 'demo', password: 'wrong' }).subscribe({ error: () => undefined });

    http
      .expectOne(`${STATISTICS_API_URL}/api/v1/auth/token`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(service.isAuthenticated()).toBe(false);
  });

  it('forgets the token on logout', () => {
    service.login({ username: 'demo', password: 'secret' }).subscribe();
    http
      .expectOne(`${STATISTICS_API_URL}/api/v1/auth/token`)
      .flush({ accessToken: 'token-1', expiresIn: 900 });

    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
  });

  it('never writes the token to browser storage', () => {
    service.login({ username: 'demo', password: 'secret' }).subscribe();
    http
      .expectOne(`${STATISTICS_API_URL}/api/v1/auth/token`)
      .flush({ accessToken: 'token-1', expiresIn: 900 });

    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('token-1');
  });
});
