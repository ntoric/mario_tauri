package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"cafe-backend/internal/config"
	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
	"cafe-backend/internal/realtime"
	"cafe-backend/internal/repository"
)

type Handler struct {
	Repo     *repository.Repository
	Cfg      *config.Config
	Realtime *realtime.Hub
}

func NewHandler(repo *repository.Repository, cfg *config.Config, realtimeHub *realtime.Hub) *Handler {
	return &Handler{Repo: repo, Cfg: cfg, Realtime: realtimeHub}
}

// JSON helpers to reduce boilerplate and guarantee standardized casing

func (h *Handler) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		// Log error or fall back
		http.Error(w, `{"error": "Internal Server Error"}`, http.StatusInternalServerError)
	}
}

func (h *Handler) writeError(w http.ResponseWriter, status int, errMsg string) {
	h.writeJSON(w, status, map[string]string{"error": errMsg})
}

func (h *Handler) readJSON(r *http.Request, data interface{}) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(data)
}

// resolveStoreID extracts the target store ID from the query parameter or JWT claims.
// For GET requests it reads "storeId" from the query string; for non-GET requests the
// caller should pass the storeID from the request body. If the resolved ID is empty,
// an error response is written and false is returned.
func (h *Handler) resolveStoreID(w http.ResponseWriter, r *http.Request, claims *middleware.UserClaims, bodyStoreID string) (string, bool) {
	storeID := bodyStoreID
	if storeID == "" {
		storeID = r.URL.Query().Get("storeId")
	}
	if storeID == "" {
		storeID = claims.StoreID
	}
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
		return "", false
	}
	return storeID, true
}

// getUserStores returns the stores visible to a user based on their role.
func (h *Handler) getUserStores(ctx context.Context, user *models.User) ([]models.Store, error) {
	switch user.Role {
	case "superadmin":
		return h.Repo.Store.GetAll(ctx, "superadmin", "", "")
	case "business_owner":
		return h.Repo.User.GetUserStores(ctx, user.ID)
	default:
		if user.StoreID != "" {
			s, err := h.Repo.Store.GetByID(ctx, user.StoreID)
			if err != nil {
				return nil, err
			}
			if s != nil {
				return []models.Store{*s}, nil
			}
		}
		return nil, nil
	}
}
