import { describe, expect, it } from 'vitest';
import { calculateStatistics, NonFiniteStatisticsError } from './statistics.js';

describe('calculateStatistics', () => {
  it('aggregates max, min, average and sum over one matrix', () => {
    const result = calculateStatistics([
      {
        name: 'A',
        values: [
          [1, 2],
          [3, 4],
        ],
      },
    ]);

    expect(result).toMatchObject({ max: 4, min: 1, sum: 10, average: 2.5 });
  });

  it('aggregates across every matrix, weighting each value equally', () => {
    const result = calculateStatistics([
      { name: 'Q', values: [[-5, 1]] },
      { name: 'R', values: [[9]] },
    ]);

    expect(result).toMatchObject({ max: 9, min: -5, sum: 5 });
    expect(result.average).toBeCloseTo(5 / 3, 12);
  });

  it('reports which matrices are diagonal and whether any of them is', () => {
    const result = calculateStatistics([
      {
        name: 'dense',
        values: [
          [1, 2],
          [3, 4],
        ],
      },
      {
        name: 'diagonal',
        values: [
          [1, 0],
          [0, 4],
        ],
      },
    ]);

    expect(result.hasDiagonalMatrix).toBe(true);
    expect(result.matrices).toEqual([
      { name: 'dense', isDiagonal: false },
      { name: 'diagonal', isDiagonal: true },
    ]);
  });

  it('reports no diagonal matrix when none qualifies', () => {
    const result = calculateStatistics([{ name: 'dense', values: [[1, 2]] }]);

    expect(result.hasDiagonalMatrix).toBe(false);
  });

  it.each([
    ['a single value', [[7]], true],
    ['all zeros', [[0, 0], [0, 0]], true],
    ['a tall rectangle', [[1, 0], [0, 2], [0, 0]], true],
    ['a wide rectangle', [[1, 0, 0], [0, 2, 0]], true],
    ['a value above the diagonal', [[1, 5], [0, 1]], false],
    ['a value below the diagonal', [[1, 0], [5, 1]], false],
    ['a negative off-diagonal value', [[1, -5], [0, 1]], false],
    ['a value in a tall extra row', [[1, 0], [0, 2], [3, 0]], false],
    ['floating point noise below tolerance', [[1, 1e-12], [-1e-12, 1]], true],
    ['a value above tolerance', [[1, 1e-9], [0, 1]], false],
  ])('classifies %s', (_description, values, expected) => {
    const result = calculateStatistics([{ name: 'A', values }]);

    expect(result.matrices[0]?.isDiagonal).toBe(expected);
  });

  it('handles more values than the call stack allows as spread arguments', () => {
    const row = new Array<number>(1000).fill(1);
    const values = new Array<number[]>(1000).fill(row);

    const result = calculateStatistics([{ name: 'large', values }]);

    expect(result).toMatchObject({ max: 1, min: 1, sum: 1_000_000, average: 1 });
  });

  it('rejects results that JSON could not represent', () => {
    const overflowing = [{ name: 'A', values: [[1.7e308, 1.7e308]] }];

    expect(() => calculateStatistics(overflowing)).toThrow(NonFiniteStatisticsError);
  });

  it('rejects an empty input instead of inventing statistics', () => {
    expect(() => calculateStatistics([])).toThrow(NonFiniteStatisticsError);
  });
});
