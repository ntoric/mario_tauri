package handler

import (
	"log"
	"net/http"
	"time"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"github.com/google/uuid"
)

var validManualTxnTypes = map[string]bool{
	"usage":      true,
	"wastage":    true,
	"adjustment": true,
}

// ---------- Raw Materials ----------

func (h *Handler) GetRawMaterials(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	materials, err := h.Repo.Inventory.GetMaterials(r.Context(), storeID)
	if err != nil {
		log.Printf("[RawMaterial GetAll] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch raw materials")
		return
	}
	if materials == nil {
		materials = []models.RawMaterial{}
	}

	h.writeJSON(w, http.StatusOK, materials)
}

func (h *Handler) CreateRawMaterial(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.RawMaterial
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Name == "" {
		h.writeError(w, http.StatusBadRequest, "Name is required")
		return
	}
	if req.Unit == "" {
		req.Unit = "pcs"
	}
	if req.OpeningStock < 0 || req.MinStock < 0 || req.AvgCost < 0 {
		h.writeError(w, http.StatusBadRequest, "Stock values cannot be negative")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}
	req.StoreID = targetStoreID

	req.ID = uuid.New().String()
	req.IsActive = true
	req.CreatedAt = time.Now()
	req.CreatedBy = claims.ID

	var openingTxn *models.RawMaterialTransaction
	if req.OpeningStock != 0 {
		openingTxn = &models.RawMaterialTransaction{
			ID:              uuid.New().String(),
			StoreID:         targetStoreID,
			MaterialID:      req.ID,
			Type:            "adjustment",
			Quantity:        req.OpeningStock,
			Notes:           "Opening stock",
			TransactionDate: time.Now(),
			CreatedBy:       claims.ID,
		}
	}

	if err := h.Repo.Inventory.CreateMaterial(r.Context(), req, openingTxn); err != nil {
		log.Printf("[RawMaterial Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to create raw material")
		return
	}

	req.CurrentStock = req.OpeningStock
	h.writeJSON(w, http.StatusCreated, req)
}

func (h *Handler) UpdateRawMaterial(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.URL.Path[len("/api/raw-materials/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Material ID is required")
		return
	}
	if !h.requireRecordStoreAccess(w, r, claims, "raw_materials", id) {
		return
	}

	var req models.RawMaterial
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Name == "" {
		h.writeError(w, http.StatusBadRequest, "Name is required")
		return
	}
	if req.Unit == "" {
		req.Unit = "pcs"
	}
	if req.MinStock < 0 || req.AvgCost < 0 {
		h.writeError(w, http.StatusBadRequest, "Minimum stock cannot be negative")
		return
	}

	req.ID = id
	req.ModifiedBy = claims.ID
	if err := h.Repo.Inventory.UpdateMaterial(r.Context(), req); err != nil {
		log.Printf("[RawMaterial Update] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to update raw material")
		return
	}

	h.writeJSON(w, http.StatusOK, req)
}

func (h *Handler) DeleteRawMaterial(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.URL.Path[len("/api/raw-materials/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Material ID is required")
		return
	}
	if !h.requireRecordStoreAccess(w, r, claims, "raw_materials", id) {
		return
	}

	if err := h.Repo.Inventory.DeleteMaterial(r.Context(), id, claims.ID); err != nil {
		log.Printf("[RawMaterial Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete raw material")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Raw material deleted successfully"})
}

// ---------- Stock Transactions (usage / wastage / adjustment) ----------

func (h *Handler) GetRawMaterialTransactions(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	q := r.URL.Query()
	txns, err := h.Repo.Inventory.GetTransactions(r.Context(), storeID,
		q.Get("materialId"), q.Get("type"), q.Get("startDate"), q.Get("endDate"))
	if err != nil {
		log.Printf("[RawMaterialTxn GetAll] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch stock transactions")
		return
	}
	if txns == nil {
		txns = []models.RawMaterialTransaction{}
	}

	h.writeJSON(w, http.StatusOK, txns)
}

// CreateRawMaterialTransaction records a manual stock event. For 'usage' and
// 'wastage' quantity is the positive amount consumed (stored negative); for
// 'adjustment' quantity is the corrected absolute stock level and the signed
// delta is stored.
func (h *Handler) CreateRawMaterialTransaction(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.RawMaterialTransaction
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.MaterialID == "" || !validManualTxnTypes[req.Type] {
		h.writeError(w, http.StatusBadRequest, "Material and a valid type (usage, wastage, adjustment) are required")
		return
	}
	if req.Type != "adjustment" && req.Quantity <= 0 {
		h.writeError(w, http.StatusBadRequest, "Quantity must be greater than zero")
		return
	}
	if req.Type == "adjustment" && req.Quantity < 0 {
		h.writeError(w, http.StatusBadRequest, "Adjusted stock cannot be negative")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}
	req.StoreID = targetStoreID

	material, err := h.Repo.Inventory.GetMaterialByID(r.Context(), req.MaterialID)
	if err != nil {
		log.Printf("[RawMaterialTxn Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch material")
		return
	}
	if material == nil || material.StoreID != targetStoreID || !material.IsActive {
		h.writeError(w, http.StatusBadRequest, "Invalid material")
		return
	}

	// Convert the request quantity into the signed ledger delta.
	switch req.Type {
	case "usage", "wastage":
		req.Quantity = -req.Quantity
	case "adjustment":
		req.Quantity = req.Quantity - material.CurrentStock
	}

	if req.TransactionDate.IsZero() {
		req.TransactionDate = time.Now()
	}
	req.ID = uuid.New().String()
	req.IsActive = true
	req.CreatedAt = time.Now()
	req.CreatedBy = claims.ID

	if err := h.Repo.Inventory.CreateTransaction(r.Context(), req); err != nil {
		log.Printf("[RawMaterialTxn Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to record stock transaction")
		return
	}

	// Reflect the new balance in the response (the ledger row's stock_after is
	// computed inside the write transaction).
	req.StockAfter = material.CurrentStock + req.Quantity
	h.writeJSON(w, http.StatusCreated, req)
}

func (h *Handler) DeleteRawMaterialTransaction(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.URL.Path[len("/api/raw-material-transactions/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Transaction ID is required")
		return
	}
	if !h.requireRecordStoreAccess(w, r, claims, "raw_material_transactions", id) {
		return
	}

	txn, err := h.Repo.Inventory.GetTransactionByID(r.Context(), id)
	if err != nil {
		log.Printf("[RawMaterialTxn Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch transaction")
		return
	}
	if txn == nil {
		h.writeError(w, http.StatusNotFound, "Transaction not found")
		return
	}
	// Purchase-derived entries are owned by the purchase row — removing them
	// directly would desync spend history from stock.
	if txn.Type == "purchase" {
		h.writeError(w, http.StatusBadRequest, "Purchase entries must be deleted from the purchases list")
		return
	}

	if err := h.Repo.Inventory.DeleteTransaction(r.Context(), id, claims.ID); err != nil {
		log.Printf("[RawMaterialTxn Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete stock transaction")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Stock transaction deleted successfully"})
}

// ---------- Purchases ----------

func (h *Handler) GetRawMaterialPurchases(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	q := r.URL.Query()
	purchases, err := h.Repo.Inventory.GetPurchases(r.Context(), storeID,
		q.Get("materialId"), q.Get("startDate"), q.Get("endDate"))
	if err != nil {
		log.Printf("[RawMaterialPurchase GetAll] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch purchases")
		return
	}
	if purchases == nil {
		purchases = []models.RawMaterialPurchase{}
	}

	h.writeJSON(w, http.StatusOK, purchases)
}

func (h *Handler) CreateRawMaterialPurchase(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.RawMaterialPurchase
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.MaterialID == "" || req.Quantity <= 0 {
		h.writeError(w, http.StatusBadRequest, "Material and a quantity greater than zero are required")
		return
	}
	if req.UnitCost < 0 {
		h.writeError(w, http.StatusBadRequest, "Unit cost cannot be negative")
		return
	}
	if req.TotalCost <= 0 {
		req.TotalCost = req.Quantity * req.UnitCost
	}
	if req.ExpiryDate != "" {
		if _, err := time.Parse("2006-01-02", req.ExpiryDate); err != nil {
			h.writeError(w, http.StatusBadRequest, "Invalid expiry date (use YYYY-MM-DD)")
			return
		}
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}
	req.StoreID = targetStoreID

	material, err := h.Repo.Inventory.GetMaterialByID(r.Context(), req.MaterialID)
	if err != nil {
		log.Printf("[RawMaterialPurchase Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch material")
		return
	}
	if material == nil || material.StoreID != targetStoreID || !material.IsActive {
		h.writeError(w, http.StatusBadRequest, "Invalid material")
		return
	}

	if req.PurchaseDate.IsZero() {
		req.PurchaseDate = time.Now()
	}
	req.ID = uuid.New().String()
	req.IsActive = true
	req.CreatedAt = time.Now()
	req.CreatedBy = claims.ID

	txn := models.RawMaterialTransaction{
		ID:              uuid.New().String(),
		StoreID:         targetStoreID,
		MaterialID:      req.MaterialID,
		Type:            "purchase",
		Quantity:        req.Quantity,
		Notes:           req.Notes,
		TransactionDate: req.PurchaseDate,
		CreatedBy:       claims.ID,
	}

	if err := h.Repo.Inventory.CreatePurchase(r.Context(), req, txn); err != nil {
		log.Printf("[RawMaterialPurchase Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to record purchase")
		return
	}

	h.writeJSON(w, http.StatusCreated, req)
}

func (h *Handler) UpdateRawMaterialPurchase(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.URL.Path[len("/api/raw-material-purchases/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Purchase ID is required")
		return
	}
	targetStoreID, ok := h.recordStoreAccess(w, r, claims, "raw_material_purchases", id)
	if !ok {
		return
	}

	old, err := h.Repo.Inventory.GetPurchaseByID(r.Context(), id)
	if err != nil {
		log.Printf("[RawMaterialPurchase Update] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch purchase")
		return
	}
	if old == nil || !old.IsActive {
		h.writeError(w, http.StatusNotFound, "Purchase not found")
		return
	}

	var req models.RawMaterialPurchase
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.MaterialID == "" {
		req.MaterialID = old.MaterialID
	}
	if req.Quantity <= 0 {
		h.writeError(w, http.StatusBadRequest, "Quantity must be greater than zero")
		return
	}
	if req.UnitCost < 0 {
		h.writeError(w, http.StatusBadRequest, "Unit cost cannot be negative")
		return
	}
	if req.TotalCost <= 0 {
		req.TotalCost = req.Quantity * req.UnitCost
	}
	if req.ExpiryDate != "" {
		if _, err := time.Parse("2006-01-02", req.ExpiryDate); err != nil {
			h.writeError(w, http.StatusBadRequest, "Invalid expiry date (use YYYY-MM-DD)")
			return
		}
	}

	if req.MaterialID != old.MaterialID {
		material, err := h.Repo.Inventory.GetMaterialByID(r.Context(), req.MaterialID)
		if err != nil {
			log.Printf("[RawMaterialPurchase Update] Database error: %v", err)
			h.writeError(w, http.StatusInternalServerError, "Failed to fetch material")
			return
		}
		if material == nil || material.StoreID != targetStoreID || !material.IsActive {
			h.writeError(w, http.StatusBadRequest, "Invalid material")
			return
		}
	}

	if req.PurchaseDate.IsZero() {
		req.PurchaseDate = old.PurchaseDate
	}
	req.ID = id
	req.StoreID = targetStoreID
	req.ModifiedBy = claims.ID

	if err := h.Repo.Inventory.UpdatePurchase(r.Context(), req, old.MaterialID); err != nil {
		log.Printf("[RawMaterialPurchase Update] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to update purchase")
		return
	}

	h.writeJSON(w, http.StatusOK, req)
}

func (h *Handler) DeleteRawMaterialPurchase(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.URL.Path[len("/api/raw-material-purchases/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Purchase ID is required")
		return
	}
	if !h.requireRecordStoreAccess(w, r, claims, "raw_material_purchases", id) {
		return
	}

	if err := h.Repo.Inventory.DeletePurchase(r.Context(), id, claims.ID); err != nil {
		log.Printf("[RawMaterialPurchase Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete purchase")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Purchase deleted successfully"})
}

// GetRawMaterialPurchaseReport aggregates purchase spend per material and per
// date for a store and optional date range.
func (h *Handler) GetRawMaterialPurchaseReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	q := r.URL.Query()
	report, err := h.Repo.Inventory.GetPurchaseReport(r.Context(), storeID,
		q.Get("startDate"), q.Get("endDate"))
	if err != nil {
		log.Printf("[RawMaterialPurchase Report] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch purchase report")
		return
	}

	h.writeJSON(w, http.StatusOK, report)
}

// ---------- Item Recipes ----------

// itemIDFromRecipePath extracts the item id from /api/items/{id}/recipe.
func itemIDFromRecipePath(path string) string {
	rest := path[len("/api/items/"):]
	if idx := len(rest) - len("/recipe"); idx > 0 && rest[idx:] == "/recipe" {
		return rest[:idx]
	}
	return ""
}

func (h *Handler) GetItemRecipe(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	itemID := itemIDFromRecipePath(r.URL.Path)
	if itemID == "" {
		h.writeError(w, http.StatusBadRequest, "Item ID is required")
		return
	}
	if !h.requireRecordStoreAccess(w, r, claims, "items", itemID) {
		return
	}

	lines, err := h.Repo.Inventory.GetItemRecipe(r.Context(), itemID)
	if err != nil {
		log.Printf("[ItemRecipe Get] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch recipe")
		return
	}
	if lines == nil {
		lines = []models.ItemRecipe{}
	}
	h.writeJSON(w, http.StatusOK, lines)
}

// SetItemRecipe replaces an item's recipe atomically.
func (h *Handler) SetItemRecipe(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	itemID := itemIDFromRecipePath(r.URL.Path)
	if itemID == "" {
		h.writeError(w, http.StatusBadRequest, "Item ID is required")
		return
	}
	itemStoreID, ok := h.recordStoreAccess(w, r, claims, "items", itemID)
	if !ok {
		return
	}

	var req models.SetItemRecipeRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate lines: positive quantity, active same-store material, no dupes.
	seen := map[string]bool{}
	for _, l := range req.Lines {
		if l.MaterialID == "" || l.Quantity <= 0 {
			h.writeError(w, http.StatusBadRequest, "Each recipe line needs a material and a quantity greater than zero")
			return
		}
		if seen[l.MaterialID] {
			h.writeError(w, http.StatusBadRequest, "Duplicate material in recipe")
			return
		}
		seen[l.MaterialID] = true
		material, err := h.Repo.Inventory.GetMaterialByID(r.Context(), l.MaterialID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, "Failed to fetch material")
			return
		}
		if material == nil || material.StoreID != itemStoreID || !material.IsActive {
			h.writeError(w, http.StatusBadRequest, "Invalid material in recipe")
			return
		}
	}

	if err := h.Repo.Inventory.SetItemRecipe(r.Context(), itemStoreID, itemID, req.Lines, claims.ID); err != nil {
		log.Printf("[ItemRecipe Set] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to save recipe")
		return
	}

	lines, err := h.Repo.Inventory.GetItemRecipe(r.Context(), itemID)
	if err != nil {
		lines = []models.ItemRecipe{}
	}
	h.writeJSON(w, http.StatusOK, lines)
}

// GetRawMaterialConsumptionReport aggregates order-driven consumption per
// material and per menu item for a store and optional date range.
func (h *Handler) GetRawMaterialConsumptionReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	q := r.URL.Query()
	report, err := h.Repo.Inventory.GetConsumptionReport(r.Context(), storeID,
		q.Get("startDate"), q.Get("endDate"))
	if err != nil {
		log.Printf("[Consumption Report] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch consumption report")
		return
	}

	h.writeJSON(w, http.StatusOK, report)
}
