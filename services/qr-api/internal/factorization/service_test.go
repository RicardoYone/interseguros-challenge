package factorization_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
)

// calculatorStub records what it receives and answers with a fixed result.
type calculatorStub struct {
	statistics factorization.Statistics
	err        error
	received   []factorization.NamedMatrix
}

func (s *calculatorStub) Calculate(
	_ context.Context,
	matrices []factorization.NamedMatrix,
) (factorization.Statistics, error) {
	s.received = matrices

	return s.statistics, s.err
}

func TestService_Factorize(t *testing.T) {
	t.Parallel()

	t.Run("returns Q, R and the statistics calculated over them", func(t *testing.T) {
		t.Parallel()

		statistics := factorization.Statistics{Max: 5, Min: 0.6, Average: 2, Sum: 6.4}
		calculator := &calculatorStub{statistics: statistics}
		service := factorization.NewService(calculator)

		result, err := service.Factorize(context.Background(), [][]float64{{3}, {4}})

		require.NoError(t, err)
		assert.InDeltaMapValues(t, flatten([][]float64{{0.6}, {0.8}}), flatten(result.QR.Q.ToRows()), 1e-12)
		assert.Equal(t, [][]float64{{5}}, result.QR.R.ToRows())
		assert.Equal(t, statistics, result.Statistics)

		require.Len(t, calculator.received, 2)
		assert.Equal(t, "Q", calculator.received[0].Name)
		assert.Equal(t, result.QR.Q.ToRows(), calculator.received[0].Matrix.ToRows())
		assert.Equal(t, "R", calculator.received[1].Name)
		assert.Equal(t, [][]float64{{5}}, calculator.received[1].Matrix.ToRows())
	})

	t.Run("does not call the calculator for an invalid matrix", func(t *testing.T) {
		t.Parallel()

		calculator := &calculatorStub{}
		service := factorization.NewService(calculator)

		_, err := service.Factorize(context.Background(), [][]float64{{1, 2}, {3}})

		require.ErrorIs(t, err, factorization.ErrJaggedMatrix)
		assert.Nil(t, calculator.received)
	})

	t.Run("does not call the calculator when the factorization overflows", func(t *testing.T) {
		t.Parallel()

		calculator := &calculatorStub{}
		service := factorization.NewService(calculator)

		_, err := service.Factorize(context.Background(), [][]float64{{1.7e308, 1.7e308}, {1.7e308, 1.7e308}})

		require.ErrorIs(t, err, factorization.ErrNumericOverflow)
		assert.Nil(t, calculator.received)
	})

	t.Run("keeps the calculator's error identifiable", func(t *testing.T) {
		t.Parallel()

		calculator := &calculatorStub{err: factorization.ErrStatisticsTimeout}
		service := factorization.NewService(calculator)

		_, err := service.Factorize(context.Background(), [][]float64{{1}})

		require.ErrorIs(t, err, factorization.ErrStatisticsTimeout)
		assert.NotErrorIs(t, err, factorization.ErrStatisticsUnavailable)
	})
}
