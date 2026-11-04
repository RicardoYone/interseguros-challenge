package rest

import (
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/requestctx"
)

const (
	healthPath   = "/health"
	bearerPrefix = "Bearer "
)

// safeRequestID allows only harmless characters: the id comes from the client and
// ends up in the logs.
var safeRequestID = regexp.MustCompile(`^[\w-]{1,64}$`)

var errUnauthorized = errors.New("missing or invalid access token")

// assignRequestID keeps the incoming id or creates one, so that a request can be
// traced across services.
//
// Values read from a Fiber context are only valid until the handler returns, because
// Fiber reuses their memory. strings.Clone makes them safe to keep.
func assignRequestID(c fiber.Ctx) error {
	id := c.Get(fiber.HeaderXRequestID)
	if safeRequestID.MatchString(id) {
		id = strings.Clone(id)
	} else {
		id = uuid.NewString()
	}

	c.Set(fiber.HeaderXRequestID, id)
	c.SetContext(requestctx.WithRequestID(c.Context(), id))

	return c.Next()
}

// newRequestLogger logs each completed request. It lists its fields explicitly so
// that headers, and the access token with them, never reach the logs.
func newRequestLogger(logger *slog.Logger) fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()

		// The error is handled here, not by Fiber afterwards, so that the logged
		// status is the one the client receives.
		if err := c.Next(); err != nil {
			if handlerErr := c.App().ErrorHandler(c, err); handlerErr != nil {
				return handlerErr
			}
		}

		if c.Path() == healthPath {
			return nil
		}

		status := c.Response().StatusCode()
		logger.LogAttrs(c.Context(), levelForStatus(status), "request completed",
			slog.String("request_id", requestctx.RequestID(c.Context())),
			slog.String("method", c.Method()),
			slog.String("path", c.Path()),
			slog.Int("status", status),
			slog.Duration("duration", time.Since(start)),
		)

		return nil
	}
}

func levelForStatus(status int) slog.Level {
	switch {
	case status >= fiber.StatusInternalServerError:
		return slog.LevelError
	case status >= fiber.StatusBadRequest:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}

// newRequireAuth rejects any request without a valid access token, and keeps the
// token in the context so that it can be forwarded to the statistics API.
func newRequireAuth(verifier TokenVerifier) fiber.Handler {
	return func(c fiber.Ctx) error {
		token, found := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), bearerPrefix)
		if !found {
			return errUnauthorized
		}

		if _, err := verifier.Verify(token); err != nil {
			return errUnauthorized
		}

		c.SetContext(requestctx.WithBearerToken(c.Context(), strings.Clone(token)))

		return c.Next()
	}
}
