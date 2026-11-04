package auth_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RicardoYone/interseguros-challenge/services/qr-api/internal/auth"
)

const (
	testIssuer   = "test-issuer"
	testAudience = "test-audience"
)

type testKeys struct {
	private   *ecdsa.PrivateKey
	publicPEM []byte
}

func generateKeys(t *testing.T) testKeys {
	t.Helper()

	private, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.MarshalPKIXPublicKey(&private.PublicKey)
	require.NoError(t, err)

	return testKeys{
		private:   private,
		publicPEM: pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}),
	}
}

func validClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"iss": testIssuer,
		"aud": testAudience,
		"sub": "demo",
		"exp": time.Now().Add(time.Minute).Unix(),
	}
}

func sign(t *testing.T, key *ecdsa.PrivateKey, claims jwt.MapClaims) string {
	t.Helper()

	token, err := jwt.NewWithClaims(jwt.SigningMethodES256, claims).SignedString(key)
	require.NoError(t, err)

	return token
}

func encodeSegment(t *testing.T, value any) string {
	t.Helper()

	raw, err := json.Marshal(value)
	require.NoError(t, err)

	return base64.RawURLEncoding.EncodeToString(raw)
}

func newVerifier(t *testing.T, keys testKeys) *auth.Verifier {
	t.Helper()

	verifier, err := auth.NewVerifier(keys.publicPEM, testIssuer, testAudience)
	require.NoError(t, err)

	return verifier
}

func TestNewVerifier(t *testing.T) {
	t.Parallel()

	t.Run("refuses a value that is not a public key", func(t *testing.T) {
		t.Parallel()

		_, err := auth.NewVerifier([]byte("not a key"), testIssuer, testAudience)

		require.Error(t, err)
	})
}

func TestVerifier_Verify(t *testing.T) {
	t.Parallel()

	keys := generateKeys(t)
	verifier := newVerifier(t, keys)

	t.Run("accepts a valid token and returns its subject", func(t *testing.T) {
		t.Parallel()

		subject, err := verifier.Verify(sign(t, keys.private, validClaims()))

		require.NoError(t, err)
		assert.Equal(t, "demo", subject)
	})

	t.Run("rejects an unsigned token using alg none", func(t *testing.T) {
		t.Parallel()

		header := encodeSegment(t, map[string]string{"alg": "none", "typ": "JWT"})
		token := header + "." + encodeSegment(t, validClaims()) + "."

		_, err := verifier.Verify(token)

		require.ErrorIs(t, err, auth.ErrInvalidToken)
	})

	t.Run("rejects an HS256 token signed with the public key as shared secret", func(t *testing.T) {
		t.Parallel()

		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims()).SignedString(keys.publicPEM)
		require.NoError(t, err)

		_, err = verifier.Verify(token)

		require.ErrorIs(t, err, auth.ErrInvalidToken)
	})

	t.Run("rejects a token whose claims were tampered with", func(t *testing.T) {
		t.Parallel()

		parts := strings.Split(sign(t, keys.private, validClaims()), ".")
		forged := validClaims()
		forged["sub"] = "attacker"
		parts[1] = encodeSegment(t, forged)

		_, err := verifier.Verify(strings.Join(parts, "."))

		require.ErrorIs(t, err, auth.ErrInvalidToken)
	})

	t.Run("rejects a token signed with another key", func(t *testing.T) {
		t.Parallel()

		_, err := verifier.Verify(sign(t, generateKeys(t).private, validClaims()))

		require.ErrorIs(t, err, auth.ErrInvalidToken)
	})

	invalidClaims := []struct {
		name   string
		mutate func(jwt.MapClaims)
	}{
		{name: "expired", mutate: func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Minute).Unix() }},
		{name: "without expiration", mutate: func(c jwt.MapClaims) { delete(c, "exp") }},
		{name: "without subject", mutate: func(c jwt.MapClaims) { delete(c, "sub") }},
		{name: "from another issuer", mutate: func(c jwt.MapClaims) { c["iss"] = "other" }},
		{name: "without issuer", mutate: func(c jwt.MapClaims) { delete(c, "iss") }},
		{name: "for another audience", mutate: func(c jwt.MapClaims) { c["aud"] = "other" }},
		{name: "without audience", mutate: func(c jwt.MapClaims) { delete(c, "aud") }},
	}
	for _, tt := range invalidClaims {
		t.Run("rejects a correctly signed token "+tt.name, func(t *testing.T) {
			t.Parallel()

			claims := validClaims()
			tt.mutate(claims)

			_, err := verifier.Verify(sign(t, keys.private, claims))

			require.ErrorIs(t, err, auth.ErrInvalidToken)
		})
	}

	t.Run("rejects text that is not a token", func(t *testing.T) {
		t.Parallel()

		_, err := verifier.Verify("not-a-token")

		require.ErrorIs(t, err, auth.ErrInvalidToken)
	})
}
