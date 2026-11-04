// Command api runs the QR factorization service.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/auth"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/config"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/statistics"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/transport/rest"
)

// shutdownMargin is added to the statistics timeout to get the shutdown deadline, so
// that a request waiting on the statistics API can still finish during a deploy.
const shutdownMargin = 5 * time.Second

func main() {
	if err := run(); err != nil {
		slog.New(slog.NewJSONHandler(os.Stderr, nil)).Error("service stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

// run wires the service together and blocks until it stops.
func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("loading configuration: %w", err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))

	verifier, err := auth.NewVerifier(cfg.JWTPublicKeyPEM, cfg.JWTIssuer, cfg.JWTAudience)
	if err != nil {
		return fmt.Errorf("creating token verifier: %w", err)
	}

	app := rest.NewApp(rest.Options{
		Logger:             logger,
		CORSAllowedOrigins: cfg.CORSAllowedOrigins,
		TokenVerifier:      verifier,
		Factorizer: factorization.NewService(
			statistics.NewClient(cfg.StatisticsAPIURL, cfg.StatisticsTimeout),
		),
	})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Binding here, before logging, so that a busy port fails instead of claiming to listen.
	listener, err := net.Listen("tcp", ":"+cfg.Port)
	if err != nil {
		return fmt.Errorf("binding port: %w", err)
	}
	logger.Info("server listening", slog.String("port", cfg.Port))

	serveFailed := make(chan error, 1)
	go func() {
		serveFailed <- app.Listener(listener, fiber.ListenConfig{DisableStartupMessage: true})
	}()

	select {
	case err := <-serveFailed:
		return fmt.Errorf("serving: %w", err)
	case <-ctx.Done():
	}

	logger.Info("shutting down")
	if err := app.ShutdownWithTimeout(cfg.StatisticsTimeout + shutdownMargin); err != nil {
		return fmt.Errorf("shutting down: %w", err)
	}

	return nil
}
