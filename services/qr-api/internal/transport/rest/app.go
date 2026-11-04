// Package rest exposes the factorization use case over HTTP.
package rest

import (
	"context"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/helmet"
	recoverer "github.com/gofiber/fiber/v3/middleware/recover"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
)

const (
	// maxBodyBytes fits the largest allowed matrix: 200×200 values of about 25 bytes.
	maxBodyBytes = 2 << 20

	readTimeout = 10 * time.Second
	idleTimeout = 120 * time.Second
)

// TokenVerifier checks an access token and returns its subject.
type TokenVerifier interface {
	Verify(token string) (string, error)
}

// Factorizer runs the factorization use case.
type Factorizer interface {
	Factorize(ctx context.Context, rows [][]float64) (factorization.Result, error)
}

// Options holds what the HTTP layer depends on.
type Options struct {
	Logger             *slog.Logger
	CORSAllowedOrigins []string
	TokenVerifier      TokenVerifier
	Factorizer         Factorizer
}

// NewApp returns the application with its middleware and routes.
func NewApp(options Options) *fiber.App {
	app := fiber.New(fiber.Config{
		BodyLimit:    maxBodyBytes,
		ReadTimeout:  readTimeout,
		IdleTimeout:  idleTimeout,
		ErrorHandler: newErrorHandler(options.Logger),
	})

	// The logger wraps recover so that a recovered panic is still logged as a failure.
	app.Use(
		assignRequestID,
		newRequestLogger(options.Logger),
		recoverer.New(recoverer.Config{
			EnableStackTrace:  true,
			StackTraceHandler: newPanicLogger(options.Logger),
		}),
		helmet.New(),
		cors.New(cors.Config{
			AllowOrigins:  options.CORSAllowedOrigins,
			AllowMethods:  []string{fiber.MethodGet, fiber.MethodPost},
			AllowHeaders:  []string{fiber.HeaderAuthorization, fiber.HeaderContentType, fiber.HeaderXRequestID},
			ExposeHeaders: []string{fiber.HeaderXRequestID},
		}),
	)

	app.Get(healthPath, health)

	api := app.Group("/api/v1", newRequireAuth(options.TokenVerifier))
	api.Post("/qr-factorizations", newCreateFactorizationHandler(options.Factorizer))

	return app
}

func health(c fiber.Ctx) error {
	return c.JSON(fiber.Map{"status": "ok"})
}
