package factorization_test

import (
	"encoding/binary"
	"fmt"
	"math"
	"math/rand/v2"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gonum.org/v1/gonum/mat"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
)

// propertyTolerance bounds rounding error relative to the magnitude of the input.
const propertyTolerance = 1e-10

func mustMatrix(tb testing.TB, rows [][]float64) factorization.Matrix {
	tb.Helper()

	matrix, err := factorization.NewMatrix(rows)
	require.NoError(tb, err)

	return matrix
}

// maxAbs returns the largest magnitude in rows, floored at 1 so that it can scale a tolerance.
func maxAbs(rows [][]float64) float64 {
	largest := 1.0
	for _, row := range rows {
		for _, value := range row {
			largest = max(largest, math.Abs(value))
		}
	}

	return largest
}

// assertQRProperties checks what defines a reduced QR factorization, without
// relying on how it was computed.
func assertQRProperties(t *testing.T, input [][]float64, q, r [][]float64) {
	t.Helper()

	rowCount, columnCount := len(input), len(input[0])
	rank := min(rowCount, columnCount)

	require.Len(t, q, rowCount, "Q must have one row per input row")
	require.Len(t, q[0], rank, "Q must have min(m, n) columns")
	require.Len(t, r, rank, "R must have min(m, n) rows")
	require.Len(t, r[0], columnCount, "R must have one column per input column")

	scale := maxAbs(input)
	for i := range rowCount {
		for j := range columnCount {
			product := 0.0
			for k := range rank {
				product += q[i][k] * r[k][j]
			}
			require.InDelta(t, input[i][j], product, propertyTolerance*scale, "A != QR at (%d, %d)", i, j)
		}
	}

	for a := range rank {
		for b := range rank {
			product := 0.0
			for i := range rowCount {
				product += q[i][a] * q[i][b]
			}
			want := 0.0
			if a == b {
				want = 1
			}
			require.InDelta(t, want, product, propertyTolerance, "Q'Q != I at (%d, %d)", a, b)
		}
	}

	for i := range rank {
		require.GreaterOrEqual(t, r[i][i], 0.0, "the diagonal of R must not be negative")
		for j := range i {
			require.Zero(t, r[i][j], "R must be exactly zero below its diagonal")
		}
	}

	for _, matrix := range [][][]float64{q, r} {
		for _, row := range matrix {
			for _, value := range row {
				require.False(t, value == 0 && math.Signbit(value), "the result must not contain negative zero")
			}
		}
	}
}

func TestDecompose_handDerivedResults(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input [][]float64
		wantQ [][]float64
		wantR [][]float64
	}{
		{
			name:  "3-4-5 triangle in a column",
			input: [][]float64{{3}, {4}},
			wantQ: [][]float64{{0.6}, {0.8}},
			wantR: [][]float64{{5}},
		},
		{
			name:  "identity needs no rotation",
			input: [][]float64{{1, 0}, {0, 1}},
			wantQ: [][]float64{{1, 0}, {0, 1}},
			wantR: [][]float64{{1, 0}, {0, 1}},
		},
		{
			name:  "swapped rows",
			input: [][]float64{{0, 1}, {1, 0}},
			wantQ: [][]float64{{0, 1}, {1, 0}},
			wantR: [][]float64{{1, 0}, {0, 1}},
		},
		{
			name:  "negative single value moves its sign to Q",
			input: [][]float64{{-2}},
			wantQ: [][]float64{{-1}},
			wantR: [][]float64{{2}},
		},
		{
			name:  "single row is already triangular",
			input: [][]float64{{3, 4, 5}},
			wantQ: [][]float64{{1}},
			wantR: [][]float64{{3, 4, 5}},
		},
		{
			name:  "zero matrix",
			input: [][]float64{{0, 0}, {0, 0}, {0, 0}},
			wantQ: [][]float64{{1, 0}, {0, 1}, {0, 0}},
			wantR: [][]float64{{0, 0}, {0, 0}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			qr, err := factorization.Decompose(mustMatrix(t, tt.input))

			require.NoError(t, err)
			assert.InDeltaMapValues(t, flatten(tt.wantQ), flatten(qr.Q.ToRows()), 1e-12)
			assert.InDeltaMapValues(t, flatten(tt.wantR), flatten(qr.R.ToRows()), 1e-12)
			assertQRProperties(t, tt.input, qr.Q.ToRows(), qr.R.ToRows())
		})
	}
}

// The last column of Q is not unique for a rank-deficient matrix: rounding noise in
// the near-zero diagonal of R decides its sign. So only R and the properties are pinned.
func TestDecompose_rankDeficient(t *testing.T) {
	t.Parallel()

	input := [][]float64{{3, 6}, {4, 8}}

	qr, err := factorization.Decompose(mustMatrix(t, input))

	require.NoError(t, err)
	assert.InDeltaMapValues(t, flatten([][]float64{{5, 10}, {0, 0}}), flatten(qr.R.ToRows()), 1e-12)
	assertQRProperties(t, input, qr.Q.ToRows(), qr.R.ToRows())
}

// flatten indexes values by position, the shape testify's delta comparison expects.
func flatten(rows [][]float64) map[string]float64 {
	values := make(map[string]float64)
	for i, row := range rows {
		for j, value := range row {
			values[fmt.Sprintf("%d,%d", i, j)] = value
		}
	}

	return values
}

func TestDecompose_properties(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input [][]float64
	}{
		{name: "square", input: [][]float64{{12, -51, 4}, {6, 167, -68}, {-4, 24, -41}}},
		{name: "tall", input: [][]float64{{1, 2}, {3, 4}, {5, 6}}},
		{name: "wide", input: [][]float64{{1, 2, 3}, {4, 5, 6}}},
		{name: "single column", input: [][]float64{{1}, {2}, {3}}},
		{name: "already diagonal with negatives", input: [][]float64{{-1, 0}, {0, -2}}},
		{name: "large values that would overflow a naive square root", input: [][]float64{{1e200, 1e200}, {1e200, -1e200}}},
		{name: "tiny values that would underflow a naive square root", input: [][]float64{{1e-200, 2e-200}, {3e-200, 4e-200}}},
		{name: "mixed scales", input: [][]float64{{1e12, 1}, {1, 1e-12}}},
		{name: "subnormal values that lose precision when divided", input: [][]float64{{1e-320, 2e-320}, {3e-320, 5e-320}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			qr, err := factorization.Decompose(mustMatrix(t, tt.input))

			require.NoError(t, err)
			assertQRProperties(t, tt.input, qr.Q.ToRows(), qr.R.ToRows())
		})
	}
}

func TestDecompose_doesNotModifyItsInput(t *testing.T) {
	t.Parallel()

	input := mustMatrix(t, [][]float64{{1, 2}, {3, 4}})

	_, err := factorization.Decompose(input)

	require.NoError(t, err)
	assert.Equal(t, [][]float64{{1, 2}, {3, 4}}, input.ToRows())
}

func TestDecompose_reportsOverflow(t *testing.T) {
	t.Parallel()

	input := mustMatrix(t, [][]float64{{1.7e308, 1.7e308}, {1.7e308, 1.7e308}})

	_, err := factorization.Decompose(input)

	require.ErrorIs(t, err, factorization.ErrNumericOverflow)
}

// A full-rank matrix has a unique QR up to the signs of R's diagonal, so an
// independent implementation must produce the same magnitudes.
func TestDecompose_agreesWithGonum(t *testing.T) {
	t.Parallel()

	random := rand.New(rand.NewPCG(1, 2))
	// Gonum only factorizes matrices with at least as many rows as columns.
	for _, shape := range [][2]int{{2, 2}, {5, 3}, {20, 20}, {50, 10}} {
		// Generated here because rand.Rand is not safe for use by parallel subtests.
		rows := randomRows(random, shape[0], shape[1])

		t.Run(fmt.Sprintf("%dx%d", shape[0], shape[1]), func(t *testing.T) {
			t.Parallel()

			qr, err := factorization.Decompose(mustMatrix(t, rows))
			require.NoError(t, err)

			var oracle mat.QR
			oracle.Factorize(denseFrom(rows))
			var oracleR mat.Dense
			oracle.RTo(&oracleR)

			got := qr.R.ToRows()
			for i := range min(shape[0], shape[1]) {
				sign := math.Copysign(1, oracleR.At(i, i))
				for j := i; j < shape[1]; j++ {
					assert.InDelta(t, sign*oracleR.At(i, j), got[i][j], 1e-9, "R differs at (%d, %d)", i, j)
				}
			}
		})
	}
}

func randomRows(random *rand.Rand, rowCount, columnCount int) [][]float64 {
	rows := make([][]float64, rowCount)
	for i := range rows {
		rows[i] = make([]float64, columnCount)
		for j := range rows[i] {
			rows[i][j] = random.NormFloat64()
		}
	}

	return rows
}

func denseFrom(rows [][]float64) *mat.Dense {
	dense := mat.NewDense(len(rows), len(rows[0]), nil)
	for i, row := range rows {
		dense.SetRow(i, row)
	}

	return dense
}

func FuzzDecompose(f *testing.F) {
	const maxFuzzDimension = 12
	const maxFuzzMagnitude = 1e100

	f.Add(uint8(2), uint8(2), []byte{1, 2, 3, 4, 5, 6, 7, 8})
	f.Add(uint8(3), uint8(1), []byte{0})
	f.Add(uint8(1), uint8(4), []byte{255, 240, 0, 0, 0, 0, 0, 0})

	f.Fuzz(func(t *testing.T, rowSeed, columnSeed uint8, data []byte) {
		rowCount := int(rowSeed)%maxFuzzDimension + 1
		columnCount := int(columnSeed)%maxFuzzDimension + 1

		rows := make([][]float64, rowCount)
		offset := 0
		for i := range rows {
			rows[i] = make([]float64, columnCount)
			for j := range rows[i] {
				if offset+8 > len(data) {
					continue
				}
				value := math.Float64frombits(binary.LittleEndian.Uint64(data[offset:]))
				offset += 8
				if !math.IsNaN(value) && math.Abs(value) <= maxFuzzMagnitude {
					rows[i][j] = value
				}
			}
		}

		qr, err := factorization.Decompose(mustMatrix(t, rows))

		require.NoError(t, err)
		assertQRProperties(t, rows, qr.Q.ToRows(), qr.R.ToRows())
	})
}

func BenchmarkDecompose(b *testing.B) {
	random := rand.New(rand.NewPCG(1, 2))
	for _, shape := range [][2]int{{10, 10}, {100, 100}, {200, 200}, {200, 20}} {
		rows := randomRows(random, shape[0], shape[1])
		matrix := mustMatrix(b, rows)
		dense := denseFrom(rows)

		b.Run(fmt.Sprintf("givens/%dx%d", shape[0], shape[1]), func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				if _, err := factorization.Decompose(matrix); err != nil {
					b.Fatal(err)
				}
			}
		})

		b.Run(fmt.Sprintf("householder_gonum/%dx%d", shape[0], shape[1]), func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				var factorized mat.QR
				var q, r mat.Dense
				factorized.Factorize(dense)
				factorized.QTo(&q)
				factorized.RTo(&r)
			}
		})
	}
}
