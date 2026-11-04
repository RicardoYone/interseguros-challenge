import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_CONFIG } from '../config/runtime-config';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const QR_API_URL = 'https://qr.example';
const STATISTICS_API_URL = 'https://statistics.example';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.fn>;

  const signIn = (): void => {
    auth.login({ username: 'demo', password: 'secret' }).subscribe();
    http
      .expectOne(`${STATISTICS_API_URL}/api/v1/auth/token`)
      .flush({ accessToken: 'token-1', expiresIn: 900 });
  };

  beforeEach(() => {
    navigate = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
        {
          provide: RUNTIME_CONFIG,
          useValue: { statisticsApiUrl: STATISTICS_API_URL, qrApiUrl: QR_API_URL },
        },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  it.each([
    ['the QR API', `${QR_API_URL}/api/v1/qr-factorizations`],
    ['the statistics API', `${STATISTICS_API_URL}/api/v1/statistics`],
  ])('attaches the token to %s', (_description, url) => {
    signIn();

    client.post(url, {}).subscribe();

    expect(http.expectOne(url).request.headers.get('Authorization')).toBe('Bearer token-1');
  });

  it.each([
    ['another site', 'https://other.example/data'],
    ['a site whose name starts like the API', `${QR_API_URL}.evil.example/data`],
  ])('does not send the token to %s', (_description, url) => {
    signIn();

    client.get(url).subscribe();

    expect(http.expectOne(url).request.headers.has('Authorization')).toBe(false);
  });

  it('sends no authorization header without a session', () => {
    const url = `${QR_API_URL}/api/v1/qr-factorizations`;

    client.post(url, {}).subscribe();

    expect(http.expectOne(url).request.headers.has('Authorization')).toBe(false);
  });

  it('ends the session and goes to the login page when the token is rejected', () => {
    signIn();
    const url = `${QR_API_URL}/api/v1/qr-factorizations`;

    client.post(url, {}).subscribe({ error: () => undefined });
    http.expectOne(url).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('keeps the login page in place when the login itself is rejected', () => {
    auth.login({ username: 'demo', password: 'wrong' }).subscribe({ error: () => undefined });

    http
      .expectOne(`${STATISTICS_API_URL}/api/v1/auth/token`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the session on other errors', () => {
    signIn();
    const url = `${QR_API_URL}/api/v1/qr-factorizations`;

    client.post(url, {}).subscribe({ error: () => undefined });
    http.expectOne(url).flush({}, { status: 502, statusText: 'Bad Gateway' });

    expect(auth.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
