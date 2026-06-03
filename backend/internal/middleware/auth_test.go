package middleware

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-jwt-secret-key"

func TestGenerateToken_Success(t *testing.T) {
	token, err := GenerateToken("user-123", "testuser", "staff", "store-456", testSecret)
	if err != nil {
		t.Fatalf("GenerateToken() error = %v", err)
	}
	if token == "" {
		t.Fatal("GenerateToken() returned empty token")
	}
}

func TestGenerateToken_ParseBack(t *testing.T) {
	userID := "user-abc"
	username := "admin"
	role := "super_admin"
	storeID := "store-xyz"

	tokenStr, err := GenerateToken(userID, username, role, storeID, testSecret)
	if err != nil {
		t.Fatalf("GenerateToken() error = %v", err)
	}

	claims := &UserClaims{}
	parsedToken, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("jwt.ParseWithClaims() error = %v", err)
	}
	if !parsedToken.Valid {
		t.Fatal("parsed token is not valid")
	}

	if claims.ID != userID {
		t.Errorf("ID = %q, want %q", claims.ID, userID)
	}
	if claims.Username != username {
		t.Errorf("Username = %q, want %q", claims.Username, username)
	}
	if claims.Role != role {
		t.Errorf("Role = %q, want %q", claims.Role, role)
	}
	if claims.StoreID != storeID {
		t.Errorf("StoreID = %q, want %q", claims.StoreID, storeID)
	}
}

func TestGenerateToken_Expiry(t *testing.T) {
	tokenStr, err := GenerateToken("user-1", "u", "staff", "s-1", testSecret)
	if err != nil {
		t.Fatalf("GenerateToken() error = %v", err)
	}

	claims := &UserClaims{}
	_, err = jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(testSecret), nil
	})
	if err != nil {
		t.Fatalf("ParseWithClaims() error = %v", err)
	}

	if claims.ExpiresAt == nil {
		t.Fatal("ExpiresAt is nil")
	}

	expiresAt := claims.ExpiresAt.Time
	expectedExpiry := time.Now().Add(24 * time.Hour)
	diff := expectedExpiry.Sub(expiresAt)
	if diff < -5*time.Second || diff > 5*time.Second {
		t.Errorf("token expiry is %v, expected approximately 24h from now", expiresAt)
	}
}

func TestGenerateToken_WrongSecret(t *testing.T) {
	tokenStr, err := GenerateToken("user-1", "u", "staff", "s-1", testSecret)
	if err != nil {
		t.Fatalf("GenerateToken() error = %v", err)
	}

	claims := &UserClaims{}
	_, err = jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte("wrong-secret"), nil
	})
	if err == nil {
		t.Fatal("expected error when verifying with wrong secret, got nil")
	}
}

func TestGenerateToken_SigningMethod(t *testing.T) {
	tokenStr, err := GenerateToken("user-1", "u", "staff", "s-1", testSecret)
	if err != nil {
		t.Fatalf("GenerateToken() error = %v", err)
	}

	parser := jwt.NewParser()
	token, _, err := parser.ParseUnverified(tokenStr, &UserClaims{})
	if err != nil {
		t.Fatalf("ParseUnverified() error = %v", err)
	}

	if token.Method.Alg() != "HS256" {
		t.Errorf("signing method = %q, want HS256", token.Method.Alg())
	}
}

func TestGetUserFromContext_Present(t *testing.T) {
	claims := &UserClaims{
		ID:       "user-test",
		Username: "tester",
		Role:     "admin",
		StoreID:  "store-1",
	}

	ctx := context.WithValue(context.Background(), UserContextKey, claims)
	got, ok := GetUserFromContext(ctx)
	if !ok {
		t.Fatal("GetUserFromContext() returned ok=false, want true")
	}
	if got.ID != "user-test" {
		t.Errorf("ID = %q, want %q", got.ID, "user-test")
	}
	if got.Username != "tester" {
		t.Errorf("Username = %q, want %q", got.Username, "tester")
	}
	if got.Role != "admin" {
		t.Errorf("Role = %q, want %q", got.Role, "admin")
	}
	if got.StoreID != "store-1" {
		t.Errorf("StoreID = %q, want %q", got.StoreID, "store-1")
	}
}

func TestGetUserFromContext_Missing(t *testing.T) {
	ctx := context.Background()
	_, ok := GetUserFromContext(ctx)
	if ok {
		t.Fatal("GetUserFromContext() returned ok=true for empty context, want false")
	}
}

func TestGetUserFromContext_WrongType(t *testing.T) {
	ctx := context.WithValue(context.Background(), UserContextKey, "not-a-claims-struct")
	_, ok := GetUserFromContext(ctx)
	if ok {
		t.Fatal("GetUserFromContext() returned ok=true for wrong type, want false")
	}
}
