package handler

import (
	"net/http"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"cafe-backend/internal/security"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// GetUsers handles GET /api/users
func (h *Handler) GetUsers(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	users, err := h.Repo.User.GetAll(r.Context(), claims.Role, claims.ID, claims.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if users == nil {
		users = []models.User{}
	}

	h.writeJSON(w, http.StatusOK, users)
}

// CreateUser handles POST /api/users
func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" && claims.Role != "business_owner" && claims.Role != "business_admin" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	// Dynamic body parser to read storeIds list
	var raw struct {
		Username string   `json:"username"`
		Password string   `json:"password"`
		Name     string   `json:"name"`
		Email    string   `json:"email"`
		Role     string   `json:"role"`
		StoreID  string   `json:"storeId"`
		StoreIDs []string `json:"storeIds"`
	}

	if err := h.readJSON(r, &raw); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if claims.Role == "business_owner" && raw.Role == "superadmin" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	finalStoreID := raw.StoreID
	if claims.Role == "business_admin" {
		if raw.Role != "business_admin" && raw.Role != "staff" {
			h.writeError(w, http.StatusForbidden, "Business admin can only create Business Admin or Staff roles")
			return
		}
		if raw.StoreID != "" && raw.StoreID != claims.StoreID {
			h.writeError(w, http.StatusForbidden, "Can only assign users to your own store")
			return
		}
		finalStoreID = claims.StoreID
	}

	hashedPassword, err := security.HashPassword(raw.Password)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to hash password")
		return
	}

	u := models.User{
		ID:       uuid.New().String(),
		Username: raw.Username,
		Password: string(hashedPassword),
		Name:     raw.Name,
		Email:    raw.Email,
		Role:     raw.Role,
		StoreID:  finalStoreID,
		IsActive: true,
	}

	err = h.Repo.User.Create(r.Context(), u, raw.StoreIDs)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, models.User{
		ID:       u.ID,
		Username: u.Username,
		Name:     u.Name,
		Email:    u.Email,
		Role:     u.Role,
		StoreID:  u.StoreID,
		IsActive: u.IsActive,
	})
}

// UpdateUser handles PUT /api/users/:id
func (h *Handler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	targetUser, err := h.Repo.User.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if targetUser == nil {
		h.writeError(w, http.StatusNotFound, "User not found")
		return
	}

	if targetUser.Role == "superadmin" && claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	var raw map[string]interface{}
	if err := h.readJSON(r, &raw); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	updates := make(map[string]interface{})
	if val, exists := raw["name"]; exists {
		updates["name"] = val
	}
	if val, exists := raw["email"]; exists {
		updates["email"] = val
	}
	if val, exists := raw["isActive"]; exists {
		updates["is_active"] = val
	}
	if val, exists := raw["storeId"]; exists {
		updates["store_id"] = val
	}
	if claims.Role == "superadmin" {
		if val, exists := raw["role"]; exists {
			updates["role"] = val
		}
	}

	var storeIDs []string
	hasStoreIDs := false
	if sIDsRaw, exists := raw["storeIds"]; exists {
		if sIDsSlice, ok := sIDsRaw.([]interface{}); ok {
			hasStoreIDs = true
			for _, item := range sIDsSlice {
				if s, ok := item.(string); ok {
					storeIDs = append(storeIDs, s)
				}
			}
		}
	}

	err = h.Repo.User.Update(r.Context(), id, updates, storeIDs, hasStoreIDs)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "User updated"})
}

// DeleteUser handles DELETE /api/users/:id
func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if id == claims.ID {
		h.writeError(w, http.StatusBadRequest, "Cannot delete yourself")
		return
	}

	targetUser, err := h.Repo.User.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if targetUser == nil {
		h.writeError(w, http.StatusNotFound, "User not found")
		return
	}

	if targetUser.Role == "superadmin" {
		h.writeError(w, http.StatusForbidden, "Cannot delete superadmin")
		return
	}

	if claims.Role == "business_owner" {
		// Can only delete users in their stores
		stores, errStore := h.Repo.User.GetUserStores(r.Context(), claims.ID)
		if errStore != nil {
			h.writeError(w, http.StatusInternalServerError, errStore.Error())
			return
		}
		hasAccess := false
		for _, s := range stores {
			if s.ID == targetUser.StoreID {
				hasAccess = true
				break
			}
		}
		if !hasAccess && targetUser.ID != claims.ID {
			h.writeError(w, http.StatusForbidden, "Not authorized")
			return
		}
	}

	err = h.Repo.User.Delete(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "User deleted"})
}

// ChangePassword handles POST /api/users/change-password
func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.ChangePasswordRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	u, err := h.Repo.User.GetByID(r.Context(), claims.ID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if u == nil {
		h.writeError(w, http.StatusNotFound, "User not found")
		return
	}

	// Compare current password
	isValid, err := security.VerifyPassword(u.Password, req.CurrentPassword)
	if err != nil || !isValid {
		h.writeError(w, http.StatusUnauthorized, "Current password is incorrect")
		return
	}

	// Hash new password
	hashedPassword, err := security.HashPassword(req.NewPassword)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to hash new password")
		return
	}

	err = h.Repo.User.UpdatePassword(r.Context(), claims.ID, string(hashedPassword))
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Password changed successfully"})
}

// ResetPassword handles POST /api/users/:id/reset-password
func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" && claims.Role != "business_owner" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	var req models.ResetPasswordRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetUser, err := h.Repo.User.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if targetUser == nil {
		h.writeError(w, http.StatusNotFound, "User not found")
		return
	}

	if claims.Role == "business_owner" {
		// Business owner can only reset users in their stores
		stores, errStore := h.Repo.User.GetUserStores(r.Context(), claims.ID)
		if errStore != nil {
			h.writeError(w, http.StatusInternalServerError, errStore.Error())
			return
		}
		hasAccess := false
		for _, s := range stores {
			if s.ID == targetUser.StoreID {
				hasAccess = true
				break
			}
		}
		if !hasAccess && id != claims.ID {
			h.writeError(w, http.StatusForbidden, "Not authorized to reset this user's password")
			return
		}
	}

	if targetUser.Role == "superadmin" && claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Not authorized to reset superadmin password")
		return
	}

	hashedPassword, err := security.HashPassword(req.Password)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to hash new password")
		return
	}

	err = h.Repo.User.UpdatePassword(r.Context(), id, string(hashedPassword))
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Password reset successfully"})
}
