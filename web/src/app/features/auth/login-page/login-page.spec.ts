import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_CONFIG } from '../../../core/config/runtime-config';
import { AuthService } from '../../../core/auth/auth.service';
import { LoginPage } from './login-page';

const TOKEN_URL = 'https://statistics.example/api/v1/auth/token';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;
  let page: HTMLElement;

  const fill = (selector: string, value: string): void => {
    const input = page.querySelector<HTMLInputElement>(selector);
    if (input === null) {
      throw new Error(`missing ${selector}`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const submit = async (): Promise<void> => {
    page.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };

  const submitButton = (): HTMLButtonElement => {
    const button = page.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button === null) {
      throw new Error('missing submit button');
    }
    return button;
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RUNTIME_CONFIG,
          useValue: { statisticsApiUrl: 'https://statistics.example', qrApiUrl: 'https://qr.example' },
        },
      ],
    });
    fixture = TestBed.createComponent(LoginPage);
    http = TestBed.inject(HttpTestingController);
    page = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('does not contact the server with an incomplete form', async () => {
    fill('#username', 'demo');

    await submit();

    http.expectNone(TOKEN_URL);
  });

  it('signs in with the typed credentials and opens the main page', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill('#username', 'demo');
    fill('#password', 'secret');

    await submit();
    const request = http.expectOne(TOKEN_URL);
    expect(request.request.body).toEqual({ username: 'demo', password: 'secret' });
    request.flush({ accessToken: 'token-1', expiresIn: 900 });
    await fixture.whenStable();

    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('disables the button while the request is in flight', async () => {
    fill('#username', 'demo');
    fill('#password', 'secret');

    await submit();

    expect(submitButton().disabled).toBe(true);
    http.expectOne(TOKEN_URL).flush({ accessToken: 'token-1', expiresIn: 900 });
  });

  it.each([
    [401, 'Unauthorized', 'Usuario o contraseña incorrectos.'],
    [429, 'Too Many Requests', 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'],
    [0, 'Unknown Error', 'No se pudo conectar con el servidor.'],
  ])('explains a %i response and lets the user retry', async (status, statusText, message) => {
    fill('#username', 'demo');
    fill('#password', 'wrong');

    await submit();
    http.expectOne(TOKEN_URL).flush({}, { status, statusText });
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(submitButton().disabled).toBe(false);
  });
});
