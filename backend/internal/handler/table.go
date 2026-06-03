package handler

import (
	"net/http"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// GetTables handles GET /api/tables
func (h *Handler) GetTables(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID := r.URL.Query().Get("storeId")
	targetStoreID := storeID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}

	if targetStoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
		return
	}

	tables, err := h.Repo.Table.GetAll(r.Context(), targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if tables == nil {
		tables = []models.Table{}
	}

	h.writeJSON(w, http.StatusOK, tables)
}

// CreateTable handles POST /api/tables
func (h *Handler) CreateTable(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.Table
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
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
	req.StoreID = targetStoreID
	req.IsActive = true

	if err := h.Repo.Table.Create(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.broadcastTableStatusUpdate(req.StoreID, "table_created")

	h.writeJSON(w, http.StatusCreated, req)
}

// UpdateTable handles PUT /api/tables/:id
func (h *Handler) UpdateTable(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.Table
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	req.ID = id
	if err := h.Repo.Table.Update(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.broadcastTableStatusUpdate(req.StoreID, "table_updated")

	h.writeJSON(w, http.StatusOK, req)
}

// DeleteTable handles DELETE /api/tables/:id
func (h *Handler) DeleteTable(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	table, err := h.Repo.Table.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := h.Repo.Table.Delete(r.Context(), id); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if table != nil {
		h.broadcastTableStatusUpdate(table.StoreID, "table_deleted")
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Table deleted"})
}
