// Package statistics is an adapter that obtains statistics from the statistics API.
package statistics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/requestctx"
)

const (
	statisticsPath = "/api/v1/statistics"

	// maxResponseBytes guards against an unexpectedly large response: a valid one
	// only names each matrix, so it stays far below this.
	maxResponseBytes = 1 << 20
)

// Client calls the statistics API. It implements factorization.StatisticsCalculator.
type Client struct {
	endpoint   string
	httpClient *http.Client
}

// NewClient returns a Client for the API at baseURL. timeout bounds each call,
// including the time the API takes to wake up when it is scaled to zero.
func NewClient(baseURL string, timeout time.Duration) *Client {
	return &Client{
		endpoint:   baseURL + statisticsPath,
		httpClient: &http.Client{Timeout: timeout},
	}
}

type matrixPayload struct {
	Name   string      `json:"name"`
	Values [][]float64 `json:"values"`
}

type requestPayload struct {
	Matrices []matrixPayload `json:"matrices"`
}

type classificationPayload struct {
	Name       string `json:"name"`
	IsDiagonal bool   `json:"isDiagonal"`
}

type responsePayload struct {
	Max               float64                 `json:"max"`
	Min               float64                 `json:"min"`
	Average           float64                 `json:"average"`
	Sum               float64                 `json:"sum"`
	HasDiagonalMatrix bool                    `json:"hasDiagonalMatrix"`
	Matrices          []classificationPayload `json:"matrices"`
}

// Calculate forwards the caller's access token and request id to the statistics
// API, which verifies the same identity that this service already verified.
func (c *Client) Calculate(
	ctx context.Context,
	matrices []factorization.NamedMatrix,
) (factorization.Statistics, error) {
	request, err := c.newRequest(ctx, matrices)
	if err != nil {
		return factorization.Statistics{}, err
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return factorization.Statistics{}, classifyTransportError(err)
	}
	defer func() {
		// A failure to close cannot change the outcome: the result is already decided.
		_ = response.Body.Close()
	}()

	switch response.StatusCode {
	case http.StatusOK:
		return decodeResponse(response.Body)
	case http.StatusUnprocessableEntity:
		// This service only sends valid matrices, so the API can only reject their
		// statistics for not being representable.
		return factorization.Statistics{}, factorization.ErrNumericOverflow
	case http.StatusUnauthorized:
		// The token can expire between this service's verification and the API's.
		return factorization.Statistics{}, factorization.ErrAccessDenied
	default:
		return factorization.Statistics{}, fmt.Errorf(
			"%w: unexpected status %d",
			factorization.ErrStatisticsUnavailable,
			response.StatusCode,
		)
	}
}

func (c *Client) newRequest(
	ctx context.Context,
	matrices []factorization.NamedMatrix,
) (*http.Request, error) {
	payload := requestPayload{Matrices: make([]matrixPayload, 0, len(matrices))}
	for _, matrix := range matrices {
		payload.Matrices = append(payload.Matrices, matrixPayload{Name: matrix.Name, Values: matrix.Matrix.ToRows()})
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encoding statistics request: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("creating statistics request: %w", err)
	}

	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+requestctx.BearerToken(ctx))
	request.Header.Set("X-Request-ID", requestctx.RequestID(ctx))

	return request, nil
}

func classifyTransportError(err error) error {
	var timeout interface{ Timeout() bool }
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &timeout) && timeout.Timeout()) {
		return fmt.Errorf("%w: %w", factorization.ErrStatisticsTimeout, err)
	}

	return fmt.Errorf("%w: %w", factorization.ErrStatisticsUnavailable, err)
}

func decodeResponse(body io.Reader) (factorization.Statistics, error) {
	var payload responsePayload
	if err := json.NewDecoder(io.LimitReader(body, maxResponseBytes)).Decode(&payload); err != nil {
		return factorization.Statistics{}, fmt.Errorf("%w: decoding response: %w", factorization.ErrStatisticsUnavailable, err)
	}
	if payload.Matrices == nil {
		return factorization.Statistics{}, fmt.Errorf("%w: response has no matrices", factorization.ErrStatisticsUnavailable)
	}

	classifications := make([]factorization.MatrixClassification, 0, len(payload.Matrices))
	for _, matrix := range payload.Matrices {
		classifications = append(classifications, factorization.MatrixClassification{
			Name:       matrix.Name,
			IsDiagonal: matrix.IsDiagonal,
		})
	}

	return factorization.Statistics{
		Max:               payload.Max,
		Min:               payload.Min,
		Average:           payload.Average,
		Sum:               payload.Sum,
		HasDiagonalMatrix: payload.HasDiagonalMatrix,
		Matrices:          classifications,
	}, nil
}
