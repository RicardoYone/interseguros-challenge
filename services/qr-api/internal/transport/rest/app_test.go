package rest_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/statistics"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/transport/rest"
)

const (
	factorizationsPath = "/api/v1/qr-factorizations"
	validToken         = "valid-token"
	allowedOrigin      = "https://allowed.example"
	testClientTimeout  = 2 * time.Second
	validMatrixBody    = `{"matrix":[[3],[4]]}`
)

var generatedRequestID = regexp.MustCompile(`^[0-9a-f-]{36}$`)

const statisticsResponse = `{
	"max": 5, "min": 0.6, "average": 2.13, "sum": 6.4, "hasDiagonalMatrix": true,
	"matrices": [{"name": "Q", "isDiagonal": false}, {"name": "R", "isDiagonal": true}]
}`

// fixedVerifier accepts one token, standing in for the JWT verifier, whose attack
// cases are covered by the auth package.
type fixedVerifier struct{}

func (fixedVerifier) Verify(token string) (string, error) {
	if token != validToken {
		return "", errors.New("invalid token")
	}

	return "demo", nil
}

type factorizerFunc func(ctx context.Context, rows [][]float64) (factorization.Result, error)

func (f factorizerFunc) Factorize(ctx context.Context, rows [][]float64) (factorization.Result, error) {
	return f(ctx, rows)
}

// statisticsAPI is a fake statistics API: the real client and service run against it.
type statisticsAPI struct {
	*httptest.Server

	calls         atomic.Int32
	authorization atomic.Value
	requestID     atomic.Value
}

func newStatisticsAPI(t *testing.T, status int, body string) *statisticsAPI {
	t.Helper()

	api := &statisticsAPI{}
	api.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		api.calls.Add(1)
		api.authorization.Store(r.Header.Get("Authorization"))
		api.requestID.Store(r.Header.Get("X-Request-ID"))
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(api.Close)

	return api
}

func newApp(baseURL string, timeout time.Duration, logger *slog.Logger) *fiber.App {
	return rest.NewApp(rest.Options{
		Logger:             logger,
		CORSAllowedOrigins: []string{allowedOrigin},
		TokenVerifier:      fixedVerifier{},
		Factorizer:         factorization.NewService(statistics.NewClient(baseURL, timeout)),
	})
}

func newHealthyApp(t *testing.T) (*fiber.App, *statisticsAPI) {
	t.Helper()

	api := newStatisticsAPI(t, http.StatusOK, statisticsResponse)

	return newApp(api.URL, testClientTimeout, slog.New(slog.DiscardHandler)), api
}

func factorizeRequest(body string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, factorizationsPath, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+validToken)

	return request
}

func send(t *testing.T, app *fiber.App, request *http.Request) (*http.Response, []byte) {
	t.Helper()

	response, err := app.Test(request, fiber.TestConfig{Timeout: 5 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { _ = response.Body.Close() })

	body, err := io.ReadAll(response.Body)
	require.NoError(t, err)

	return response, body
}

func assertProblem(t *testing.T, response *http.Response, body []byte, wantStatus int) {
	t.Helper()

	assert.Equal(t, wantStatus, response.StatusCode, string(body))
	assert.Equal(t, "application/problem+json", response.Header.Get("Content-Type"))

	var problem struct {
		Type   string `json:"type"`
		Title  string `json:"title"`
		Status int    `json:"status"`
		Detail string `json:"detail"`
	}
	require.NoError(t, json.Unmarshal(body, &problem))
	assert.Equal(t, "about:blank", problem.Type)
	assert.Equal(t, wantStatus, problem.Status)
	assert.NotEmpty(t, problem.Title)
	assert.NotEmpty(t, problem.Detail)
}

func TestCreateFactorization_success(t *testing.T) {
	t.Parallel()

	app, api := newHealthyApp(t)

	response, body := send(t, app, factorizeRequest(validMatrixBody))

	require.Equal(t, http.StatusOK, response.StatusCode, string(body))
	assert.Contains(t, response.Header.Get("Content-Type"), "application/json")

	var result struct {
		Q          [][]float64 `json:"q"`
		R          [][]float64 `json:"r"`
		Statistics struct {
			Max               float64 `json:"max"`
			Min               float64 `json:"min"`
			Average           float64 `json:"average"`
			Sum               float64 `json:"sum"`
			HasDiagonalMatrix bool    `json:"hasDiagonalMatrix"`
			Matrices          []struct {
				Name       string `json:"name"`
				IsDiagonal bool   `json:"isDiagonal"`
			} `json:"matrices"`
		} `json:"statistics"`
	}
	require.NoError(t, json.Unmarshal(body, &result))

	require.Len(t, result.Q, 2)
	assert.InDelta(t, 0.6, result.Q[0][0], 1e-12)
	assert.InDelta(t, 0.8, result.Q[1][0], 1e-12)
	assert.Equal(t, [][]float64{{5}}, result.R)
	assert.InDelta(t, 5.0, result.Statistics.Max, 0)
	assert.InDelta(t, 0.6, result.Statistics.Min, 0)
	assert.InDelta(t, 2.13, result.Statistics.Average, 0)
	assert.InDelta(t, 6.4, result.Statistics.Sum, 0)
	assert.True(t, result.Statistics.HasDiagonalMatrix)
	require.Len(t, result.Statistics.Matrices, 2)
	assert.Equal(t, "R", result.Statistics.Matrices[1].Name)
	assert.True(t, result.Statistics.Matrices[1].IsDiagonal)

	assert.Equal(t, int32(1), api.calls.Load())
}

func TestCreateFactorization_forwardsIdentityAndTrace(t *testing.T) {
	t.Parallel()

	app, api := newHealthyApp(t)
	request := factorizeRequest(validMatrixBody)
	request.Header.Set("X-Request-ID", "trace-1")

	response, _ := send(t, app, request)

	assert.Equal(t, "Bearer "+validToken, api.authorization.Load())
	assert.Equal(t, "trace-1", api.requestID.Load())
	assert.Equal(t, "trace-1", response.Header.Get("X-Request-ID"))
}

func TestCreateFactorization_authentication(t *testing.T) {
	t.Parallel()

	headers := []struct {
		name  string
		value string
	}{
		{name: "no authorization header", value: ""},
		{name: "invalid token", value: "Bearer forged"},
		{name: "another authentication scheme", value: "Basic " + validToken},
	}
	for _, tt := range headers {
		t.Run("rejects "+tt.name, func(t *testing.T) {
			t.Parallel()

			app, api := newHealthyApp(t)
			request := factorizeRequest(validMatrixBody)
			request.Header.Set("Authorization", tt.value)

			response, body := send(t, app, request)

			assertProblem(t, response, body, http.StatusUnauthorized)
			assert.Equal(t, "Bearer", response.Header.Get("WWW-Authenticate"))
			assert.Zero(t, api.calls.Load(), "a rejected request must not reach the statistics API")
		})
	}
}

func TestCreateFactorization_invalidInput(t *testing.T) {
	t.Parallel()

	tooManyColumns := `{"matrix":[[` + strings.TrimSuffix(strings.Repeat("1,", factorization.MaxDimension+1), ",") + `]]}`

	tests := []struct {
		name   string
		body   string
		status int
	}{
		{name: "malformed JSON", body: `{"matrix":`, status: http.StatusBadRequest},
		{name: "missing matrix", body: `{}`, status: http.StatusUnprocessableEntity},
		{name: "empty matrix", body: `{"matrix":[]}`, status: http.StatusUnprocessableEntity},
		{name: "empty row", body: `{"matrix":[[]]}`, status: http.StatusUnprocessableEntity},
		{name: "rows of different lengths", body: `{"matrix":[[1,2],[3]]}`, status: http.StatusUnprocessableEntity},
		{name: "value that is not a number", body: `{"matrix":[["1"]]}`, status: http.StatusUnprocessableEntity},
		{name: "matrix that is not an array", body: `{"matrix":"text"}`, status: http.StatusUnprocessableEntity},
		{name: "value out of range", body: `{"matrix":[[1e999]]}`, status: http.StatusUnprocessableEntity},
		{name: "matrix over the maximum dimension", body: tooManyColumns, status: http.StatusUnprocessableEntity},
		{name: "factorization that overflows", body: `{"matrix":[[1.7e308,1.7e308],[1.7e308,1.7e308]]}`, status: http.StatusUnprocessableEntity},
	}
	for _, tt := range tests {
		t.Run("responds to "+tt.name, func(t *testing.T) {
			t.Parallel()

			app, api := newHealthyApp(t)

			response, body := send(t, app, factorizeRequest(tt.body))

			assertProblem(t, response, body, tt.status)
			assert.Zero(t, api.calls.Load(), "invalid input must not reach the statistics API")
		})
	}

	// Uses a real listener because the server enforces this limit while reading the
	// connection, a step that app.Test skips.
	t.Run("responds 413 to a body over the limit", func(t *testing.T) {
		t.Parallel()

		app, _ := newHealthyApp(t)
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		require.NoError(t, err)
		go func() { _ = app.Listener(listener, fiber.ListenConfig{DisableStartupMessage: true}) }()
		t.Cleanup(func() { _ = app.Shutdown() })

		oversized := `{"matrix":[[` + strings.Repeat("1", 3<<20) + `]]}`
		request := factorizeRequest(oversized)
		request.RequestURI = ""
		request.URL.Scheme = "http"
		request.URL.Host = listener.Addr().String()

		response, err := http.DefaultClient.Do(request)
		require.NoError(t, err)
		t.Cleanup(func() { _ = response.Body.Close() })
		body, err := io.ReadAll(response.Body)
		require.NoError(t, err)

		assertProblem(t, response, body, http.StatusRequestEntityTooLarge)
	})
}

func TestCreateFactorization_statisticsFailures(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		status     int
		body       string
		wantStatus int
	}{
		{name: "an API error", status: http.StatusInternalServerError, body: `{}`, wantStatus: http.StatusBadGateway},
		{name: "a malformed response", status: http.StatusOK, body: `not json`, wantStatus: http.StatusBadGateway},
		{name: "statistics that overflow", status: http.StatusUnprocessableEntity, body: `{}`, wantStatus: http.StatusUnprocessableEntity},
	}
	for _, tt := range tests {
		t.Run("responds to "+tt.name, func(t *testing.T) {
			t.Parallel()

			api := newStatisticsAPI(t, tt.status, tt.body)
			app := newApp(api.URL, testClientTimeout, slog.New(slog.DiscardHandler))

			response, body := send(t, app, factorizeRequest(validMatrixBody))

			assertProblem(t, response, body, tt.wantStatus)
		})
	}

	t.Run("responds 401 when the API rejects a token that just expired", func(t *testing.T) {
		t.Parallel()

		api := newStatisticsAPI(t, http.StatusUnauthorized, `{}`)
		app := newApp(api.URL, testClientTimeout, slog.New(slog.DiscardHandler))

		response, body := send(t, app, factorizeRequest(validMatrixBody))

		assertProblem(t, response, body, http.StatusUnauthorized)
		assert.Equal(t, "Bearer", response.Header.Get("WWW-Authenticate"))
	})

	t.Run("responds 502 when the API is unreachable", func(t *testing.T) {
		t.Parallel()

		api := newStatisticsAPI(t, http.StatusOK, statisticsResponse)
		api.Close()
		app := newApp(api.URL, testClientTimeout, slog.New(slog.DiscardHandler))

		response, body := send(t, app, factorizeRequest(validMatrixBody))

		assertProblem(t, response, body, http.StatusBadGateway)
	})

	t.Run("responds 504 when the API takes too long", func(t *testing.T) {
		t.Parallel()

		release := make(chan struct{})
		server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
			<-release
		}))
		t.Cleanup(server.Close)
		t.Cleanup(func() { close(release) })
		app := newApp(server.URL, 20*time.Millisecond, slog.New(slog.DiscardHandler))

		response, body := send(t, app, factorizeRequest(validMatrixBody))

		assertProblem(t, response, body, http.StatusGatewayTimeout)
	})
}

func TestUnexpectedFailures_hideTheirCause(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		factorizer factorizerFunc
	}{
		{
			name: "an unexpected error",
			factorizer: func(context.Context, [][]float64) (factorization.Result, error) {
				return factorization.Result{}, errors.New("database password is hunter2")
			},
		},
		{
			name: "a panic",
			factorizer: func(context.Context, [][]float64) (factorization.Result, error) {
				panic("database password is hunter2")
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			app := rest.NewApp(rest.Options{
				Logger:             slog.New(slog.DiscardHandler),
				CORSAllowedOrigins: []string{allowedOrigin},
				TokenVerifier:      fixedVerifier{},
				Factorizer:         tt.factorizer,
			})

			response, body := send(t, app, factorizeRequest(validMatrixBody))

			assertProblem(t, response, body, http.StatusInternalServerError)
			assert.NotContains(t, string(body), "hunter2")
		})
	}
}

func TestHealth(t *testing.T) {
	t.Parallel()

	app, _ := newHealthyApp(t)

	response, body := send(t, app, httptest.NewRequest(http.MethodGet, "/health", nil))

	assert.Equal(t, http.StatusOK, response.StatusCode)
	assert.JSONEq(t, `{"status":"ok"}`, string(body))
}

func TestUnknownRoute_respondsWithProblem(t *testing.T) {
	t.Parallel()

	app, _ := newHealthyApp(t)

	response, body := send(t, app, httptest.NewRequest(http.MethodGet, "/nothing-here", nil))

	assertProblem(t, response, body, http.StatusNotFound)
}

func TestCORS(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		origin string
		want   string
	}{
		{name: "allows a configured origin", origin: allowedOrigin, want: allowedOrigin},
		{name: "does not allow any other origin", origin: "https://evil.example", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			app, _ := newHealthyApp(t)
			request := httptest.NewRequest(http.MethodGet, "/health", nil)
			request.Header.Set("Origin", tt.origin)

			response, _ := send(t, app, request)

			assert.Equal(t, tt.want, response.Header.Get("Access-Control-Allow-Origin"))
		})
	}
}

func TestSecurityHeaders(t *testing.T) {
	t.Parallel()

	app, _ := newHealthyApp(t)

	response, _ := send(t, app, httptest.NewRequest(http.MethodGet, "/health", nil))

	assert.Equal(t, "nosniff", response.Header.Get("X-Content-Type-Options"))
}

func TestRequestID(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		incoming string
		want     *regexp.Regexp
	}{
		{name: "keeps a well-formed id", incoming: "abc-123", want: regexp.MustCompile(`^abc-123$`)},
		{name: "generates an id when none arrives", incoming: "", want: generatedRequestID},
		{name: "replaces an id that could inject content into the logs", incoming: `bad id {"level":60}`, want: generatedRequestID},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			app, _ := newHealthyApp(t)
			request := httptest.NewRequest(http.MethodGet, "/health", nil)
			request.Header.Set("X-Request-ID", tt.incoming)

			response, _ := send(t, app, request)

			assert.Regexp(t, tt.want, response.Header.Get("X-Request-ID"))
		})
	}
}

func TestLogging(t *testing.T) {
	t.Parallel()

	var output bytes.Buffer
	api := newStatisticsAPI(t, http.StatusOK, statisticsResponse)
	app := newApp(api.URL, testClientTimeout, slog.New(slog.NewJSONHandler(&output, nil)))
	request := factorizeRequest(validMatrixBody)
	request.Header.Set("X-Request-ID", "trace-1")

	send(t, app, request)

	logs := output.String()
	assert.Contains(t, logs, factorizationsPath)
	assert.Contains(t, logs, "trace-1")
	assert.NotContains(t, logs, validToken, "the access token must never reach the logs")
}
