import type { Matrix } from './matrix-parser';

export interface MatrixClassification {
  readonly name: string;
  readonly isDiagonal: boolean;
}

export interface Statistics {
  readonly max: number;
  readonly min: number;
  readonly average: number;
  readonly sum: number;
  readonly hasDiagonalMatrix: boolean;
  readonly matrices: readonly MatrixClassification[];
}

export interface FactorizationResult {
  readonly q: Matrix;
  readonly r: Matrix;
  readonly statistics: Statistics;
}
