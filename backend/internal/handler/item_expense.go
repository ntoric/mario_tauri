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
	itemID := chi.URLParam(r, "itemId")
	if itemID == "" {
		h.writeError(w, http.StatusBadRequest, "Item ID required")
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

	targetStoreID := req.StoreID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}
	if targetStoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
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
	storeID := req.StoreID
	if storeID == "" {
		storeID = claims.StoreID
	}
	req.StoreID = storeID

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
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		storeID = claims.StoreID
	}

	if err := h.Repo.ItemExpense.Delete(r.Context(), id, storeID); err != nil {
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

	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		storeID = claims.StoreID
	}
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
		return
	}

	report, err := h.Repo.ItemExpense.GetProfitReport(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, report)
}
