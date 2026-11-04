import type { Matrix } from './matrix-parser';

/** Below this magnitude a value is floating point noise, not information for the reader. */
const NOISE_THRESHOLD = 1e-12;
const MAX_FIXED_MAGNITUDE = 1e9;
const MIN_FIXED_MAGNITUDE = 1e-3;
const FRACTION_DIGITS = 4;
const SIGNIFICANT_DIGITS = 5;

/** Returns the largest absolute value. A loop, because spreading every value could exceed the call stack. */
export function maxMagnitude(matrix: Matrix): number {
  let largest = 0;
  for (const row of matrix) {
    for (const value of row) {
      largest = Math.max(largest, Math.abs(value));
    }
  }

  return largest;
}

/**
 * Multiplies Q by R and returns the largest difference with A. It lets the page show,
 * from the values it received, that the factorization rebuilds the original matrix.
 */
export function maxReconstructionError(a: Matrix, q: Matrix, r: Matrix): number {
  let largest = 0;

  for (const [i, row] of a.entries()) {
    for (const [j, expected] of row.entries()) {
      let product = 0;
      for (const [k, factorRow] of r.entries()) {
        product += q[i][k] * factorRow[j];
      }
      largest = Math.max(largest, Math.abs(expected - product));
    }
  }

  return largest;
}

/** Formats a value for reading. The exact value stays available in the page's tooltip. */
export function formatNumber(value: number): string {
  const magnitude = Math.abs(value);

  if (magnitude < NOISE_THRESHOLD) {
    return '0';
  }
  if (magnitude >= MAX_FIXED_MAGNITUDE || magnitude < MIN_FIXED_MAGNITUDE) {
    return Number(value.toPrecision(SIGNIFICANT_DIGITS)).toExponential();
  }

  return String(Number(value.toFixed(FRACTION_DIGITS)));
}
