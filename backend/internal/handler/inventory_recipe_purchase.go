package handler

import (
	"log"
	"net/http"
	"time"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ==========================================
// INVENTORY ITEM HANDLERS
// ==========================================

// GetInventoryItems handles GET /api/inventory-items
func (h *Handler) GetInventoryItems(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		claims, ok := middleware.GetUserFromContext(r.Context())
		if !ok {
			h.writeError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		storeID = claims.StoreID
	}
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	items, err := h.Repo.Inventory.GetAll(r.Context(), storeID)
	if err != nil {
		log.Printf("[Inventory GetAll] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch inventory items")
		return
	}
	if items == nil {
		items = []models.InventoryItem{}
	}
	h.writeJSON(w, http.StatusOK, items)
}

// CreateInventoryItem handles POST /api/inventory-items
func (h *Handler) CreateInventoryItem(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.InventoryItem
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Name == "" {
		h.writeError(w, http.StatusBadRequest, "Name is required")
		return
	}

	if req.StoreID == "" {
		req.StoreID = claims.StoreID
	}
	if req.StoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}
	if req.Unit == "" {
		req.Unit = "pcs"
	}

	req.ID = uuid.New().String()
	req.IsActive = true
	req.CreatedAt = time.Now()
	req.UpdatedAt = time.Now()

	if err := h.Repo.Inventory.Create(r.Context(), req); err != nil {
		log.Printf("[Inventory Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to create inventory item")
		return
	}

	h.writeJSON(w, http.StatusCreated, req)
}

// UpdateInventoryItem handles PUT /api/inventory-items/{id}
func (h *Handler) UpdateInventoryItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Inventory item ID is required")
		return
	}

	var req models.InventoryItem
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.ID = id
	if req.Unit == "" {
		req.Unit = "pcs"
	}
	req.UpdatedAt = time.Now()

	if err := h.Repo.Inventory.Update(r.Context(), req); err != nil {
		log.Printf("[Inventory Update] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to update inventory item")
		return
	}

	h.writeJSON(w, http.StatusOK, req)
}

// DeleteInventoryItem handles DELETE /api/inventory-items/{id}
func (h *Handler) DeleteInventoryItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	storeID := r.URL.Query().Get("storeId")
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Inventory item ID is required")
		return
	}

	if err := h.Repo.Inventory.Delete(r.Context(), id, storeID); err != nil {
		log.Printf("[Inventory Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete inventory item")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Inventory item deleted successfully"})
}

// ==========================================
// RECIPE HANDLERS
// ==========================================

// GetRecipe handles GET /api/items/{itemId}/recipe
func (h *Handler) GetRecipe(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "itemId")
	if itemID == "" {
		h.writeError(w, http.StatusBadRequest, "Item ID is required")
		return
	}

	recipe, err := h.Repo.Recipe.GetByItem(r.Context(), itemID)
	if err != nil {
		log.Printf("[Recipe GetByItem] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch recipe")
		return
	}
	if recipe == nil {
		h.writeJSON(w, http.StatusOK, map[string]interface{}{
			"id":          "",
			"itemId":      itemID,
			"ingredients": []models.RecipeIngredient{},
		})
		return
	}
	h.writeJSON(w, http.StatusOK, recipe)
}

// GetRecipes handles GET /api/recipes
func (h *Handler) GetRecipes(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		claims, ok := middleware.GetUserFromContext(r.Context())
		if !ok {
			h.writeError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		storeID = claims.StoreID
	}
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	recipes, err := h.Repo.Recipe.GetAllForStore(r.Context(), storeID)
	if err != nil {
		log.Printf("[Recipe GetAllForStore] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch recipes")
		return
	}
	if recipes == nil {
		recipes = []models.Recipe{}
	}
	h.writeJSON(w, http.StatusOK, recipes)
}

// UpsertRecipe handles POST /api/recipes (and PUT /api/recipes/{id})
func (h *Handler) UpsertRecipe(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.RecipeRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.ItemID == "" {
		h.writeError(w, http.StatusBadRequest, "Item ID is required")
		return
	}

	storeID := claims.StoreID
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	recipe, err := h.Repo.Recipe.Upsert(r.Context(), storeID, req.ItemID, req.Ingredients)
	if err != nil {
		log.Printf("[Recipe Upsert] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to save recipe")
		return
	}

	h.writeJSON(w, http.StatusOK, recipe)
}

// DeleteRecipe handles DELETE /api/recipes/{id}
func (h *Handler) DeleteRecipe(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	storeID := r.URL.Query().Get("storeId")
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Recipe ID is required")
		return
	}

	if err := h.Repo.Recipe.Delete(r.Context(), id, storeID); err != nil {
		log.Printf("[Recipe Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete recipe")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Recipe deleted successfully"})
}

// ==========================================
// PURCHASE HANDLERS
// ==========================================

// GetPurchases handles GET /api/purchases
func (h *Handler) GetPurchases(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		claims, ok := middleware.GetUserFromContext(r.Context())
		if !ok {
			h.writeError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
		storeID = claims.StoreID
	}
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	purchases, err := h.Repo.Purchase.GetAll(r.Context(), storeID)
	if err != nil {
		log.Printf("[Purchase GetAll] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch purchases")
		return
	}
	if purchases == nil {
		purchases = []models.Purchase{}
	}
	h.writeJSON(w, http.StatusOK, purchases)
}

// GetPurchase handles GET /api/purchases/{id}
func (h *Handler) GetPurchase(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Purchase ID is required")
		return
	}

	purchase, err := h.Repo.Purchase.GetByID(r.Context(), id)
	if err != nil {
		log.Printf("[Purchase GetByID] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch purchase")
		return
	}
	if purchase == nil {
		h.writeError(w, http.StatusNotFound, "Purchase not found")
		return
	}
	h.writeJSON(w, http.StatusOK, purchase)
}

// CreatePurchase handles POST /api/purchases
func (h *Handler) CreatePurchase(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.PurchaseRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.Items) == 0 {
		h.writeError(w, http.StatusBadRequest, "At least one purchase item is required")
		return
	}

	storeID := claims.StoreID
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	if req.PurchaseDate.IsZero() {
		req.PurchaseDate = time.Now()
	}

	// Compute total from line items
	var total float64
	items := make([]models.PurchaseItem, 0, len(req.Items))
	for _, it := range req.Items {
		lineTotal := it.Quantity * it.UnitPrice
		total += lineTotal
		items = append(items, models.PurchaseItem{
			InventoryItemID: it.InventoryItemID,
			Quantity:        it.Quantity,
			UnitPrice:       it.UnitPrice,
			Total:           lineTotal,
		})
	}

	p := models.Purchase{
		ID:            uuid.New().String(),
		StoreID:       storeID,
		Vendor:        req.Vendor,
		PurchaseDate:  req.PurchaseDate,
		TotalAmount:   total,
		PaymentMethod: req.PaymentMethod,
		ReceiptNumber: req.ReceiptNumber,
		Notes:         req.Notes,
		IsActive:      true,
		CreatedAt:     time.Now(),
		CreatedBy:     claims.ID,
		Items:         items,
	}

	if err := h.Repo.Purchase.Create(r.Context(), p); err != nil {
		log.Printf("[Purchase Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to create purchase")
		return
	}

	// Re-fetch to include line item ids/names
	created, _ := h.Repo.Purchase.GetByID(r.Context(), p.ID)
	if created != nil {
		p = *created
	}
	h.writeJSON(w, http.StatusCreated, p)
}

// UpdatePurchase handles PUT /api/purchases/{id}
func (h *Handler) UpdatePurchase(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Purchase ID is required")
		return
	}

	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.PurchaseRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.Items) == 0 {
		h.writeError(w, http.StatusBadRequest, "At least one purchase item is required")
		return
	}

	storeID := claims.StoreID
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	if req.PurchaseDate.IsZero() {
		req.PurchaseDate = time.Now()
	}

	var total float64
	items := make([]models.PurchaseItem, 0, len(req.Items))
	for _, it := range req.Items {
		lineTotal := it.Quantity * it.UnitPrice
		total += lineTotal
		items = append(items, models.PurchaseItem{
			InventoryItemID: it.InventoryItemID,
			Quantity:        it.Quantity,
			UnitPrice:       it.UnitPrice,
			Total:           lineTotal,
		})
	}

	p := models.Purchase{
		ID:            id,
		StoreID:       storeID,
		Vendor:        req.Vendor,
		PurchaseDate:  req.PurchaseDate,
		TotalAmount:   total,
		PaymentMethod: req.PaymentMethod,
		ReceiptNumber: req.ReceiptNumber,
		Notes:         req.Notes,
		IsActive:      true,
		Items:         items,
	}

	if err := h.Repo.Purchase.Update(r.Context(), id, p); err != nil {
		log.Printf("[Purchase Update] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to update purchase")
		return
	}

	updated, _ := h.Repo.Purchase.GetByID(r.Context(), id)
	if updated != nil {
		p = *updated
	}
	h.writeJSON(w, http.StatusOK, p)
}

// DeletePurchase handles DELETE /api/purchases/{id}
func (h *Handler) DeletePurchase(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	storeID := r.URL.Query().Get("storeId")
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Purchase ID is required")
		return
	}

	if err := h.Repo.Purchase.Delete(r.Context(), id, storeID); err != nil {
		log.Printf("[Purchase Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete purchase")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Purchase deleted successfully"})
}
