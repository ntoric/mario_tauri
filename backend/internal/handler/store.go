package handler

import (
	"encoding/json"
	"io"
	"math"
	"net/http"
	"strings"

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
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	allowed, err := h.authorizeStore(r.Context(), claims, id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return
	}

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

	// Read the body once into a buffer so it can be decoded twice: once into
	// the typed Store struct and once into a raw map for GST field
	// validation. Tax is opt-in — taxEnabled defaults to false (Go's bool
	// zero value) when the client does not send it.
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}
	r.Body.Close()

	var req models.Store
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	// GST field validation/normalization for new stores.
	rawStore := map[string]interface{}{}
	_ = json.Unmarshal(bodyBytes, &rawStore)
	norm, errMsg := validateGSTStoreFields(rawStore, nil)
	if errMsg != "" {
		h.writeError(w, http.StatusBadRequest, errMsg)
		return
	}
	if v, ok := norm["gstin"]; ok {
		req.GSTIN, _ = v.(string)
	}
	if v, ok := norm["state_code"]; ok {
		req.StateCode, _ = v.(string)
	}
	if v, ok := norm["gst_registration_type"]; ok {
		req.GSTRegistrationType, _ = v.(string)
	}
	if v, ok := norm["invoice_prefix"]; ok {
		req.InvoicePrefix, _ = v.(string)
	}
	if v, ok := norm["credit_note_prefix"]; ok {
		req.CreditNotePrefix, _ = v.(string)
	}
	if v, ok := norm["default_sac_code"]; ok {
		req.DefaultSACCode, _ = v.(string)
	}
	if req.GSTRegistrationType == "" {
		req.GSTRegistrationType = "regular"
	}

	// Data retention is configured by superadmin only — a store role must
	// not be able to set (or clear) the period its own history is hidden.
	if claims.Role != "superadmin" {
		req.DataRetentionDays = 0
	} else if req.DataRetentionDays < 0 {
		h.writeError(w, http.StatusBadRequest, "dataRetentionDays must be a non-negative integer")
		return
	}

	req.ID = uuid.New().String()
	if req.InvoiceSize == "" {
		req.InvoiceSize = "3inch"
	}
	req.IsActive = true

	// Replicating database write and business_owner auto-assignment
	err = h.Repo.Store.Create(r.Context(), req)
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
		"name":                  "name",
		"branch":                "branch",
		"location":              "location",
		"gstin":                 "gstin",
		"fssaiNo":               "fssai_no",
		"phone":                 "phone",
		"printerName":           "printer_name",
		"printerVendorId":       "printer_vendor_id",
		"printerProductId":      "printer_product_id",
		"invoiceSize":           "invoice_size",
		"kotPrintEnabled":       "kot_print_enabled",
		"remoteBillingEnabled":  "remote_billing_enabled",
		"remotePrinterDeviceId": "remote_printer_device_id",
		"isActive":              "is_active",
		"themeColor":            "theme_color",
		"taxEnabled":            "tax_enabled",
		"defaultTaxPercent":     "default_tax_percent",
		"gstRegistrationType":   "gst_registration_type",
		"stateCode":             "state_code",
		"pricesIncludeTax":      "prices_include_tax",
		"invoicePrefix":         "invoice_prefix",
		"creditNotePrefix":      "credit_note_prefix",
		"defaultSacCode":        "default_sac_code",
		"swiggyGstin":           "swiggy_gstin",
		"zomatoGstin":           "zomato_gstin",
		"otherEcoGstin":         "other_eco_gstin",
		"dataRetentionDays":     "data_retention_days",
	}

	// Data retention is configured by superadmin only. Dropping the key for
	// other roles both prevents privilege escalation and keeps older clients
	// that echo the full store object working unchanged.
	if claims.Role != "superadmin" {
		delete(raw, "dataRetentionDays")
	} else if v, exists := raw["dataRetentionDays"]; exists {
		n, ok := v.(float64)
		if !ok || n < 0 || n != math.Trunc(n) {
			h.writeError(w, http.StatusBadRequest, "dataRetentionDays must be a non-negative integer")
			return
		}
	}

	// GST field validation runs against the store as it would look after the
	// update (resolved values), so e.g. adding a registration type can check
	// the existing GSTIN.
	var existing *models.Store
	if has(raw, "gstin") || has(raw, "gstRegistrationType") || has(raw, "stateCode") ||
		has(raw, "invoicePrefix") || has(raw, "creditNotePrefix") || has(raw, "defaultSacCode") ||
		has(raw, "swiggyGstin") || has(raw, "zomatoGstin") || has(raw, "otherEcoGstin") {
		var err error
		existing, err = h.Repo.Store.GetByID(r.Context(), id)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if existing == nil {
			h.writeError(w, http.StatusNotFound, "Store not found")
			return
		}
		norm, errMsg := validateGSTStoreFields(raw, existing)
		if errMsg != "" {
			h.writeError(w, http.StatusBadRequest, errMsg)
			return
		}
		// Feed normalized values back under their JSON keys.
		colToJSON := map[string]string{
			"gstin":                 "gstin",
			"state_code":            "stateCode",
			"gst_registration_type": "gstRegistrationType",
			"invoice_prefix":        "invoicePrefix",
			"credit_note_prefix":    "creditNotePrefix",
			"default_sac_code":      "defaultSacCode",
			"swiggy_gstin":          "swiggyGstin",
			"zomato_gstin":          "zomatoGstin",
			"other_eco_gstin":       "otherEcoGstin",
		}
		for col, jsonKey := range colToJSON {
			if v, ok := norm[col]; ok {
				raw[jsonKey] = v
			}
		}
	}

	for jsonKey, sqlCol := range keyMapping {
		if val, exists := raw[jsonKey]; exists {
			updates[sqlCol] = val
		}
	}
	updates["modified_by"] = claims.ID

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
	} else if claims.Role == "business_admin" || claims.Role == "staff" {
		if claims.StoreID != id {
			h.writeError(w, http.StatusForbidden, "Not authorized for this store")
			return
		}
	} else if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	if err := h.Repo.Store.UpdateLogo(r.Context(), id, req.LogoBase64, claims.ID); err != nil {
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
	} else if claims.Role == "business_admin" || claims.Role == "staff" {
		if claims.StoreID != id {
			h.writeError(w, http.StatusForbidden, "Not authorized for this store")
			return
		}
	} else if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	if err := h.Repo.Store.DeleteLogo(r.Context(), id, claims.ID); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ReportAppVersion handles POST /api/auth/app-version — records which desktop
// app version the caller's store is running. Older servers return 404, which
// newer clients ignore — backward compatible both ways.
func (h *Handler) ReportAppVersion(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		Version string `json:"version"`
		StoreID string `json:"storeId"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request payload")
		return
	}

	version := strings.TrimSpace(req.Version)
	if version == "" {
		h.writeError(w, http.StatusBadRequest, "version is required")
		return
	}
	if len(version) > 64 {
		version = version[:64]
	}

	// Resolve the store to stamp: the JWT store_id by default, or an explicit
	// storeId when the caller is allowed to act on behalf of that store
	// (superadmin: any; business_owner: an owned store; others: only their own).
	storeID := claims.StoreID
	if req.StoreID != "" && req.StoreID != storeID {
		allowed := false
		switch claims.Role {
		case "superadmin":
			allowed = true
		case "business_owner":
			stores, err := h.Repo.User.GetUserStores(r.Context(), claims.ID)
			if err != nil {
				h.writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			for _, s := range stores {
				if s.ID == req.StoreID {
					allowed = true
					break
				}
			}
		}
		if !allowed {
			h.writeError(w, http.StatusForbidden, "Not authorized for this store")
			return
		}
		storeID = req.StoreID
	}
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "No active store")
		return
	}

	if err := h.Repo.Store.UpdateAppVersion(r.Context(), storeID, version, claims.ID); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, map[string]string{"message": "ok"})
}
