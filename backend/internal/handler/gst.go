package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"cafe-backend/internal/gst"
	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
	"cafe-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

// orderWithBill is the order JSON plus the issued bill — keeps the response
// backward compatible for clients that only read the order fields.
type orderWithBill struct {
	models.Order
	Bill *models.Bill `json:"bill,omitempty"`
}

// writeIssueError maps repository domain errors to HTTP statuses.
func (h *Handler) writeIssueError(w http.ResponseWriter, err error) {
	var badReq *repository.BadRequestError
	var conflict *repository.ConflictError
	switch {
	case errors.As(err, &badReq):
		h.writeError(w, http.StatusBadRequest, badReq.Msg)
	case errors.As(err, &conflict):
		h.writeError(w, http.StatusConflict, conflict.Msg)
	default:
		h.writeError(w, http.StatusInternalServerError, err.Error())
	}
}

// issueBill loads the store and issues (or returns the existing) bill for an
// order through the unified GST pipeline. Writes the error response and
// returns ("", nil, false) on failure.
func (h *Handler) issueBill(w http.ResponseWriter, r *http.Request, storeID, orderID string, opts repository.IssueOptions) (*models.Bill, bool) {
	store, err := h.Repo.Store.GetByID(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return nil, false
	}
	if store == nil {
		h.writeError(w, http.StatusNotFound, "Store not found")
		return nil, false
	}
	bill, err := h.Repo.Bill.IssueBill(r.Context(), store, orderID, opts)
	if err != nil {
		h.writeIssueError(w, err)
		return nil, false
	}
	return bill, true
}

// validOrderSource validates and normalizes an order_source value.
func validOrderSource(s string) (string, bool) {
	if s == "" {
		return gst.SourcePOS, true
	}
	return s, gst.ValidOrderSource(s)
}

// ==========================================
// GST META / PREVIEW / BILL FETCH
// ==========================================

// GetGSTMeta handles GET /api/gst/meta — static reference data for GST forms.
func (h *Handler) GetGSTMeta(w http.ResponseWriter, r *http.Request) {
	states := make([]map[string]interface{}, 0, len(gst.States))
	for _, s := range gst.States {
		states = append(states, map[string]interface{}{
			"code": s.Code, "name": s.Name, "utgst": s.UTGST,
		})
	}
	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"states":            states,
		"rates":             gst.AllowedRates,
		"taxCategories":     []string{gst.TaxCategoryTaxable, gst.TaxCategoryNilRated, gst.TaxCategoryExempt, gst.TaxCategoryNonGST},
		"registrationTypes": []string{gst.RegistrationRegular, gst.RegistrationComposition, gst.RegistrationUnregistered},
		"orderSources": []map[string]string{
			{"id": gst.SourcePOS, "label": "Counter / POS"},
			{"id": gst.SourceSwiggy, "label": "Swiggy"},
			{"id": gst.SourceZomato, "label": "Zomato"},
			{"id": gst.SourceOther, "label": "Other e-commerce"},
		},
	})
}

// GetBillByID handles GET /api/bills/{id} — returns a bill with GST lines.
func (h *Handler) GetBillByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	if !h.requireRecordStoreAccess(w, r, claims, "bills", id) {
		return
	}
	bill, err := h.Repo.Bill.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if bill == nil {
		h.writeError(w, http.StatusNotFound, "Bill not found")
		return
	}
	visible, err := h.visibleAt(r.Context(), claims, bill.StoreID, bill.GeneratedAt)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !visible {
		h.writeError(w, http.StatusNotFound, "Bill not found")
		return
	}
	h.writeJSON(w, http.StatusOK, bill)
}

// PreviewBill handles POST /api/bills/preview — runs the GST computation for
// an order or an ad-hoc item list without issuing a document number.
func (h *Handler) PreviewBill(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		StoreID        string  `json:"storeId"`
		OrderID        string  `json:"orderId"`
		Discount       float64 `json:"discount"`
		BuyerGSTIN     string  `json:"buyerGstin"`
		BuyerStateCode string  `json:"buyerStateCode"`
		OrderSource    string  `json:"orderSource"`
		Items          []struct {
			ItemID    string  `json:"itemId"`
			Quantity  float64 `json:"quantity"`
			UnitPrice float64 `json:"unitPrice"`
		} `json:"items"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}
	store, err := h.Repo.Store.GetByID(r.Context(), targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if store == nil {
		h.writeError(w, http.StatusNotFound, "Store not found")
		return
	}

	var inputs []gst.LineInput
	orderSource := req.OrderSource
	if req.OrderID != "" {
		var err error
		inputs, orderSource, err = h.Repo.Bill.OrderLineInputs(r.Context(), store, req.OrderID)
		if err != nil {
			h.writeIssueError(w, err)
			return
		}
		if req.OrderSource != "" {
			orderSource = req.OrderSource
		}
	} else {
		for _, it := range req.Items {
			item, err := h.Repo.Item.GetByID(r.Context(), it.ItemID)
			if err != nil {
				h.writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if item == nil || item.StoreID != targetStoreID {
				h.writeError(w, http.StatusBadRequest, "Invalid item "+it.ItemID)
				return
			}
			price := it.UnitPrice
			if price == 0 {
				price = item.Price
			}
			hsn := item.HSNCode
			if hsn == "" {
				hsn = store.DefaultSACCode
			}
			if hsn == "" {
				hsn = "996331"
			}
			cat := item.TaxCategory
			if cat == "" {
				cat = gst.TaxCategoryTaxable
			}
			inputs = append(inputs, gst.LineInput{
				ItemID: item.ID, Name: item.Name, HSN: hsn,
				Quantity: it.Quantity, UnitPrice: price,
				TaxRate: item.TaxPercent, TaxCategory: cat,
			})
		}
	}
	if len(inputs) == 0 {
		h.writeError(w, http.StatusBadRequest, "No items to compute")
		return
	}

	regType := store.GSTRegistrationType
	if regType == "" {
		regType = gst.RegistrationRegular
	}
	res, err := gst.Compute(gst.Input{
		Store: gst.StoreProfile{
			RegistrationType: regType,
			TaxEnabled:       store.TaxEnabled,
			PricesIncludeTax: store.PricesIncludeTax,
			StateCode:        store.StateCode,
			GSTIN:            store.GSTIN,
		},
		Lines:    inputs,
		Discount: req.Discount,
		Buyer: gst.Buyer{
			GSTIN:     req.BuyerGSTIN,
			StateCode: req.BuyerStateCode,
		},
		OrderSource: orderSource,
	})
	if err != nil {
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, res)
}

// ==========================================
// CREDIT NOTES
// ==========================================

// CreateCreditNote handles POST /api/bills/{id}/credit-notes.
func (h *Handler) CreateCreditNote(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role == "staff" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	billID := chi.URLParam(r, "id")

	var req struct {
		Reason string                           `json:"reason"`
		Lines  []repository.CreditNoteLineInput `json:"lines"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if req.Reason == "" {
		h.writeError(w, http.StatusBadRequest, "reason is required")
		return
	}

	storeID, ok := h.recordStoreAccess(w, r, claims, "bills", billID)
	if !ok {
		return
	}
	store, err := h.Repo.Store.GetByID(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if store == nil {
		h.writeError(w, http.StatusNotFound, "Store not found")
		return
	}
	if !store.TaxEnabled {
		h.writeError(w, http.StatusForbidden, "Tax is disabled for this store")
		return
	}

	cn, err := h.Repo.Bill.CreateCreditNote(r.Context(), store, billID, req.Reason, req.Lines, claims.ID)
	if err != nil {
		h.writeIssueError(w, err)
		return
	}
	h.writeJSON(w, http.StatusCreated, cn)
}

// GetCreditNotes handles GET /api/credit-notes?storeId&startDate&endDate.
func (h *Handler) GetCreditNotes(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}
	cutoff, err := h.retentionCutoff(r.Context(), claims, targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	cns, err := h.Repo.Bill.GetCreditNotes(r.Context(), targetStoreID,
		clampStart(parseISTDateQuery(r, "startDate", false), cutoff), parseISTDateQuery(r, "endDate", true),
		r.URL.Query().Get("billId"))
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if cns == nil {
		cns = []models.CreditNote{}
	}
	h.writeJSON(w, http.StatusOK, cns)
}

// GetCreditNoteByID handles GET /api/credit-notes/{id}.
func (h *Handler) GetCreditNoteByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	cn, err := h.Repo.Bill.GetCreditNoteByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if cn == nil {
		h.writeError(w, http.StatusNotFound, "Credit note not found")
		return
	}
	allowed, err := h.authorizeStore(r.Context(), claims, cn.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return
	}
	visible, err := h.visibleAt(r.Context(), claims, cn.StoreID, cn.IssuedAt)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !visible {
		h.writeError(w, http.StatusNotFound, "Credit note not found")
		return
	}
	h.writeJSON(w, http.StatusOK, cn)
}

// checkCancelGuard returns a conflict error when the order's active GST bill
// belongs to an earlier return period (different IST month), nil otherwise.
func (h *Handler) checkCancelGuard(r *http.Request, orderID string) error {
	bill, err := h.Repo.Bill.GetActiveByOrderID(r.Context(), orderID)
	if err != nil {
		return err
	}
	if bill == nil || bill.FY == "" {
		return nil
	}
	now := time.Now().In(gst.IST)
	gen := bill.GeneratedAt.In(gst.IST)
	if gen.Year() != now.Year() || gen.Month() != now.Month() {
		return &repository.ConflictError{
			Msg: "This invoice belongs to a previous return period. Issue a credit note instead.",
		}
	}
	return nil
}

// validateGSTStoreFields validates GST-related store fields present in a
// create/update payload. raw is the JSON field map (empty string/absent
// handled), existing the current store (nil on create). Returns the
// normalized column values to persist, or an error message for 400.
func validateGSTStoreFields(raw map[string]interface{}, existing *models.Store) (map[string]interface{}, string) {
	norm := map[string]interface{}{}

	resolvedGSTIN := ""
	resolvedState := ""
	resolvedReg := "regular"
	if existing != nil {
		resolvedGSTIN = existing.GSTIN
		resolvedState = existing.StateCode
		resolvedReg = existing.GSTRegistrationType
		if resolvedReg == "" {
			resolvedReg = "regular"
		}
	}

	gstinTouched := false
	if v, ok := raw["gstin"]; ok {
		gstinTouched = true
		s, _ := v.(string)
		s = gst.NormalizeGSTIN(s)
		if s != "" {
			if err := gst.ValidateGSTIN(s); err != nil {
				return nil, "Invalid GSTIN: " + err.Error()
			}
		}
		resolvedGSTIN = s
		norm["gstin"] = s
	}
	if v, ok := raw["stateCode"]; ok {
		s, _ := v.(string)
		s = strings.ToUpper(strings.TrimSpace(s))
		if s != "" && !gst.ValidStateCode(s) {
			return nil, "Invalid stateCode " + s
		}
		resolvedState = s
		norm["state_code"] = s
	}
	if v, ok := raw["gstRegistrationType"]; ok {
		s, _ := v.(string)
		if s == "" {
			s = "regular"
		}
		if !gst.ValidRegistrationType(s) {
			return nil, "Invalid gstRegistrationType " + s
		}
		resolvedReg = s
		norm["gst_registration_type"] = s
	}
	for _, pair := range [][2]string{{"invoicePrefix", "invoice_prefix"}, {"creditNotePrefix", "credit_note_prefix"}} {
		if v, ok := raw[pair[0]]; ok {
			s, _ := v.(string)
			s = strings.ToUpper(strings.TrimSpace(s))
			if s != "" && !gst.ValidPrefix(s) {
				return nil, "Invalid " + pair[0] + " (1-5 chars of A-Z 0-9 -)"
			}
			norm[pair[1]] = s
		}
	}
	for _, pair := range [][2]string{{"swiggyGstin", "swiggy_gstin"}, {"zomatoGstin", "zomato_gstin"}, {"otherEcoGstin", "other_eco_gstin"}} {
		if v, ok := raw[pair[0]]; ok {
			s, _ := v.(string)
			s = gst.NormalizeGSTIN(s)
			if s != "" {
				if err := gst.ValidateECOGSTIN(s); err != nil {
					return nil, "Invalid " + pair[0] + ": " + err.Error()
				}
			}
			norm[pair[1]] = s
		}
	}
	if v, ok := raw["defaultSacCode"]; ok {
		s, _ := v.(string)
		s = strings.TrimSpace(s)
		if s != "" && !validHSNLen(s) {
			return nil, "Invalid defaultSacCode (4, 6 or 8 digits)"
		}
		norm["default_sac_code"] = s
	}

	// GSTIN ↔ state code consistency: when a GSTIN is set and no explicit
	// state code came with the request, derive it from the GSTIN; when both
	// were supplied, they must agree.
	if resolvedGSTIN != "" {
		if _, ok := raw["stateCode"]; !ok {
			norm["state_code"] = resolvedGSTIN[:2]
			resolvedState = resolvedGSTIN[:2]
		} else if resolvedState != resolvedGSTIN[:2] {
			return nil, "stateCode does not match the GSTIN state prefix"
		}
	}

	// Changing registration to a tax-paying type requires a valid GSTIN on
	// the resulting store. Legacy stores already in that state and not being
	// touched are left alone, and so are stores with tax switched off.
	taxEnabled := existing != nil && existing.TaxEnabled
	if v, ok := raw["taxEnabled"].(bool); ok {
		taxEnabled = v
	}
	if taxEnabled && (gstinTouched || has(raw, "gstRegistrationType")) &&
		(resolvedReg == gst.RegistrationRegular || resolvedReg == gst.RegistrationComposition) &&
		gst.ValidateGSTIN(resolvedGSTIN) != nil {
		return nil, "A valid GSTIN is required for registration type " + resolvedReg
	}

	return norm, ""
}

func has(m map[string]interface{}, k string) bool {
	_, ok := m[k]
	return ok
}

// validHSNLen reports whether s is a 4, 6 or 8 digit HSN/SAC code.
func validHSNLen(s string) bool {
	if len(s) != 4 && len(s) != 6 && len(s) != 8 {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// validateItemGSTFields validates the GST fields of an item payload.
func validateItemGSTFields(i *models.Item) string {
	if !gst.ValidRate(i.TaxPercent) {
		return "Invalid taxPercent — must be one of the GST slab rates"
	}
	if i.TaxCategory == "" {
		i.TaxCategory = gst.TaxCategoryTaxable
	}
	if !gst.ValidTaxCategory(i.TaxCategory) {
		return "Invalid taxCategory " + i.TaxCategory
	}
	if i.HSNCode != "" && !validHSNLen(i.HSNCode) {
		return "Invalid hsnCode — must be 4, 6 or 8 digits"
	}
	return ""
}
