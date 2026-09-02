package handler

import (
	"fmt"
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
		fmt.Println("CreateTable: unauthorized - no claims in context")
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	fmt.Println("CreateTable: claims =", claims)

	var req models.Table
	if err := h.readJSON(r, &req); err != nil {
		fmt.Println("CreateTable: invalid JSON payload -", err)
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	fmt.Println("CreateTable: request =", req)

	targetStoreID := req.StoreID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}
	fmt.Println("CreateTable: targetStoreID =", targetStoreID)

	if targetStoreID == "" {
		fmt.Println("CreateTable: store ID required")
		h.writeError(w, http.StatusBadRequest, "Store ID required")
		return
	}

	req.ID = uuid.New().String()
	req.StoreID = targetStoreID
	req.IsActive = true
	fmt.Println("CreateTable: prepared table =", req)

	if err := h.Repo.Table.Create(r.Context(), req); err != nil {
		fmt.Println("CreateTable: repo create error -", err)
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fmt.Println("CreateTable: table created successfully")
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

// RenameSection handles PUT /api/tables/sections/rename
// Body: { "oldName": "...", "newName": "..." }
// Backward compatible: oldName "" targets the default (NULL) section.
func (h *Handler) RenameSection(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		OldName string `json:"oldName"`
		NewName string `json:"newName"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.NewName == "" {
		h.writeError(w, http.StatusBadRequest, "New section name is required")
		return
	}

	storeID := claims.StoreID
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
		return
	}

	if err := h.Repo.Table.RenameSection(r.Context(), storeID, req.OldName, req.NewName); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.broadcastTableStatusUpdate(storeID, "table_updated")

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Section renamed"})
}

// DeleteSection handles DELETE /api/tables/sections/:name
// Moves all tables in the given section back to the default (NULL) section.
func (h *Handler) DeleteSection(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	sectionName := chi.URLParam(r, "name")
	if sectionName == "" {
		h.writeError(w, http.StatusBadRequest, "Section name required")
		return
	}

	storeID := claims.StoreID
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
		return
	}

	if err := h.Repo.Table.DeleteSection(r.Context(), storeID, sectionName); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.broadcastTableStatusUpdate(storeID, "table_updated")

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Section deleted"})
}
