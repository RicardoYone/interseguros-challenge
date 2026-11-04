// Package auth verifies the access tokens issued by the statistics API. This
// service only holds the public key, so it can check tokens but never forge them.
package auth

import (
	"crypto/ecdsa"
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken means the token is malformed, forged, expired or meant for someone else.
var ErrInvalidToken = errors.New("invalid access token")

// Verifier checks access tokens signed with ES256.
type Verifier struct {
	publicKey *ecdsa.PublicKey
	parser    *jwt.Parser
}

// NewVerifier returns a Verifier that trusts publicKeyPEM and accepts only tokens
// from issuer for audience.
func NewVerifier(publicKeyPEM []byte, issuer, audience string) (*Verifier, error) {
	publicKey, err := jwt.ParseECPublicKeyFromPEM(publicKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("parsing public key: %w", err)
	}

	return &Verifier{
		publicKey: publicKey,
		parser: jwt.NewParser(
			// Pinning the method is what defeats "alg: none" and algorithm confusion.
			jwt.WithValidMethods([]string{jwt.SigningMethodES256.Alg()}),
			jwt.WithIssuer(issuer),
			jwt.WithAudience(audience),
			jwt.WithExpirationRequired(),
		),
	}, nil
}

// Verify returns the subject of a valid token, or an error wrapping ErrInvalidToken.
func (v *Verifier) Verify(token string) (string, error) {
	var claims jwt.RegisteredClaims

	_, err := v.parser.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) {
		return v.publicKey, nil
	})
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrInvalidToken, err)
	}
	if claims.Subject == "" {
		return "", fmt.Errorf("%w: missing subject", ErrInvalidToken)
	}

	return claims.Subject, nil
}
