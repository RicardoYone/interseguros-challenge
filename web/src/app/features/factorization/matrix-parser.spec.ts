import { describe, expect, it } from 'vitest';
import { MAX_MATRIX_DIMENSION, parseMatrix } from './matrix-parser';

describe('parseMatrix', () => {
  it.each([
    ['spaces', '1 2\n3 4', [[1, 2], [3, 4]]],
    ['commas', '1,2\n3,4', [[1, 2], [3, 4]]],
    ['commas and spaces', '1, 2\n3, 4', [[1, 2], [3, 4]]],
    ['tabs pasted from a spreadsheet', '1\t2\n3\t4', [[1, 2], [3, 4]]],
    ['Windows line endings', '1 2\r\n3 4', [[1, 2], [3, 4]]],
    ['blank lines around the values', '\n1 2\n\n3 4\n', [[1, 2], [3, 4]]],
    ['negatives, decimals and exponents', '-1.5 2e3\n.5 +4', [[-1.5, 2000], [0.5, 4]]],
    ['a rectangular matrix', '1 2 3\n4 5 6', [[1, 2, 3], [4, 5, 6]]],
  ])('reads rows separated by %s', (_description, text, rows) => {
    expect(parseMatrix(text)).toEqual({ valid: true, rows });
  });

  it.each([
    ['empty text', '', 'Escribe al menos un número.'],
    ['only spaces', '  \n ', 'Escribe al menos un número.'],
    ['rows of different lengths', '1 2\n3', 'La fila 2 tiene 1 valores, pero la fila 1 tiene 2.'],
    ['a word', '1 2\n3 x', 'El valor «x» de la fila 2 no es un número.'],
    ['hexadecimal, which Number() would accept', '0x10', 'El valor «0x10» de la fila 1 no es un número.'],
    ['Infinity, which Number() would accept', 'Infinity', 'El valor «Infinity» de la fila 1 no es un número.'],
    ['a number out of range', '1e999', 'El valor «1e999» de la fila 1 no es un número.'],
    ['a trailing comma', '1 2,', 'La fila 1 tiene un valor vacío. Revisa las comas.'],
    ['a leading comma', '1 2\n,3 4', 'La fila 2 tiene un valor vacío. Revisa las comas.'],
  ])('rejects %s and says why', (_description, text, message) => {
    expect(parseMatrix(text)).toEqual({ valid: false, message });
  });

  it('accepts the largest allowed matrix', () => {
    const row = new Array<string>(MAX_MATRIX_DIMENSION).fill('1').join(' ');
    const text = new Array<string>(MAX_MATRIX_DIMENSION).fill(row).join('\n');

    expect(parseMatrix(text).valid).toBe(true);
  });

  it('rejects too many rows', () => {
    const text = new Array<string>(MAX_MATRIX_DIMENSION + 1).fill('1').join('\n');

    expect(parseMatrix(text)).toEqual({
      valid: false,
      message: `La matriz no puede superar ${MAX_MATRIX_DIMENSION} filas ni ${MAX_MATRIX_DIMENSION} columnas.`,
    });
  });

  it('rejects too many columns', () => {
    const text = new Array<string>(MAX_MATRIX_DIMENSION + 1).fill('1').join(' ');

    expect(parseMatrix(text).valid).toBe(false);
  });
});
