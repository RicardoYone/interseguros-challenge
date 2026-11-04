package factorization

import (
	"errors"
	"math"
	"slices"
)

// ErrNumericOverflow means the factorization exceeds the range of float64.
var ErrNumericOverflow = errors.New("factorization exceeds the range of representable numbers")

// QR holds a reduced QR factorization of an m×n matrix A, with k = min(m, n):
// Q is m×k with orthonormal columns, R is k×n and upper triangular, and A = QR.
type QR struct {
	Q Matrix
	R Matrix
}

// rotation is a Givens rotation acting on two rows: it mixes them so that one
// element of targetRow becomes zero.
type rotation struct {
	pivotRow  int
	targetRow int
	cosine    float64
	sine      float64
}

// Decompose computes the reduced QR factorization of a using Givens rotations.
// It costs O(mn²) time and does not modify a.
//
// The diagonal of R is non-negative, which makes the result deterministic. It
// returns ErrNumericOverflow when a value of Q or R is not representable.
func Decompose(a Matrix) (QR, error) {
	rank := min(a.rowCount, a.columnCount)

	triangular, rotations := triangularize(a)
	q := accumulateQ(rotations, a.rowCount, rank)
	r := Matrix{rowCount: rank, columnCount: a.columnCount, values: triangular.values[:rank*a.columnCount]}

	moveNegativeDiagonalToQ(q, r)

	if err := canonicalize(q); err != nil {
		return QR{}, err
	}
	if err := canonicalize(r); err != nil {
		return QR{}, err
	}

	return QR{Q: q, R: r}, nil
}

// triangularize zeroes every element below the diagonal, one rotation at a time,
// and returns the result along with the rotations that produced it.
func triangularize(a Matrix) (Matrix, []rotation) {
	work := Matrix{rowCount: a.rowCount, columnCount: a.columnCount, values: slices.Clone(a.values)}
	rotations := make([]rotation, 0, a.rowCount*min(a.rowCount, a.columnCount))

	for column := range min(a.rowCount, a.columnCount) {
		pivot := work.row(column)
		for targetRow := column + 1; targetRow < a.rowCount; targetRow++ {
			target := work.row(targetRow)
			if target[column] == 0 {
				continue
			}

			cosine, sine, radius := givens(pivot[column], target[column])

			pivot[column], target[column] = radius, 0
			rotateRows(pivot[column+1:], target[column+1:], cosine, sine)

			rotations = append(rotations, rotation{
				pivotRow:  column,
				targetRow: targetRow,
				cosine:    cosine,
				sine:      sine,
			})
		}
	}

	return work, rotations
}

// givens returns the rotation [c s; -s c] that maps (x, y) to (radius, 0). y must
// not be zero.
//
// Scaling first keeps c² + s² = 1 for subnormal inputs, where dividing directly by
// the hypotenuse loses precision and the result stops being a rotation. Hypot avoids
// the overflow and underflow of computing sqrt(x² + y²) directly.
func givens(x, y float64) (cosine, sine, radius float64) {
	scale := max(math.Abs(x), math.Abs(y))
	x, y = x/scale, y/scale
	norm := math.Hypot(x, y)

	return x / norm, y / norm, scale * norm
}

// accumulateQ multiplies the transposed rotations onto the first k columns of the
// identity. Going in reverse means each rotation touches only those k columns, so
// this costs O(mk²), whereas forming the full m×m Q first would cost O(m²k).
func accumulateQ(rotations []rotation, rowCount, rank int) Matrix {
	q := Matrix{rowCount: rowCount, columnCount: rank, values: make([]float64, rowCount*rank)}
	for i := range rank {
		q.row(i)[i] = 1
	}

	for _, r := range slices.Backward(rotations) {
		// Inverting a rotation is the same as flipping the sign of its sine.
		rotateRows(q.row(r.pivotRow), q.row(r.targetRow), r.cosine, -r.sine)
	}

	return q
}

// rotateRows applies the plane rotation [c s; -s c] to two equally long rows.
func rotateRows(first, second []float64, cosine, sine float64) {
	for i, x := range first {
		y := second[i]
		first[i] = cosine*x + sine*y
		second[i] = cosine*y - sine*x
	}
}

// moveNegativeDiagonalToQ flips the sign of each row of R with a negative diagonal
// and of the matching column of Q. The product QR does not change.
func moveNegativeDiagonalToQ(q, r Matrix) {
	for i := range r.rowCount {
		if r.row(i)[i] >= 0 {
			continue
		}

		for j := range r.row(i) {
			r.row(i)[j] = -r.row(i)[j]
		}
		for row := range q.rowCount {
			q.row(row)[i] = -q.row(row)[i]
		}
	}
}

// canonicalize rejects values that are not finite and turns negative zero into
// zero, so that the result never serializes as "-0".
func canonicalize(m Matrix) error {
	for i, value := range m.values {
		if !isFinite(value) {
			return ErrNumericOverflow
		}
		if value == 0 {
			m.values[i] = 0
		}
	}

	return nil
}
