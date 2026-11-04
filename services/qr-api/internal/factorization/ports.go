package factorization

import (
	"context"
	"errors"
)

// Errors a StatisticsCalculator reports when it cannot produce statistics.
var (
	ErrStatisticsUnavailable = errors.New("statistics are unavailable")
	ErrStatisticsTimeout     = errors.New("statistics took too long")
	ErrTokenRejected         = errors.New("statistics rejected the access token")
)

// NamedMatrix labels a matrix within a statistics calculation.
type NamedMatrix struct {
	Name   string
	Matrix Matrix
}

// MatrixClassification tells whether one of the matrices is diagonal.
type MatrixClassification struct {
	Name       string
	IsDiagonal bool
}

// Statistics summarizes every value of a group of matrices.
type Statistics struct {
	Max               float64
	Min               float64
	Average           float64
	Sum               float64
	HasDiagonalMatrix bool
	Matrices          []MatrixClassification
}

// StatisticsCalculator is the outbound port of the domain. The domain declares
// what it needs, and an adapter decides how to obtain it.
type StatisticsCalculator interface {
	// Calculate returns the statistics of matrices. It fails with
	// ErrStatisticsUnavailable, ErrStatisticsTimeout, ErrTokenRejected or ErrNumericOverflow.
	Calculate(ctx context.Context, matrices []NamedMatrix) (Statistics, error)
}
