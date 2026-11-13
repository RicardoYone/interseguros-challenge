export type Matrix = readonly (readonly number[])[];

export type ParsedMatrix =
  | { readonly valid: true; readonly rows: Matrix }
  | { readonly valid: false; readonly message: string };

/** Same limit as the QR API: failing here saves a request that would be rejected. */
export const MAX_MATRIX_DIMENSION = 200;

const VALUE_SEPARATOR = /[\s,]+/;

/** Decimal notation only: `Number()` alone would also accept `0x10` and `Infinity`. */
const DECIMAL_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Reads a matrix written as one row per line, with values separated by spaces, tabs or commas. */
export function parseMatrix(text: string): ParsedMatrix {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (lines.length === 0) {
    return invalid('Escribe al menos un número.');
  }

  const rows: number[][] = [];
  for (const [index, line] of lines.entries()) {
    const row: number[] = [];
    for (const token of line.split(VALUE_SEPARATOR)) {
      // A comma at the start or end of a line leaves an empty value.
      if (token === '') {
        return invalid(`La fila ${index + 1} tiene un valor vacío. Revisa las comas.`);
      }
      const value = Number(token);
      if (!DECIMAL_NUMBER.test(token) || !Number.isFinite(value)) {
        return invalid(`El valor «${token}» de la fila ${index + 1} no es un número.`);
      }
      row.push(value);
    }
    rows.push(row);
  }

  const columnCount = rows[0].length;
  if (rows.length > MAX_MATRIX_DIMENSION || rows.some((row) => row.length > MAX_MATRIX_DIMENSION)) {
    return invalid(
      `La matriz no puede superar ${MAX_MATRIX_DIMENSION} filas ni ${MAX_MATRIX_DIMENSION} columnas.`,
    );
  }

  const unevenIndex = rows.findIndex((row) => row.length !== columnCount);
  if (unevenIndex !== -1) {
    return invalid(
      `La fila ${unevenIndex + 1} tiene ${rows[unevenIndex].length} valores, pero la fila 1 tiene ${columnCount}.`,
    );
  }

  return { valid: true, rows };
}

function invalid(message: string): ParsedMatrix {
  return { valid: false, message };
}
