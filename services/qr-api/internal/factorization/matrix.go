// Package factorization is the domain of the service: matrices and their QR
// factorization. It knows nothing about HTTP, JSON or authentication.
package factorization

import (
	"errors"
	"math"
	"slices"
)

// MaxDimension bounds the rows and columns of a matrix. QR costs O(mn²), so this
// limit is what keeps one request from monopolizing a CPU.
const MaxDimension = 200

// Validation errors returned by NewMatrix.
var (
	ErrEmptyMatrix    = errors.New("matrix has no values")
	ErrJaggedMatrix   = errors.New("matrix rows have different lengths")
	ErrMatrixTooLarge = errors.New("matrix exceeds the maximum dimension")
	ErrNonFiniteValue = errors.New("matrix contains a value that is not a finite number")
)

// Matrix is a validated rectangular matrix. Its values live in one contiguous
// row-major slice, because walking neighboring memory is much faster than
// following a slice of slices.
type Matrix struct {
	rowCount    int
	columnCount int
	values      []float64
}

// NewMatrix copies rows into a Matrix, rejecting anything that is not a
// non-empty rectangle of finite numbers within MaxDimension.
func NewMatrix(rows [][]float64) (Matrix, error) {
	if len(rows) == 0 || len(rows[0]) == 0 {
		return Matrix{}, ErrEmptyMatrix
	}

	rowCount, columnCount := len(rows), len(rows[0])
	if rowCount > MaxDimension || columnCount > MaxDimension {
		return Matrix{}, ErrMatrixTooLarge
	}

	values := make([]float64, 0, rowCount*columnCount)
	for _, row := range rows {
		if len(row) != columnCount {
			return Matrix{}, ErrJaggedMatrix
		}
		for _, value := range row {
			if !isFinite(value) {
				return Matrix{}, ErrNonFiniteValue
			}
		}
		values = append(values, row...)
	}

	return Matrix{rowCount: rowCount, columnCount: columnCount, values: values}, nil
}

// ToRows returns the matrix as an independent slice of rows.
func (m Matrix) ToRows() [][]float64 {
	rows := make([][]float64, m.rowCount)
	for i := range rows {
		rows[i] = slices.Clone(m.row(i))
	}

	return rows
}

// row returns a view of row i: writing to it writes to the matrix.
func (m Matrix) row(i int) []float64 {
	return m.values[i*m.columnCount : (i+1)*m.columnCount]
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
