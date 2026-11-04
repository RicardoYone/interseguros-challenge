/** A named rectangular matrix. Its name only labels it in the result. */
export interface NamedMatrix {
  readonly name: string;
  readonly values: readonly (readonly number[])[];
}

export interface MatrixClassification {
  readonly name: string;
  readonly isDiagonal: boolean;
}

export interface MatrixStatistics {
  readonly max: number;
  readonly min: number;
  readonly average: number;
  readonly sum: number;
  readonly hasDiagonalMatrix: boolean;
  readonly matrices: readonly MatrixClassification[];
}

/**
 * Fraction of a matrix's largest value still treated as zero when classifying it as
 * diagonal. Matrices produced by floating point algorithms such as QR carry rounding
 * noise, and that noise grows with their scale, so neither an exact comparison with
 * zero nor a fixed threshold would classify them correctly.
 */
const RELATIVE_DIAGONAL_TOLERANCE = 1e-10;

/** The statistics cannot be represented as finite numbers, which JSON requires. */
export class NonFiniteStatisticsError extends Error {
  override readonly name = 'NonFiniteStatisticsError';

  constructor() {
    super('statistics are not finite numbers');
  }
}

/**
 * Calculates aggregates over every value of every matrix and classifies each matrix.
 *
 * Runs in a single O(N) pass. It deliberately avoids `Math.max(...values)`, which
 * exceeds the call stack on large matrices.
 *
 * @throws {NonFiniteStatisticsError} when the input is empty or the sum overflows.
 */
export function calculateStatistics(matrices: readonly NamedMatrix[]): MatrixStatistics {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  let sum = 0;
  let count = 0;

  for (const matrix of matrices) {
    for (const row of matrix.values) {
      for (const value of row) {
        max = Math.max(max, value);
        min = Math.min(min, value);
        sum += value;
        count += 1;
      }
    }
  }

  const average = sum / count;
  if (![max, min, sum, average].every((statistic) => Number.isFinite(statistic))) {
    throw new NonFiniteStatisticsError();
  }

  const classifications = matrices.map((matrix) => ({
    name: matrix.name,
    isDiagonal: isDiagonal(matrix.values),
  }));

  return {
    max,
    min,
    average,
    sum,
    hasDiagonalMatrix: classifications.some((matrix) => matrix.isDiagonal),
    matrices: classifications,
  };
}

/** A rectangular matrix is diagonal when every value outside its main diagonal is zero. */
function isDiagonal(values: NamedMatrix['values']): boolean {
  let largest = 0;
  for (const row of values) {
    for (const value of row) {
      largest = Math.max(largest, Math.abs(value));
    }
  }
  const tolerance = RELATIVE_DIAGONAL_TOLERANCE * largest;

  return values.every((row, rowIndex) =>
    row.every((value, columnIndex) => rowIndex === columnIndex || Math.abs(value) <= tolerance),
  );
}
