package middleware

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const UserContextKey contextKey = "user"

type UserClaims struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	StoreID  string `json:"store_id"` // Matches Node.js casing (store_id)
	jwt.RegisteredClaims
}

// GenerateToken creates a new JWT token for a user
func GenerateToken(userID, username, role, storeID, secretKey string) (string, error) {
	claims := UserClaims{
		ID:       userID,
		Username: username,
		Role:     role,
		StoreID:  storeID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secretKey))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// AuthMiddleware intercepts requests and validates Bearer JWT tokens
func AuthMiddleware(db *sql.DB, secretKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			tokenString := ""
			if authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
					http.Error(w, `{"error": "Invalid authorization header format"}`, http.StatusUnauthorized)
					return
				}
				tokenString = parts[1]
			} else if r.URL.Path == "/api/ws/tables-status" {
				tokenString = r.URL.Query().Get("token")
			}
			if tokenString == "" {
				http.Error(w, `{"error": "Access denied. No token provided."}`, http.StatusUnauthorized)
				return
			}
			claims := &UserClaims{}

			token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, errors.New("unexpected signing method")
				}
				return []byte(secretKey), nil
			})

			if err != nil || !token.Valid {
				http.Error(w, `{"error": "Invalid token"}`, http.StatusUnauthorized)
				return
			}

			// Verify user exists and is active in database
			var exists bool
			err = db.QueryRowContext(r.Context(), "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND is_active = true)", claims.ID).Scan(&exists)
			if err != nil || !exists {
				http.Error(w, `{"error": "Unauthorized: User not found or inactive"}`, http.StatusUnauthorized)
				return
			}

			// Add user claims to request context
			ctx := context.WithValue(r.Context(), UserContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserFromContext extracts JWT claims from context
func GetUserFromContext(ctx context.Context) (*UserClaims, bool) {
	claims, ok := ctx.Value(UserContextKey).(*UserClaims)
	return claims, ok
}
