import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { describeHttpError } from '../../../core/http/error-message';
import type { FactorizationResult } from '../factorization.model';
import { FactorizationService } from '../factorization.service';
import { maxReconstructionError } from '../matrix-math';
import { type Matrix, parseMatrix } from '../matrix-parser';
import { MatrixView } from '../matrix-view/matrix-view';
import { StatisticsPanel } from '../statistics-panel/statistics-panel';

const EXAMPLES = [
  { id: 'tall', label: 'Alta 3×2', text: '1 2\n3 4\n5 6' },
  { id: 'square', label: 'Cuadrada 3×3', text: '12 -51 4\n6 167 -68\n-4 24 -41' },
  { id: 'wide', label: 'Ancha 2×3', text: '1 2 3\n4 5 6' },
  { id: 'diagonal', label: 'Diagonal 2×2', text: '3 0\n0 4' },
];

/** Largest rebuild error, relative to the input, still attributed to floating point rounding. */
const RECONSTRUCTION_TOLERANCE = 1e-9;

interface Calculation {
  readonly input: Matrix;
  readonly result: FactorizationResult;
}

/** Container of the main page: it holds the state and delegates the drawing to its children. */
@Component({
  selector: 'app-factorization-page',
  imports: [ReactiveFormsModule, MatrixView, StatisticsPanel],
  templateUrl: './factorization-page.html',
  styleUrl: './factorization-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FactorizationPage {
  private readonly factorization = inject(FactorizationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly examples = EXAMPLES;
  protected readonly form = this.fb.nonNullable.group({ matrix: [EXAMPLES[0].text] });

  private readonly matrixText = toSignal(this.form.controls.matrix.valueChanges, {
    initialValue: this.form.controls.matrix.value,
  });

  protected readonly parsed = computed(() => parseMatrix(this.matrixText()));
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly calculation = signal<Calculation | null>(null);

  protected readonly reconstruction = computed(() => {
    const calculation = this.calculation();
    if (calculation === null) {
      return null;
    }

    const { input, result } = calculation;
    const error = maxReconstructionError(input, result.q, result.r);
    const scale = Math.max(1, ...input.flat().map((value) => Math.abs(value)));

    return { rebuilds: error <= RECONSTRUCTION_TOLERANCE * scale, error: error.toExponential(1) };
  });

  private readonly solution = viewChild<ElementRef<HTMLElement>>('solution');

  constructor() {
    // On short screens the result appears below the fold, where a click would seem to do nothing.
    afterRenderEffect(() => {
      this.solution()?.nativeElement.scrollIntoView({ block: 'start' });
    });
  }

  protected useExample(text: string): void {
    this.form.controls.matrix.setValue(text);
  }

  protected submit(): void {
    const parsed = this.parsed();
    if (!parsed.valid || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.calculation.set(null);

    this.factorization
      .factorize(parsed.rows)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.calculation.set({ input: parsed.rows, result });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.errorMessage.set(describeHttpError(error));
          this.loading.set(false);
        },
      });
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
