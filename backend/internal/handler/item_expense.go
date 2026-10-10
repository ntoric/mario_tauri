package handler

import (
	"net/http"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// GetItemExpenses handles GET /api/items/{itemId}/expenses
func (h *Handler) GetItemExpenses(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	itemID := chi.URLParam(r, "itemId")
	if itemID == "" {
		h.writeError(w, http.StatusBadRequest, "Item ID required")
		return
	}
	if !h.requireRecordStoreAccess(w, r, claims, "items", itemID) {
		return
	}

	expenses, err := h.Repo.ItemExpense.GetByItemID(r.Context(), itemID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, expenses)
}

// CreateItemExpense handles POST /api/items/{itemId}/expenses
func (h *Handler) CreateItemExpense(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	itemID := chi.URLParam(r, "itemId")
	if itemID == "" {
		h.writeError(w, http.StatusBadRequest, "Item ID required")
		return
	}

	var req models.ItemExpense
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.Name == "" || req.Amount < 0 {
		h.writeError(w, http.StatusBadRequest, "Name and valid amount are required")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	// The item must belong to the same store the expense is recorded against.
	itemStoreID, err := h.Repo.GetRecordStoreID(r.Context(), "items", itemID)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "Item not found")
		return
	}
	if itemStoreID != targetStoreID {
		h.writeError(w, http.StatusNotFound, "Item not found")
		return
	}

	req.ID = uuid.New().String()
	req.ItemID = itemID
	req.StoreID = targetStoreID
	req.IsActive = true

	if err := h.Repo.ItemExpense.Create(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, req)
}

// UpdateItemExpense handles PUT /api/item-expenses/{id}
func (h *Handler) UpdateItemExpense(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	storeID, err := h.Repo.GetRecordStoreID(r.Context(), "item_expenses", id)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "Item expense not found")
		return
	}
	allowed, err := h.authorizeStore(r.Context(), claims, storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return
	}

	var req models.ItemExpense
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.Name == "" || req.Amount < 0 {
		h.writeError(w, http.StatusBadRequest, "Name and valid amount are required")
		return
	}

	req.ID = id
	req.StoreID = storeID
	req.ModifiedBy = claims.ID

	if err := h.Repo.ItemExpense.Update(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, req)
}

// DeleteItemExpense handles DELETE /api/item-expenses/{id}
func (h *Handler) DeleteItemExpense(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	storeID, err := h.Repo.GetRecordStoreID(r.Context(), "item_expenses", id)
	if err != nil {
		h.writeError(w, http.StatusNotFound, "Item expense not found")
		return
	}
	allowed, err := h.authorizeStore(r.Context(), claims, storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return
	}

	if err := h.Repo.ItemExpense.Delete(r.Context(), id, storeID, claims.ID); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Item expense deleted"})
}

// GetItemProfitReport handles GET /api/reports/item-profit
func (h *Handler) GetItemProfitReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	report, err := h.Repo.ItemExpense.GetProfitReport(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, report)
}
