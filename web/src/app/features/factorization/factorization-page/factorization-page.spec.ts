import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { RUNTIME_CONFIG } from '../../../core/config/runtime-config';
import { FactorizationPage } from './factorization-page';

const FACTORIZATIONS_URL = 'https://qr.example/api/v1/qr-factorizations';

const RESPONSE = {
  q: [[0.6], [0.8]],
  r: [[5]],
  statistics: {
    max: 5,
    min: 0.6,
    average: 2.1333333333,
    sum: 6.4,
    hasDiagonalMatrix: true,
    matrices: [
      { name: 'Q', isDiagonal: false },
      { name: 'R', isDiagonal: true },
    ],
  },
};

describe('FactorizationPage', () => {
  let fixture: ComponentFixture<FactorizationPage>;
  let http: HttpTestingController;
  let page: HTMLElement;

  const typeMatrix = async (text: string): Promise<void> => {
    const textarea = page.querySelector<HTMLTextAreaElement>('#matrix');
    if (textarea === null) {
      throw new Error('missing matrix field');
    }
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
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

  const alertText = (): string | undefined => page.querySelector('[role="alert"]')?.textContent;

  beforeEach(async () => {
    // jsdom does not implement scrolling.
    Element.prototype.scrollIntoView = vi.fn();
    TestBed.configureTestingModule({
      imports: [FactorizationPage],
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
    fixture = TestBed.createComponent(FactorizationPage);
    http = TestBed.inject(HttpTestingController);
    page = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('sends the typed matrix to the QR API', async () => {
    await typeMatrix('3\n4');

    await submit();

    expect(http.expectOne(FACTORIZATIONS_URL).request.body).toEqual({ matrix: [[3], [4]] });
  });

  it('shows the equation with A, Q and R', async () => {
    await typeMatrix('3\n4');
    await submit();

    http.expectOne(FACTORIZATIONS_URL).flush(RESPONSE);
    await fixture.whenStable();

    const values = [...page.querySelectorAll('app-matrix-view')].map((matrix) =>
      [...matrix.querySelectorAll('td')].map((cell) => cell.textContent.trim()),
    );
    expect(values).toEqual([['3', '4'], ['0.6', '0.8'], ['5']]);
  });

  it('brings the result into view, since it may appear below the fold', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await typeMatrix('3\n4');
    await submit();
    expect(scrollIntoView).not.toHaveBeenCalled();

    http.expectOne(FACTORIZATIONS_URL).flush(RESPONSE);
    await fixture.whenStable();

    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(page.querySelector('.solution'));
  });

  it('shows the statistics returned by the API', async () => {
    await typeMatrix('3\n4');
    await submit();

    http.expectOne(FACTORIZATIONS_URL).flush(RESPONSE);
    await fixture.whenStable();

    const statistics = page.querySelector('app-statistics-panel')?.textContent;
    expect(statistics).toContain('5');
    expect(statistics).toContain('0.6');
    expect(statistics).toContain('2.1333');
    expect(statistics).toContain('6.4');
    expect(statistics).toContain('Sí');
    expect(statistics).toContain('R');
  });

  it('confirms that the result rebuilds the matrix', async () => {
    await typeMatrix('3\n4');
    await submit();

    http.expectOne(FACTORIZATIONS_URL).flush(RESPONSE);
    await fixture.whenStable();

    expect(page.textContent).toContain('Q · R reconstruye A');
  });

  it('warns when the result does not rebuild the matrix', async () => {
    await typeMatrix('3\n4');
    await submit();

    http.expectOne(FACTORIZATIONS_URL).flush({ ...RESPONSE, r: [[7]] });
    await fixture.whenStable();

    expect(page.textContent).toContain('Q · R no reconstruye A');
  });

  it('explains an invalid matrix and does not allow submitting it', async () => {
    await typeMatrix('1 2\n3');

    expect(alertText()).toContain('La fila 2 tiene 1 valores, pero la fila 1 tiene 2.');
    expect(submitButton().disabled).toBe(true);

    await submit();
    http.expectNone(FACTORIZATIONS_URL);
  });

  it('fills the field with an example', async () => {
    await typeMatrix('not a matrix');

    page.querySelector<HTMLButtonElement>('[data-example="tall"]')?.click();
    await fixture.whenStable();

    expect(page.querySelector<HTMLTextAreaElement>('#matrix')?.value).toBe('1 2\n3 4\n5 6');
    expect(submitButton().disabled).toBe(false);
  });

  it('disables the button while the request is in flight', async () => {
    await typeMatrix('3\n4');

    await submit();

    expect(submitButton().disabled).toBe(true);
    http.expectOne(FACTORIZATIONS_URL).flush(RESPONSE);
    await fixture.whenStable();
    expect(submitButton().disabled).toBe(false);
  });

  it.each([
    [422, 'Unprocessable Entity', 'El servidor rechazó la matriz'],
    [502, 'Bad Gateway', 'El servicio de estadísticas no está disponible.'],
    [504, 'Gateway Timeout', 'El servicio de estadísticas tardó demasiado.'],
    [0, 'Unknown Error', 'No se pudo conectar con el servidor.'],
    [500, 'Internal Server Error', 'Ocurrió un error inesperado.'],
  ])('explains a %i response', async (status, statusText, message) => {
    await typeMatrix('3\n4');
    await submit();

    http.expectOne(FACTORIZATIONS_URL).flush({}, { status, statusText });
    await fixture.whenStable();

    expect(alertText()).toContain(message);
    expect(submitButton().disabled).toBe(false);
  });

  it('removes the previous result when a new request fails', async () => {
    await typeMatrix('3\n4');
    await submit();
    http.expectOne(FACTORIZATIONS_URL).flush(RESPONSE);
    await fixture.whenStable();

    await submit();
    http
      .expectOne(FACTORIZATIONS_URL)
      .flush({}, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();

    expect(page.querySelector('app-matrix-view')).toBeNull();
  });

  it('signs out and returns to the login page', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const logout = vi.spyOn(TestBed.inject(AuthService), 'logout');

    page.querySelector<HTMLButtonElement>('[data-action="logout"]')?.click();
    await fixture.whenStable();

    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
