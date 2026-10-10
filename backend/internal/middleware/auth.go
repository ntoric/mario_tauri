package middleware

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"cafe-backend/internal/session"
)

type contextKey string

const UserContextKey contextKey = "user"

type UserClaims struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	StoreID  string `json:"store_id"` // Matches Node.js casing (store_id)
}

// AuthMiddleware intercepts requests and validates Bearer session tokens
// against the server-side session store in Redis.
func AuthMiddleware(db *sql.DB, sessions *session.Store) func(http.Handler) http.Handler {
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

			if sessions == nil {
				http.Error(w, `{"error": "Session store unavailable"}`, http.StatusServiceUnavailable)
				return
			}

			data, err := sessions.Get(r.Context(), tokenString)
			if err != nil {
				http.Error(w, `{"error": "Invalid or expired session"}`, http.StatusUnauthorized)
				return
			}

			claims := &UserClaims{
				ID:       data.UserID,
				Username: data.Username,
				Role:     data.Role,
				StoreID:  data.StoreID,
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

// GetUserFromContext extracts user claims from context
func GetUserFromContext(ctx context.Context) (*UserClaims, bool) {
	claims, ok := ctx.Value(UserContextKey).(*UserClaims)
	return claims, ok
}
