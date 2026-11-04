// Package config validates the environment, so that a misconfigured service stops
// at startup instead of failing later on the first request.
package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"slices"
	"strings"
	"time"
)

const (
	defaultPort = "8080"

	// defaultStatisticsTimeout leaves time for the statistics API to wake up when it
	// is scaled to zero. A shorter one would fail the first request of every demo.
	defaultStatisticsTimeout = 30 * time.Second
)

// Config is the validated configuration of the service.
type Config struct {
	Port               string
	LogLevel           slog.Level
	CORSAllowedOrigins []string
	JWTPublicKeyPEM    []byte
	JWTIssuer          string
	JWTAudience        string
	StatisticsAPIURL   string
	StatisticsTimeout  time.Duration
}

// Load reads the configuration through lookup, usually os.Getenv. It reports every
// invalid variable at once, naming the variables but never their values.
func Load(lookup func(string) string) (Config, error) {
	var problems []error

	require := func(name string) string {
		value := lookup(name)
		if value == "" {
			problems = append(problems, fmt.Errorf("%s is required", name))
		}

		return value
	}

	cfg := Config{
		Port:              defaultPort,
		StatisticsTimeout: defaultStatisticsTimeout,
		JWTIssuer:         require("JWT_ISSUER"),
		JWTAudience:       require("JWT_AUDIENCE"),
	}

	if port := lookup("PORT"); port != "" {
		cfg.Port = port
	}

	if level := lookup("LOG_LEVEL"); level != "" {
		if err := cfg.LogLevel.UnmarshalText([]byte(level)); err != nil {
			problems = append(problems, errors.New("LOG_LEVEL is not a valid level"))
		}
	}

	if timeout := lookup("STATISTICS_TIMEOUT"); timeout != "" {
		parsed, err := time.ParseDuration(timeout)
		if err != nil || parsed <= 0 {
			problems = append(problems, errors.New("STATISTICS_TIMEOUT must be a positive duration"))
		}
		cfg.StatisticsTimeout = parsed
	}

	if encodedKey := require("JWT_PUBLIC_KEY_B64"); encodedKey != "" {
		key, err := base64.StdEncoding.DecodeString(encodedKey)
		if err != nil {
			problems = append(problems, errors.New("JWT_PUBLIC_KEY_B64 is not valid base64"))
		}
		cfg.JWTPublicKeyPEM = key
	}

	if origins := require("CORS_ALLOWED_ORIGINS"); origins != "" {
		cfg.CORSAllowedOrigins = splitList(origins)
		if slices.Contains(cfg.CORSAllowedOrigins, "*") {
			problems = append(problems, errors.New("CORS_ALLOWED_ORIGINS must not contain a wildcard"))
		}
	}

	if statisticsURL := require("STATISTICS_API_URL"); statisticsURL != "" {
		parsed, err := url.Parse(statisticsURL)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			problems = append(problems, errors.New("STATISTICS_API_URL must be an http or https URL"))
		}
		cfg.StatisticsAPIURL = statisticsURL
	}

	if len(problems) > 0 {
		return Config{}, fmt.Errorf("invalid environment: %w", errors.Join(problems...))
	}

	return cfg, nil
}

func splitList(value string) []string {
	items := strings.Split(value, ",")
	for i, item := range items {
		items[i] = strings.TrimSpace(item)
	}

	return items
}
