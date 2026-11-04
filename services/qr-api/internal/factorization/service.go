package factorization

import (
	"context"
	"fmt"
)

// Result is a QR factorization along with the statistics of its two matrices.
type Result struct {
	QR         QR
	Statistics Statistics
}

// Service runs the use case of the API: factorize a matrix and summarize the result.
type Service struct {
	calculator StatisticsCalculator
}

// NewService returns a Service that obtains statistics from calculator.
func NewService(calculator StatisticsCalculator) *Service {
	return &Service{calculator: calculator}
}

// Factorize validates rows, computes their QR factorization and calculates the
// statistics of Q and R. ctx is handed to the calculator untouched.
func (s *Service) Factorize(ctx context.Context, rows [][]float64) (Result, error) {
	matrix, err := NewMatrix(rows)
	if err != nil {
		return Result{}, fmt.Errorf("validating matrix: %w", err)
	}

	qr, err := Decompose(matrix)
	if err != nil {
		return Result{}, fmt.Errorf("decomposing matrix: %w", err)
	}

	statistics, err := s.calculator.Calculate(ctx, []NamedMatrix{
		{Name: "Q", Matrix: qr.Q},
		{Name: "R", Matrix: qr.R},
	})
	if err != nil {
		return Result{}, fmt.Errorf("calculating statistics: %w", err)
	}

	return Result{QR: qr, Statistics: statistics}, nil
}
