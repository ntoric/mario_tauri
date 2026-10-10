package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"cafe-backend/internal/config"
	"cafe-backend/internal/middleware"
	"cafe-backend/internal/realtime"
	"cafe-backend/internal/repository"
	"cafe-backend/internal/session"
)

type Handler struct {
	Repo     *repository.Repository
	Cfg      *config.Config
	Realtime *realtime.Hub
	Sessions *session.Store
}

func NewHandler(repo *repository.Repository, cfg *config.Config, realtimeHub *realtime.Hub, sessions *session.Store) *Handler {
	return &Handler{Repo: repo, Cfg: cfg, Realtime: realtimeHub, Sessions: sessions}
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

// Store access control helpers

// authorizeStore reports whether the caller is allowed to act on targetStoreID.
// superadmin: any store; business_owner: stores mapped in user_stores;
// business_admin/staff: only the store assigned in their JWT claims.
func (h *Handler) authorizeStore(ctx context.Context, claims *middleware.UserClaims, targetStoreID string) (bool, error) {
	if targetStoreID == "" {
		return false, nil
	}
	switch claims.Role {
	case "superadmin":
		return true, nil
	case "business_owner":
		stores, err := h.Repo.User.GetUserStores(ctx, claims.ID)
		if err != nil {
			return false, err
		}
		for _, s := range stores {
			if s.ID == targetStoreID {
				return true, nil
			}
		}
		return false, nil
	default:
		return claims.StoreID == targetStoreID, nil
	}
}

// requireStoreAccess resolves the effective store ID for a request (the
// request-supplied value, falling back to the JWT store) and verifies the
// caller may access it. It writes the appropriate error response and returns
// ("", false) on failure.
func (h *Handler) requireStoreAccess(w http.ResponseWriter, r *http.Request, claims *middleware.UserClaims, requestedStoreID string) (string, bool) {
	targetStoreID := requestedStoreID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}
	if targetStoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
		return "", false
	}
	allowed, err := h.authorizeStore(r.Context(), claims, targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return "", false
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return "", false
	}
	return targetStoreID, true
}

// recordStoreAccess fetches the store_id of the record (table, id) and
// verifies the caller may access that store. It writes the appropriate error
// response and returns ("", false) when the record is missing or not
// accessible. On success it returns the record's store ID so callers can
// validate related foreign keys against the same store.
// table must be one of the whitelisted store-scoped tables supported by
// Repository.GetRecordStoreID.
func (h *Handler) recordStoreAccess(w http.ResponseWriter, r *http.Request, claims *middleware.UserClaims, table, id string) (string, bool) {
	storeID, err := h.Repo.GetRecordStoreID(r.Context(), table, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			h.writeError(w, http.StatusNotFound, "Record not found")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return "", false
	}
	allowed, err := h.authorizeStore(r.Context(), claims, storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return "", false
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return "", false
	}
	return storeID, true
}

// requireRecordStoreAccess is the boolean variant of recordStoreAccess for
// handlers that only need the access check.
func (h *Handler) requireRecordStoreAccess(w http.ResponseWriter, r *http.Request, claims *middleware.UserClaims, table, id string) bool {
	_, ok := h.recordStoreAccess(w, r, claims, table, id)
	return ok
}

// requireRecordBelongsToStore verifies that a referenced record (table, id)
// exists and belongs to expectedStoreID. Used to prevent cross-store
// foreign-key references such as an order pointing at another store's table.
// Writes an error response and returns false on failure.
func (h *Handler) requireRecordBelongsToStore(w http.ResponseWriter, r *http.Request, table, id, expectedStoreID, label string) bool {
	storeID, err := h.Repo.GetRecordStoreID(r.Context(), table, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			h.writeError(w, http.StatusBadRequest, "Invalid "+label)
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return false
	}
	if storeID != expectedStoreID {
		h.writeError(w, http.StatusForbidden, label+" belongs to a different store")
		return false
	}
	return true
}
