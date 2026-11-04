package config_test

import (
	"encoding/base64"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/config"
)

func validEnvironment() map[string]string {
	return map[string]string{
		"JWT_PUBLIC_KEY_B64":   base64.StdEncoding.EncodeToString([]byte("public-pem")),
		"JWT_ISSUER":           "issuer",
		"JWT_AUDIENCE":         "audience",
		"CORS_ALLOWED_ORIGINS": "https://a.example, https://b.example",
		"STATISTICS_API_URL":   "http://statistics:3000",
	}
}

func lookupFrom(environment map[string]string) func(string) string {
	return func(name string) string { return environment[name] }
}

func TestLoad(t *testing.T) {
	t.Parallel()

	t.Run("decodes the key and splits the allowed origins", func(t *testing.T) {
		t.Parallel()

		cfg, err := config.Load(lookupFrom(validEnvironment()))

		require.NoError(t, err)
		assert.Equal(t, []byte("public-pem"), cfg.JWTPublicKeyPEM)
		assert.Equal(t, []string{"https://a.example", "https://b.example"}, cfg.CORSAllowedOrigins)
		assert.Equal(t, "http://statistics:3000", cfg.StatisticsAPIURL)
	})

	t.Run("applies defaults to optional settings", func(t *testing.T) {
		t.Parallel()

		cfg, err := config.Load(lookupFrom(validEnvironment()))

		require.NoError(t, err)
		assert.Equal(t, "8080", cfg.Port)
		// Long enough for the statistics API to wake up when scaled to zero.
		assert.Equal(t, 30*time.Second, cfg.StatisticsTimeout)
	})

	t.Run("reads optional settings", func(t *testing.T) {
		t.Parallel()

		environment := validEnvironment()
		environment["PORT"] = "9000"
		environment["STATISTICS_TIMEOUT"] = "5s"
		environment["LOG_LEVEL"] = "debug"

		cfg, err := config.Load(lookupFrom(environment))

		require.NoError(t, err)
		assert.Equal(t, "9000", cfg.Port)
		assert.Equal(t, 5*time.Second, cfg.StatisticsTimeout)
		assert.Equal(t, slog.LevelDebug, cfg.LogLevel)
	})

	for _, variable := range []string{
		"JWT_PUBLIC_KEY_B64",
		"JWT_ISSUER",
		"JWT_AUDIENCE",
		"CORS_ALLOWED_ORIGINS",
		"STATISTICS_API_URL",
	} {
		t.Run("refuses to start without "+variable, func(t *testing.T) {
			t.Parallel()

			environment := validEnvironment()
			delete(environment, variable)

			_, err := config.Load(lookupFrom(environment))

			require.ErrorContains(t, err, variable)
		})
	}

	t.Run("reports every problem at once", func(t *testing.T) {
		t.Parallel()

		_, err := config.Load(lookupFrom(map[string]string{}))

		require.ErrorContains(t, err, "JWT_ISSUER")
		require.ErrorContains(t, err, "STATISTICS_API_URL")
	})

	invalidValues := []struct {
		name     string
		variable string
		value    string
	}{
		{name: "a wildcard origin", variable: "CORS_ALLOWED_ORIGINS", value: "*"},
		{name: "a key that is not base64", variable: "JWT_PUBLIC_KEY_B64", value: "%%%"},
		{name: "a timeout that is not a duration", variable: "STATISTICS_TIMEOUT", value: "soon"},
		{name: "a negative timeout", variable: "STATISTICS_TIMEOUT", value: "-1s"},
		{name: "a URL without a scheme", variable: "STATISTICS_API_URL", value: "statistics:3000"},
		{name: "an unknown log level", variable: "LOG_LEVEL", value: "loud"},
	}
	for _, tt := range invalidValues {
		t.Run("refuses "+tt.name, func(t *testing.T) {
			t.Parallel()

			environment := validEnvironment()
			environment[tt.variable] = tt.value

			_, err := config.Load(lookupFrom(environment))

			require.ErrorContains(t, err, tt.variable)
		})
	}
}
