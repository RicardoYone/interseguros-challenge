package factorization_test

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
)

func TestNewMatrix(t *testing.T) {
	t.Parallel()

	t.Run("keeps the values and the shape", func(t *testing.T) {
		t.Parallel()

		matrix, err := factorization.NewMatrix([][]float64{{1, 2, 3}, {4, 5, 6}})

		require.NoError(t, err)
		assert.Equal(t, [][]float64{{1, 2, 3}, {4, 5, 6}}, matrix.ToRows())
	})

	t.Run("does not alias the caller's data", func(t *testing.T) {
		t.Parallel()

		rows := [][]float64{{1, 2}}
		matrix, err := factorization.NewMatrix(rows)
		require.NoError(t, err)

		rows[0][0] = 99

		assert.Equal(t, [][]float64{{1, 2}}, matrix.ToRows())
	})

	tooManyRows := make([][]float64, factorization.MaxDimension+1)
	for i := range tooManyRows {
		tooManyRows[i] = []float64{1}
	}

	rejections := []struct {
		name string
		rows [][]float64
		want error
	}{
		{name: "nil matrix", rows: nil, want: factorization.ErrEmptyMatrix},
		{name: "no rows", rows: [][]float64{}, want: factorization.ErrEmptyMatrix},
		{name: "empty row", rows: [][]float64{{}}, want: factorization.ErrEmptyMatrix},
		{name: "rows of different lengths", rows: [][]float64{{1, 2}, {3}}, want: factorization.ErrJaggedMatrix},
		{name: "too many rows", rows: tooManyRows, want: factorization.ErrMatrixTooLarge},
		{
			name: "too many columns",
			rows: [][]float64{make([]float64, factorization.MaxDimension+1)},
			want: factorization.ErrMatrixTooLarge,
		},
		{name: "not a number", rows: [][]float64{{math.NaN()}}, want: factorization.ErrNonFiniteValue},
		{name: "infinity", rows: [][]float64{{math.Inf(-1)}}, want: factorization.ErrNonFiniteValue},
	}
	for _, tt := range rejections {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := factorization.NewMatrix(tt.rows)

			require.ErrorIs(t, err, tt.want)
		})
	}

	t.Run("accepts the largest allowed matrix", func(t *testing.T) {
		t.Parallel()

		rows := make([][]float64, factorization.MaxDimension)
		for i := range rows {
			rows[i] = make([]float64, factorization.MaxDimension)
		}

		_, err := factorization.NewMatrix(rows)

		require.NoError(t, err)
	})
}
