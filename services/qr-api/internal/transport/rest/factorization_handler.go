package rest

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
)

var (
	errMalformedBody  = errors.New("request body is not valid JSON")
	errInvalidBody    = errors.New("request body has an invalid shape")
	errCompressedBody = errors.New("request body is compressed")
)

// createFactorizationRequest holds pointers because encoding/json silently turns a
// null into 0 for a plain float64, which would factorize a value nobody sent.
type createFactorizationRequest struct {
	Matrix [][]*float64 `json:"matrix"`
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
		// Clients have no reason to compress a matrix, and refusing it leaves no
		// decompression to attack. The raw body is read for the same reason.
		encoding := c.Get(fiber.HeaderContentEncoding)
		if encoding != "" && !strings.EqualFold(encoding, "identity") {
			return errCompressedBody
		}

		rows, err := decodeRows(c.BodyRaw())
		if err != nil {
			return err
		}

		result, err := factorizer.Factorize(c.Context(), rows)
		if err != nil {
			return fmt.Errorf("factorizing matrix: %w", err)
		}

		return c.JSON(toResponse(result))
	}
}

func decodeRows(body []byte) ([][]float64, error) {
	var request createFactorizationRequest

	if err := json.Unmarshal(body, &request); err != nil {
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			return nil, fmt.Errorf("%w: %w", errInvalidBody, err)
		}

		return nil, fmt.Errorf("%w: %w", errMalformedBody, err)
	}

	rows := make([][]float64, len(request.Matrix))
	for i, row := range request.Matrix {
		rows[i] = make([]float64, len(row))
		for j, value := range row {
			if value == nil {
				return nil, fmt.Errorf("%w: null value at row %d, column %d", errInvalidBody, i, j)
			}
			rows[i][j] = *value
		}
	}

	return rows, nil
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
