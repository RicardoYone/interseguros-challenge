// Package requestctx carries per-request values from the HTTP layer to outbound
// adapters, across a domain that must not know about them.
package requestctx

import "context"

type contextKey int

const (
	bearerTokenKey contextKey = iota
	requestIDKey
)

// WithBearerToken returns a context carrying the caller's access token.
func WithBearerToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, bearerTokenKey, token)
}

// BearerToken returns the caller's access token, or "" when there is none.
func BearerToken(ctx context.Context) string {
	token, _ := ctx.Value(bearerTokenKey).(string)

	return token
}

// WithRequestID returns a context carrying the id that traces the request across services.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

// RequestID returns the id that traces the request, or "" when there is none.
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)

	return id
}
