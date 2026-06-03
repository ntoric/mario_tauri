package handler

import (
	"net/http"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
	"cafe-backend/internal/security"
)

// Login handles POST /api/auth/login
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	user, err := h.Repo.User.GetByUsername(r.Context(), req.Username)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if user == nil {
		h.writeError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Compare passwords (PBKDF2 or legacy bcrypt)
	isValid, err := security.VerifyPassword(user.Password, req.Password)
	if err != nil || !isValid {
		h.writeError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	// Get user's stores
	var stores []models.Store
	if user.Role == "superadmin" {
		// Superadmin sees all active stores
		stores, err = h.Repo.Store.GetAll(r.Context(), "superadmin", "", "")
	} else if user.Role == "business_owner" {
		// Business owner sees assigned stores
		stores, err = h.Repo.User.GetUserStores(r.Context(), user.ID)
	} else {
		// Business admin and staff see their assigned store only
		if user.StoreID != "" {
			s, errStore := h.Repo.Store.GetByID(r.Context(), user.StoreID)
			if errStore != nil {
				err = errStore
			} else if s != nil {
				stores = []models.Store{*s}
			}
		}
	}

	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to load user stores: "+err.Error())
		return
	}

	// Generate JWT token
	token, err := middleware.GenerateToken(user.ID, user.Username, user.Role, user.StoreID, h.Cfg.JWTSecret)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to generate token: "+err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, models.LoginResponse{
		Token: token,
		User: models.UserSummary{
			ID:        user.ID,
			Username:  user.Username,
			Name:      user.Name,
			Email:     user.Email,
			Role:      user.Role,
			StoreID:   user.StoreID,
			StoreName: user.StoreName,
			Stores:    stores,
			IsActive:  user.IsActive,
		},
	})
}

// Me handles GET /api/auth/me (Protected Route)
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := h.Repo.User.GetByID(r.Context(), claims.ID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if user == nil {
		h.writeError(w, http.StatusNotFound, "User not found")
		return
	}

	// Get user's stores
	var stores []models.Store
	if user.Role == "superadmin" {
		stores, err = h.Repo.Store.GetAll(r.Context(), "superadmin", "", "")
	} else if user.Role == "business_owner" {
		stores, err = h.Repo.User.GetUserStores(r.Context(), user.ID)
	} else if user.StoreID != "" {
		s, errStore := h.Repo.Store.GetByID(r.Context(), user.StoreID)
		if errStore != nil {
			err = errStore
		} else if s != nil {
			stores = []models.Store{*s}
		}
	}

	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to load user stores: "+err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, models.UserSummary{
		ID:        user.ID,
		Username:  user.Username,
		Name:      user.Name,
		Email:     user.Email,
		Role:      user.Role,
		StoreID:   user.StoreID,
		StoreName: user.StoreName,
		Stores:    stores,
		IsActive:  user.IsActive,
	})
}
