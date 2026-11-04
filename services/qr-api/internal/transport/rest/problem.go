package rest

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gofiber/fiber/v3"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
)

const (
	problemContentType = "application/problem+json"
	internalErrorText  = "An unexpected error occurred."
)

// problem is an RFC 9457 problem document.
type problem struct {
	Type     string `json:"type"`
	Title    string `json:"title"`
	Status   int    `json:"status"`
	Detail   string `json:"detail"`
	Instance string `json:"instance"`
}

// knownErrors maps each expected failure to its status and a client-facing message.
var knownErrors = []struct {
	err    error
	status int
	detail string
}{
	{errUnauthorized, http.StatusUnauthorized, "A valid access token is required."},
	{errMalformedBody, http.StatusBadRequest, "The request body is not valid JSON."},
	{errInvalidBody, http.StatusUnprocessableEntity, "The matrix must be an array of arrays of numbers."},
	{factorization.ErrEmptyMatrix, http.StatusUnprocessableEntity, "The matrix has no values."},
	{factorization.ErrJaggedMatrix, http.StatusUnprocessableEntity, "All rows of the matrix must have the same length."},
	{factorization.ErrMatrixTooLarge, http.StatusUnprocessableEntity, "The matrix exceeds the maximum dimension."},
	{factorization.ErrNonFiniteValue, http.StatusUnprocessableEntity, "The matrix contains a value that is not a finite number."},
	{factorization.ErrNumericOverflow, http.StatusUnprocessableEntity, "The result exceeds the range of representable numbers."},
	{factorization.ErrStatisticsUnavailable, http.StatusBadGateway, "The statistics service is unavailable."},
	{factorization.ErrStatisticsTimeout, http.StatusGatewayTimeout, "The statistics service took too long to respond."},
}

// newErrorHandler translates every failure into a single problem document format.
func newErrorHandler(logger *slog.Logger) fiber.ErrorHandler {
	return func(c fiber.Ctx, err error) error {
		status, detail := classify(err)

		// The cause stays in the logs: the client only sees the fixed message above.
		if status >= fiber.StatusInternalServerError {
			logger.LogAttrs(c.Context(), slog.LevelError, "request failed", slog.Any("error", err))
		}

		return c.Status(status).JSON(problem{
			Type:     "about:blank",
			Title:    http.StatusText(status),
			Status:   status,
			Detail:   detail,
			Instance: c.Path(),
		}, problemContentType)
	}
}

func classify(err error) (status int, detail string) {
	for _, known := range knownErrors {
		if errors.Is(err, known.err) {
			return known.status, known.detail
		}
	}

	var fiberError *fiber.Error
	if errors.As(err, &fiberError) && fiberError.Code < fiber.StatusInternalServerError {
		return fiberError.Code, fiberError.Message
	}

	return fiber.StatusInternalServerError, internalErrorText
}
