package statistics_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/factorization"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/requestctx"
	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/statistics"
)

const testTimeout = 2 * time.Second

const validResponse = `{
	"max": 4, "min": 0, "average": 1.5, "sum": 6, "hasDiagonalMatrix": true,
	"matrices": [{"name": "Q", "isDiagonal": true}, {"name": "R", "isDiagonal": false}]
}`

func namedMatrices(t *testing.T) []factorization.NamedMatrix {
	t.Helper()

	q, err := factorization.NewMatrix([][]float64{{1, 0}, {0, 1}})
	require.NoError(t, err)
	r, err := factorization.NewMatrix([][]float64{{2, 3}})
	require.NoError(t, err)

	return []factorization.NamedMatrix{{Name: "Q", Matrix: q}, {Name: "R", Matrix: r}}
}

func TestClient_Calculate(t *testing.T) {
	t.Parallel()

	t.Run("sends the contract the statistics API expects", func(t *testing.T) {
		t.Parallel()

		var method, path, authorization, requestID, contentType string
		var body map[string]any
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			method, path = r.Method, r.URL.Path
			authorization = r.Header.Get("Authorization")
			requestID = r.Header.Get("X-Request-ID")
			contentType = r.Header.Get("Content-Type")
			raw, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(raw, &body)
			_, _ = io.WriteString(w, validResponse)
		}))
		defer server.Close()
		client := statistics.NewClient(server.URL, testTimeout)
		ctx := requestctx.WithRequestID(requestctx.WithBearerToken(context.Background(), "user-token"), "request-1")

		_, err := client.Calculate(ctx, namedMatrices(t))

		require.NoError(t, err)
		assert.Equal(t, http.MethodPost, method)
		assert.Equal(t, "/api/v1/statistics", path)
		assert.Equal(t, "Bearer user-token", authorization)
		assert.Equal(t, "request-1", requestID)
		assert.Equal(t, "application/json", contentType)
		assert.Equal(t, map[string]any{
			"matrices": []any{
				map[string]any{"name": "Q", "values": []any{[]any{1.0, 0.0}, []any{0.0, 1.0}}},
				map[string]any{"name": "R", "values": []any{[]any{2.0, 3.0}}},
			},
		}, body)
	})

	t.Run("maps the response to the domain", func(t *testing.T) {
		t.Parallel()

		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, validResponse)
		}))
		defer server.Close()
		client := statistics.NewClient(server.URL, testTimeout)

		result, err := client.Calculate(context.Background(), namedMatrices(t))

		require.NoError(t, err)
		assert.Equal(t, factorization.Statistics{
			Max:               4,
			Min:               0,
			Average:           1.5,
			Sum:               6,
			HasDiagonalMatrix: true,
			Matrices: []factorization.MatrixClassification{
				{Name: "Q", IsDiagonal: true},
				{Name: "R", IsDiagonal: false},
			},
		}, result)
	})

	failures := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{name: "server error", status: http.StatusInternalServerError, body: `{}`, want: factorization.ErrStatisticsUnavailable},
		{name: "rejected token", status: http.StatusUnauthorized, body: `{}`, want: factorization.ErrStatisticsUnavailable},
		{name: "overflow reported by the API", status: http.StatusUnprocessableEntity, body: `{}`, want: factorization.ErrNumericOverflow},
		{name: "malformed response", status: http.StatusOK, body: `not json`, want: factorization.ErrStatisticsUnavailable},
		{name: "response missing its statistics", status: http.StatusOK, body: `{"max": 4}`, want: factorization.ErrStatisticsUnavailable},
	}
	for _, tt := range failures {
		t.Run("reports "+tt.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
				_, _ = io.WriteString(w, tt.body)
			}))
			defer server.Close()
			client := statistics.NewClient(server.URL, testTimeout)

			_, err := client.Calculate(context.Background(), namedMatrices(t))

			require.ErrorIs(t, err, tt.want)
		})
	}

	t.Run("reports an unreachable API", func(t *testing.T) {
		t.Parallel()

		server := httptest.NewServer(http.NotFoundHandler())
		server.Close()
		client := statistics.NewClient(server.URL, testTimeout)

		_, err := client.Calculate(context.Background(), namedMatrices(t))

		require.ErrorIs(t, err, factorization.ErrStatisticsUnavailable)
	})

	t.Run("reports a timeout separately", func(t *testing.T) {
		t.Parallel()

		release := make(chan struct{})
		server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
			<-release
		}))
		defer server.Close()
		defer close(release)
		client := statistics.NewClient(server.URL, 20*time.Millisecond)

		_, err := client.Calculate(context.Background(), namedMatrices(t))

		require.ErrorIs(t, err, factorization.ErrStatisticsTimeout)
	})
}
