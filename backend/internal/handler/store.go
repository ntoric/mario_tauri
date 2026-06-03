package handler

import (
	"net/http"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// GetDefaultStore handles GET /api/stores/default (Public)
func (h *Handler) GetDefaultStore(w http.ResponseWriter, r *http.Request) {
	s, err := h.Repo.Store.GetDefaultStore(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		h.writeError(w, http.StatusNotFound, "No stores found")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":      s.ID,
		"name":    s.Name,
		"branch":  s.Branch,
		"logoUrl": s.LogoURL,
	})
}

// GetStores handles GET /api/stores (Protected)
func (h *Handler) GetStores(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	stores, err := h.Repo.Store.GetAll(r.Context(), claims.Role, claims.ID, claims.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if stores == nil {
		stores = []models.Store{}
	}

	h.writeJSON(w, http.StatusOK, stores)
}

// GetStore handles GET /api/stores/:id
func (h *Handler) GetStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	s, err := h.Repo.Store.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		h.writeError(w, http.StatusNotFound, "Store not found")
		return
	}

	h.writeJSON(w, http.StatusOK, s)
}

// CreateStore handles POST /api/stores
func (h *Handler) CreateStore(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" && claims.Role != "business_owner" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	var req models.Store
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	req.ID = uuid.New().String()
	if req.InvoiceSize == "" {
		req.InvoiceSize = "3inch"
	}
	req.IsActive = true

	// Replicating database write and business_owner auto-assignment
	err := h.Repo.Store.Create(r.Context(), req)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if claims.Role == "business_owner" {
		// Map new store to this owner under user_stores
		errAssign := h.Repo.User.Update(r.Context(), claims.ID, nil, []string{req.ID}, true)
		if errAssign != nil {
			logWarn := "Failed to auto-assign store to business owner under user_stores: " + errAssign.Error()
			h.writeJSON(w, http.StatusCreated, map[string]interface{}{
				"id":      req.ID,
				"name":    req.Name,
				"warning": logWarn,
			})
			return
		}
	}

	h.writeJSON(w, http.StatusCreated, req)
}

// UpdateStore handles PUT /api/stores/:id
func (h *Handler) UpdateStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Verify permissions
	if claims.Role == "business_owner" {
		// Verify ownership of this store ID
		stores, err := h.Repo.User.GetUserStores(r.Context(), claims.ID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		owned := false
		for _, s := range stores {
			if s.ID == id {
				owned = true
				break
			}
		}
		if !owned {
			h.writeError(w, http.StatusForbidden, "Not authorized")
			return
		}
	} else if claims.Role == "business_admin" || claims.Role == "staff" {
		if claims.StoreID != id {
			h.writeError(w, http.StatusForbidden, "Not authorized to update this store")
			return
		}
	} else if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	// Read unstructured JSON to build the update map
	var raw map[string]interface{}
	if err := h.readJSON(r, &raw); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	// Convert camelCase JSON tags to snake_case column names
	updates := make(map[string]interface{})
	keyMapping := map[string]string{
		"name":              "name",
		"branch":            "branch",
		"location":          "location",
		"gstin":             "gstin",
		"fssaiNo":           "fssai_no",
		"phone":             "phone",
		"printerName":       "printer_name",
		"printerVendorId":   "printer_vendor_id",
		"printerProductId":  "printer_product_id",
		"invoiceSize":       "invoice_size",
		"kotPrintEnabled":   "kot_print_enabled",
		"remoteBillingEnabled": "remote_billing_enabled",
		"isActive":          "is_active",
	}

	for jsonKey, sqlCol := range keyMapping {
		if val, exists := raw[jsonKey]; exists {
			updates[sqlCol] = val
		}
	}

	if err := h.Repo.Store.Update(r.Context(), id, updates); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Store updated"})
}

// DeleteStore handles DELETE /api/stores/:id
func (h *Handler) DeleteStore(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	if err := h.Repo.Store.Delete(r.Context(), id); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Store deleted"})
}

// SwitchStore handles POST /api/stores/switch
func (h *Handler) SwitchStore(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.SwitchStoreRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	hasAccess := false
	if claims.Role == "superadmin" {
		hasAccess = true
	} else if claims.Role == "business_owner" {
		stores, err := h.Repo.User.GetUserStores(r.Context(), claims.ID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, s := range stores {
			if s.ID == req.StoreID {
				hasAccess = true
				break
			}
		}
	} else {
		hasAccess = claims.StoreID == req.StoreID
	}

	if !hasAccess {
		h.writeError(w, http.StatusForbidden, "Access denied to this store")
		return
	}

	s, err := h.Repo.Store.GetByID(r.Context(), req.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if s == nil {
		h.writeError(w, http.StatusNotFound, "Store not found")
		return
	}

	h.writeJSON(w, http.StatusOK, models.SwitchStoreResponse{Store: *s})
}

// UploadLogo handles POST /api/stores/:id/logo
func (h *Handler) UploadLogo(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.UploadLogoRequest
	if err := h.readJSON(r, &req); err != nil || req.LogoBase64 == "" {
		h.writeError(w, http.StatusBadRequest, "Logo data is required")
		return
	}

	// Verify permission
	if claims.Role == "business_owner" {
		stores, err := h.Repo.User.GetUserStores(r.Context(), claims.ID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		owned := false
		for _, s := range stores {
			if s.ID == id {
				owned = true
				break
			}
		}
		if !owned {
			h.writeError(w, http.StatusForbidden, "Not authorized")
			return
		}
	} else if claims.Role != "superadmin" && claims.Role != "business_admin" && claims.Role != "staff" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	if err := h.Repo.Store.UpdateLogo(r.Context(), id, req.LogoBase64); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, models.UploadLogoResponse{Success: true, LogoURL: req.LogoBase64})
}

// DeleteLogo handles DELETE /api/stores/:id/logo
func (h *Handler) DeleteLogo(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Verify permission
	if claims.Role == "business_owner" {
		stores, err := h.Repo.User.GetUserStores(r.Context(), claims.ID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		owned := false
		for _, s := range stores {
			if s.ID == id {
				owned = true
				break
			}
		}
		if !owned {
			h.writeError(w, http.StatusForbidden, "Not authorized")
			return
		}
	} else if claims.Role != "superadmin" && claims.Role != "business_admin" && claims.Role != "staff" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	if err := h.Repo.Store.DeleteLogo(r.Context(), id); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
