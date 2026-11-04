package rest

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/gofiber/fiber/v3"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
)

var (
	errMalformedBody = errors.New("request body is not valid JSON")
	errInvalidBody   = errors.New("request body has an invalid shape")
)

type createFactorizationRequest struct {
	Matrix [][]float64 `json:"matrix"`
}

type classificationResponse struct {
	Name       string `json:"name"`
	IsDiagonal bool   `json:"isDiagonal"`
}

type statisticsResponse struct {
	Max               float64                  `json:"max"`
	Min               float64                  `json:"min"`
	Average           float64                  `json:"average"`
	Sum               float64                  `json:"sum"`
	HasDiagonalMatrix bool                     `json:"hasDiagonalMatrix"`
	Matrices          []classificationResponse `json:"matrices"`
}

type createFactorizationResponse struct {
	Q          [][]float64        `json:"q"`
	R          [][]float64        `json:"r"`
	Statistics statisticsResponse `json:"statistics"`
}

func newCreateFactorizationHandler(factorizer Factorizer) fiber.Handler {
	return func(c fiber.Ctx) error {
		request, err := decodeRequest(c.Body())
		if err != nil {
			return err
		}

		result, err := factorizer.Factorize(c.Context(), request.Matrix)
		if err != nil {
			return fmt.Errorf("factorizing matrix: %w", err)
		}

		return c.JSON(toResponse(result))
	}
}

func decodeRequest(body []byte) (createFactorizationRequest, error) {
	var request createFactorizationRequest

	err := json.Unmarshal(body, &request)
	if err == nil {
		return request, nil
	}

	var typeError *json.UnmarshalTypeError
	if errors.As(err, &typeError) {
		return request, fmt.Errorf("%w: %w", errInvalidBody, err)
	}

	return request, fmt.Errorf("%w: %w", errMalformedBody, err)
}

func toResponse(result factorization.Result) createFactorizationResponse {
	classifications := make([]classificationResponse, 0, len(result.Statistics.Matrices))
	for _, matrix := range result.Statistics.Matrices {
		classifications = append(classifications, classificationResponse{
			Name:       matrix.Name,
			IsDiagonal: matrix.IsDiagonal,
		})
	}

	return createFactorizationResponse{
		Q: result.QR.Q.ToRows(),
		R: result.QR.R.ToRows(),
		Statistics: statisticsResponse{
			Max:               result.Statistics.Max,
			Min:               result.Statistics.Min,
			Average:           result.Statistics.Average,
			Sum:               result.Statistics.Sum,
			HasDiagonalMatrix: result.Statistics.HasDiagonalMatrix,
			Matrices:          classifications,
		},
	}
}
