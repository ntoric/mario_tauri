package handler

import (
	"net/http"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ==========================================
// CATEGORY HANDLERS
// ==========================================

// GetCategories handles GET /api/categories
func (h *Handler) GetCategories(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	targetStoreID, ok := h.resolveStoreID(w, r, claims, "")
	if !ok {
		return
	}

	categories, err := h.Repo.Category.GetAll(r.Context(), targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if categories == nil {
		categories = []models.Category{}
	}

	h.writeJSON(w, http.StatusOK, categories)
}

// CreateCategory handles POST /api/categories
func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.Category
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.resolveStoreID(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	req.ID = uuid.New().String()
	req.StoreID = targetStoreID
	req.IsActive = true

	if err := h.Repo.Category.Create(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, req)
}

// UpdateCategory handles PUT /api/categories/:id
func (h *Handler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.Category
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	req.ID = id
	if err := h.Repo.Category.Update(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, req)
}

// DeleteCategory handles DELETE /api/categories/:id
func (h *Handler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Repo.Category.Delete(r.Context(), id); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Category deleted"})
}

// ==========================================
// ITEM HANDLERS
// ==========================================

// GetItems handles GET /api/items
func (h *Handler) GetItems(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	targetStoreID, ok := h.resolveStoreID(w, r, claims, "")
	if !ok {
		return
	}

	items, err := h.Repo.Item.GetAll(r.Context(), targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if items == nil {
		items = []models.Item{}
	}

	h.writeJSON(w, http.StatusOK, items)
}

// CreateItem handles POST /api/items
func (h *Handler) CreateItem(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.Item
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.resolveStoreID(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	req.ID = uuid.New().String()
	req.StoreID = targetStoreID
	req.IsActive = true

	if err := h.Repo.Item.Create(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, req)
}

// UpdateItem handles PUT /api/items/:id
func (h *Handler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.Item
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	req.ID = id
	if err := h.Repo.Item.Update(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, req)
}

// DeleteItem handles DELETE /api/items/:id
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Repo.Item.Delete(r.Context(), id); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Item deleted"})
}
