import { describe, expect, it } from 'vitest';
import { formatNumber, maxMagnitude, maxReconstructionError } from './matrix-math';

describe('maxMagnitude', () => {
  it('returns the largest absolute value', () => {
    expect(maxMagnitude([[1, -7], [3, 4]])).toBe(7);
  });

  it('handles the largest matrix the API accepts', () => {
    const row = new Array<number>(200).fill(2);

    expect(maxMagnitude(new Array<number[]>(200).fill(row))).toBe(2);
  });
});

describe('maxReconstructionError', () => {
  it('is zero when Q times R rebuilds the matrix exactly', () => {
    const error = maxReconstructionError(
      [[3], [4]],
      [[0.75], [1]],
      [[4]],
    );

    expect(error).toBe(0);
  });

  it('reports the largest difference between A and QR', () => {
    const error = maxReconstructionError(
      [[1, 2], [3, 4]],
      [[1, 0], [0, 1]],
      [[1, 2], [3, 3.5]],
    );

    expect(error).toBe(0.5);
  });

  it('works with rectangular factors', () => {
    const error = maxReconstructionError(
      [[1, 2, 3]],
      [[1]],
      [[1, 2, 3]],
    );

    expect(error).toBe(0);
  });
});

describe('formatNumber', () => {
  it.each([
    [5, '5'],
    [-2, '-2'],
    [0.6, '0.6'],
    [0.123456789, '0.1235'],
    [1234.56789, '1234.5679'],
    [0, '0'],
  ])('shows %d as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it.each([
    [1.5e-16, '0'],
    [-1.5e-16, '0'],
  ])('hides floating point noise: %d', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it.each([
    [1.5e12, '1.5e+12'],
    [2.5e-7, '2.5e-7'],
  ])('switches to scientific notation for extreme values: %d', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
});
