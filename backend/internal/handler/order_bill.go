package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
	"cafe-backend/internal/repository"

	"fmt"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ==========================================
// ORDER HANDLERS
// ==========================================

// maxListLimit caps client-supplied limit values on list endpoints so a
// request can never pull an unbounded result set by accident.
const maxListLimit = 1000

// parseStatuses splits a comma-separated status query value
// (e.g. "completed,cancelled") into a clean list. Empty input returns nil.
func parseStatuses(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	statuses := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			statuses = append(statuses, s)
		}
	}
	return statuses
}

// parseTimeQuery parses an RFC3339 or YYYY-MM-DD query value. Invalid or
// absent values return nil so the filter is simply not applied.
func parseTimeQuery(r *http.Request, key string) *time.Time {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return &t
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		return &t
	}
	return nil
}

// parseLimitQuery parses a positive integer limit, capped at max (0 = no
// cap). Invalid or absent values return 0 meaning "no limit".
func parseLimitQuery(r *http.Request, max int) int {
	n, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil || n <= 0 {
		return 0
	}
	if max > 0 && n > max {
		return max
	}
	return n
}

// defaultOrderLimit is the default number of orders to fetch when no limit is specified.
// This prevents fetching all historical orders which can be slow for stores with many orders.
const defaultOrderLimit = 70

// GetOrders handles GET /api/orders
func (h *Handler) GetOrders(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	filter := repository.OrderFilter{
		Statuses: parseStatuses(r.URL.Query().Get("status")),
		From:     parseTimeQuery(r, "from"),
		To:       parseTimeQuery(r, "to"),
		Limit:    parseLimitQuery(r, maxListLimit),
	}

	// Apply default limit only if no limit was specified and client didn't request all orders
	// Clients can pass limit=0 to fetch all orders (for backward compatibility)
	if filter.Limit == 0 && r.URL.Query().Get("limit") != "0" {
		filter.Limit = defaultOrderLimit
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	orders, err := h.Repo.Order.GetAll(r.Context(), targetStoreID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if orders == nil {
		orders = []models.Order{}
	}

	h.writeJSON(w, http.StatusOK, orders)
}

// CreateOrder handles POST /api/orders
func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.Order
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	if req.TableID != "" && !h.requireRecordBelongsToStore(w, r, "tables", req.TableID, targetStoreID, "Table") {
		return
	}

	req.ID = uuid.New().String()
	req.StoreID = targetStoreID
	req.CreatedBy = claims.ID
	req.Status = "active"

	err := h.Repo.Order.Create(r.Context(), req)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Fetch fully created order with items
	order, errFetch := h.Repo.Order.GetByID(r.Context(), req.ID)
	if errFetch != nil || order == nil {
		// Fallback to returning input
		h.broadcastTableStatusUpdate(req.StoreID, "order_created")
		h.writeJSON(w, http.StatusCreated, req)
		return
	}

	h.broadcastTableStatusUpdate(order.StoreID, "order_created")
	h.writeJSON(w, http.StatusCreated, order)
}

// UpdateOrder handles PUT /api/orders/:id
func (h *Handler) UpdateOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	orderStoreID, ok := h.recordStoreAccess(w, r, claims, "orders", id)
	if !ok {
		return
	}

	// Read unstructured JSON to parse fields dynamically
	var raw map[string]interface{}
	if err := h.readJSON(r, &raw); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	updates := make(map[string]interface{})
	if val, exists := raw["totalAmount"]; exists {
		updates["total_amount"] = val
	}
	if val, exists := raw["taxAmount"]; exists {
		updates["tax_amount"] = val
	}
	if val, exists := raw["discountAmount"]; exists {
		updates["discount_amount"] = val
	}
	if val, exists := raw["tableId"]; exists {
		tableID, _ := val.(string)
		if tableID == "" {
			updates["table_id"] = nil
			updates["table_name"] = nil
		} else {
			// The target table must belong to the same store as the order,
			// otherwise the order would surface in another store's table view.
			if !h.requireRecordBelongsToStore(w, r, "tables", tableID, orderStoreID, "Table") {
				return
			}
			updates["table_id"] = tableID
			// Keep the table_name snapshot in sync with the new table.
			if tbl, err := h.Repo.Table.GetByID(r.Context(), tableID); err == nil && tbl != nil {
				if tbl.Name != nil && *tbl.Name != "" {
					updates["table_name"] = *tbl.Name
				} else {
					updates["table_name"] = nil
				}
			}
		}
	}
	if val, exists := raw["tableName"]; exists {
		if s, ok := val.(string); ok && strings.TrimSpace(s) != "" {
			updates["table_name"] = strings.TrimSpace(s)
		} else {
			updates["table_name"] = nil
		}
	}
	if val, exists := raw["tableNumber"]; exists {
		if floatVal, ok := val.(float64); ok {
			updates["table_number"] = int(floatVal)
		} else if intVal, ok := val.(int); ok {
			updates["table_number"] = intVal
		} else {
			updates["table_number"] = val
		}
	}
	if val, exists := raw["customerName"]; exists {
		if s, ok := val.(string); ok && strings.TrimSpace(s) != "" {
			updates["customer_name"] = strings.TrimSpace(s)
		} else {
			updates["customer_name"] = nil
		}
	}
	if val, exists := raw["customerMobile"]; exists {
		if s, ok := val.(string); ok && strings.TrimSpace(s) != "" {
			updates["customer_mobile"] = strings.TrimSpace(s)
		} else {
			updates["customer_mobile"] = nil
		}
	}

	// Extract items if present
	var items []models.OrderItem
	hasItems := false
	if itemsRaw, exists := raw["items"]; exists {
		if itemsSlice, ok := itemsRaw.([]interface{}); ok {
			hasItems = true
			for _, it := range itemsSlice {
				if itMap, ok := it.(map[string]interface{}); ok {
					var item models.OrderItem
					if val, ok := itMap["itemId"].(string); ok {
						item.ItemID = val
					}
					if val, ok := itMap["quantity"].(float64); ok {
						item.Quantity = int(val)
					}
					if val, ok := itMap["unitPrice"].(float64); ok {
						item.UnitPrice = val
					}
					if val, ok := itMap["taxPercent"].(float64); ok {
						item.TaxPercent = val
					}
					if val, ok := itMap["notes"].(string); ok {
						item.Notes = val
					}
					if itemVal, ok := itMap["item"].(map[string]interface{}); ok {
						var nested models.NestedItem
						if val, ok := itemVal["id"].(string); ok {
							nested.ID = val
						}
						if val, ok := itemVal["name"].(string); ok {
							nested.Name = val
						}
						if val, ok := itemVal["price"].(float64); ok {
							nested.Price = val
						}
						if val, ok := itemVal["description"].(string); ok {
							nested.Description = val
						}
						item.Item = nested
					}
					items = append(items, item)
				}
			}
		}
	}

	// Every referenced item must belong to the order's store.
	if hasItems {
		itemIDs := make([]string, 0, len(items))
		for _, it := range items {
			itemID := it.ItemID
			if itemID == "" {
				itemID = it.Item.ID
			}
			if itemID != "" {
				itemIDs = append(itemIDs, itemID)
			}
		}
		foreign, err := h.Repo.CountForeignStoreRecords(r.Context(), "items", itemIDs, orderStoreID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if foreign > 0 {
			h.writeError(w, http.StatusForbidden, "One or more items belong to a different store")
			return
		}
	}

	updates["modified_by"] = claims.ID

	err := h.Repo.Order.Update(r.Context(), id, updates, items, hasItems, claims.ID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Fetch updated order row
	order, errFetch := h.Repo.Order.GetByID(r.Context(), id)
	if errFetch != nil || order == nil {
		h.writeJSON(w, http.StatusOK, map[string]string{"message": "Order updated successfully"})
		return
	}

	h.broadcastTableStatusUpdate(order.StoreID, "order_updated")
	h.writeJSON(w, http.StatusOK, order)
}

// CompleteOrder handles PATCH /api/orders/:id/complete
func (h *Handler) CompleteOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	if !h.requireRecordStoreAccess(w, r, claims, "orders", id) {
		return
	}

	var req struct {
		PaymentMethod string `json:"paymentMethod"`
	}
	_ = h.readJSON(r, &req)

	err := h.Repo.Order.Complete(r.Context(), id, req.PaymentMethod, claims.ID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	order, errFetch := h.Repo.Order.GetByID(r.Context(), id)
	if errFetch != nil || order == nil {
		h.writeError(w, http.StatusNotFound, "Order not found after update")
		return
	}

	h.broadcastTableStatusUpdate(order.StoreID, "order_completed")
	h.writeJSON(w, http.StatusOK, order)
}

// CancelOrder handles PATCH /api/orders/:id/cancel
// Supports cancelling both active and completed (bill printed) orders.
func (h *Handler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	var req struct {
		Reason string `json:"reason"`
	}
	_ = h.readJSON(r, &req)

	// Fetch order to check current status
	order, err := h.Repo.Order.GetByID(r.Context(), id)
	if err != nil || order == nil {
		h.writeError(w, http.StatusNotFound, "Order not found")
		return
	}

	allowed, err := h.authorizeStore(r.Context(), claims, order.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return
	}

	if order.Status == "cancelled" {
		h.writeError(w, http.StatusBadRequest, "Order is already cancelled")
		return
	}

	err = h.Repo.Order.Cancel(r.Context(), id, claims.ID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	order, errFetch := h.Repo.Order.GetByID(r.Context(), id)
	if errFetch != nil || order == nil {
		h.writeError(w, http.StatusNotFound, "Order not found after update")
		return
	}

	h.broadcastTableStatusUpdate(order.StoreID, "order_cancelled")
	h.writeJSON(w, http.StatusOK, order)
}

// MergeOrders handles POST /api/orders/:id/merge
// Folds another active order (mergeOrderId) into this order: its items and
// totals are moved over and it is marked 'merged', releasing its table.
// A single bill can then be generated for the combined order.
func (h *Handler) MergeOrders(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	orderStoreID, ok := h.recordStoreAccess(w, r, claims, "orders", id)
	if !ok {
		return
	}

	var req struct {
		MergeOrderID string `json:"mergeOrderId"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if req.MergeOrderID == "" || req.MergeOrderID == id {
		h.writeError(w, http.StatusBadRequest, "A different order to combine is required")
		return
	}

	// The order being folded in must belong to the same store.
	if !h.requireRecordBelongsToStore(w, r, "orders", req.MergeOrderID, orderStoreID, "Order") {
		return
	}

	primary, err := h.Repo.Order.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	secondary, err := h.Repo.Order.GetByID(r.Context(), req.MergeOrderID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if primary == nil || secondary == nil {
		h.writeError(w, http.StatusNotFound, "Order not found")
		return
	}
	if primary.Status != "active" || secondary.Status != "active" {
		h.writeError(w, http.StatusBadRequest, "Only active orders can be combined")
		return
	}

	// Snapshot both table labels on the surviving order so downstream bills
	// show which tables were combined (e.g. "3 + 5").
	combinedName := orderTableLabel(primary) + " + " + orderTableLabel(secondary)

	if err := h.Repo.Order.MergeOrders(r.Context(), id, req.MergeOrderID, combinedName, claims.ID); err != nil {
		if errors.Is(err, repository.ErrOrderNotMergeable) {
			h.writeError(w, http.StatusBadRequest, "Only active orders can be combined")
			return
		}
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	order, errFetch := h.Repo.Order.GetByID(r.Context(), id)
	if errFetch != nil || order == nil {
		h.writeJSON(w, http.StatusOK, map[string]string{"message": "Orders combined successfully"})
		return
	}

	h.broadcastTableStatusUpdate(order.StoreID, "order_updated")
	h.writeJSON(w, http.StatusOK, order)
}

// orderTableLabel returns the display label for an order's table: the
// alphanumeric name snapshot when set, otherwise the table number.
func orderTableLabel(o *models.Order) string {
	if o.TableName != "" {
		return o.TableName
	}
	return fmt.Sprintf("%d", o.TableNumber)
}

// SaveEBill handles POST /api/orders/save-ebill
// Creates an order, marks it as completed, and creates a bill atomically.
// Used for recording orders without occupying a table (e.g., missed orders).
func (h *Handler) SaveEBill(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.Order
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	if req.TableID != "" && !h.requireRecordBelongsToStore(w, r, "tables", req.TableID, targetStoreID, "Table") {
		return
	}

	orderID := uuid.New().String()
	invoiceNo := fmt.Sprintf("INV-%d", time.Now().Unix())
	paymentMethod := req.PaymentMethod
	if paymentMethod == "" {
		paymentMethod = "upi"
	}

	order := models.Order{
		ID:             orderID,
		StoreID:        targetStoreID,
		TableID:        req.TableID,
		TableNumber:    req.TableNumber,
		TableName:      req.TableName,
		Status:         "active",
		OrderType:      "dine_in",
		CustomerName:   req.CustomerName,
		CustomerMobile: req.CustomerMobile,
		TotalAmount:    req.TotalAmount,
		TaxAmount:      req.TaxAmount,
		DiscountAmount: req.DiscountAmount,
		PaymentMethod:  paymentMethod,
		PaymentStatus:  "paid",
		CreatedBy:      claims.ID,
		Items:          req.Items,
	}

	// Create order
	if err := h.Repo.Order.Create(r.Context(), order); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Complete order immediately
	if err := h.Repo.Order.Complete(r.Context(), orderID, paymentMethod, claims.ID); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Create bill
	bill := models.Bill{
		ID:             uuid.New().String(),
		StoreID:        targetStoreID,
		OrderID:        orderID,
		TableNumber:    req.TableNumber,
		TableName:      req.TableName,
		InvoiceNo:      invoiceNo,
		Subtotal:       req.TotalAmount,
		TaxTotal:       req.TaxAmount,
		Discount:       req.DiscountAmount,
		Total:          req.TotalAmount + req.TaxAmount - req.DiscountAmount,
		PaymentMethod:  paymentMethod,
		CustomerName:   req.CustomerName,
		CustomerMobile: req.CustomerMobile,
		GeneratedBy:    claims.ID,
	}
	if err := h.Repo.Bill.Create(r.Context(), bill); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Fetch fully created order
	createdOrder, errFetch := h.Repo.Order.GetByID(r.Context(), orderID)
	if errFetch != nil || createdOrder == nil {
		h.writeJSON(w, http.StatusCreated, order)
		return
	}

	h.broadcastTableStatusUpdate(targetStoreID, "order_completed")
	h.writeJSON(w, http.StatusCreated, createdOrder)
}

// SavePrint handles POST /api/orders/:id/save-print
// Creates a bill for an existing order and marks it as completed.
func (h *Handler) SavePrint(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	var req models.Bill
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	// Verify order exists and belongs to the store
	order, err := h.Repo.Order.GetByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if order == nil || order.StoreID != targetStoreID {
		h.writeError(w, http.StatusNotFound, "Order not found")
		return
	}

	invoiceNo := req.InvoiceNo
	if invoiceNo == "" {
		invoiceNo = fmt.Sprintf("INV-%d", time.Now().Unix())
	}

	paymentMethod := req.PaymentMethod
	if paymentMethod == "" {
		paymentMethod = "upi"
	}

	bill := models.Bill{
		ID:             uuid.New().String(),
		StoreID:        targetStoreID,
		OrderID:        id,
		TableNumber:    req.TableNumber,
		TableName:      req.TableName,
		InvoiceNo:      invoiceNo,
		Subtotal:       req.Subtotal,
		TaxTotal:       req.TaxTotal,
		Discount:       req.Discount,
		Total:          req.Total,
		PaymentMethod:  paymentMethod,
		CustomerName:   req.CustomerName,
		CustomerMobile: req.CustomerMobile,
		GeneratedBy:    claims.ID,
	}

	if err := h.Repo.Bill.Create(r.Context(), bill); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := h.Repo.Order.Complete(r.Context(), id, paymentMethod, claims.ID); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	completedOrder, errFetch := h.Repo.Order.GetByID(r.Context(), id)
	if errFetch != nil || completedOrder == nil {
		h.writeError(w, http.StatusNotFound, "Order not found after update")
		return
	}

	h.broadcastTableStatusUpdate(targetStoreID, "order_completed")
	h.writeJSON(w, http.StatusOK, completedOrder)
}

// CreateParcelOrder handles POST /api/orders/parcel
func (h *Handler) CreateParcelOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		StoreID        string             `json:"storeId"`
		Items          []models.OrderItem `json:"items"`
		TotalAmount    float64            `json:"totalAmount"`
		TaxAmount      float64            `json:"taxAmount"`
		DiscountAmount float64            `json:"discountAmount"`
		PaymentMethod  string             `json:"paymentMethod"`
		CustomerName   string             `json:"customerName"`
		CustomerMobile string             `json:"customerMobile"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	orderID := uuid.New().String()
	invoiceNo := fmt.Sprintf("INV-%d", time.Now().Unix())

	order := models.Order{
		ID:             orderID,
		StoreID:        targetStoreID,
		TableID:        "",
		TableNumber:    0,
		Status:         "completed",
		OrderType:      "parcel",
		CustomerName:   req.CustomerName,
		CustomerMobile: req.CustomerMobile,
		TotalAmount:    req.TotalAmount,
		TaxAmount:      req.TaxAmount,
		DiscountAmount: req.DiscountAmount,
		PaymentMethod:  req.PaymentMethod,
		PaymentStatus:  "paid",
		CreatedBy:      claims.ID,
		Items:          req.Items,
	}

	// Use repository's Create which uses a transaction
	if err := h.Repo.Order.Create(r.Context(), order); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Update status to completed (Create inserts as 'active', so we need to update)
	if err := h.Repo.Order.Complete(r.Context(), orderID, req.PaymentMethod, claims.ID); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Create bill
	bill := models.Bill{
		ID:             uuid.New().String(),
		StoreID:        targetStoreID,
		OrderID:        orderID,
		TableNumber:    0,
		InvoiceNo:      invoiceNo,
		Subtotal:       req.TotalAmount,
		TaxTotal:       req.TaxAmount,
		Discount:       req.DiscountAmount,
		Total:          req.TotalAmount + req.TaxAmount - req.DiscountAmount,
		PaymentMethod:  req.PaymentMethod,
		CustomerName:   req.CustomerName,
		CustomerMobile: req.CustomerMobile,
		GeneratedBy:    claims.ID,
	}
	if err := h.Repo.Bill.Create(r.Context(), bill); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Fetch fully created order
	createdOrder, errFetch := h.Repo.Order.GetByID(r.Context(), orderID)
	if errFetch != nil || createdOrder == nil {
		h.writeJSON(w, http.StatusCreated, order)
		return
	}

	h.writeJSON(w, http.StatusCreated, createdOrder)
}

// ==========================================
// BILL HANDLERS
// ==========================================

// GetBills handles GET /api/bills
func (h *Handler) GetBills(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := repository.BillFilter{
		From:  parseTimeQuery(r, "from"),
		To:    parseTimeQuery(r, "to"),
		Limit: parseLimitQuery(r, maxListLimit),
	}

	bills, err := h.Repo.Bill.GetAll(r.Context(), targetStoreID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if bills == nil {
		bills = []models.Bill{}
	}

	h.writeJSON(w, http.StatusOK, bills)
}

// CreateBill handles POST /api/bills
func (h *Handler) CreateBill(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.Bill
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	if req.OrderID != "" && !h.requireRecordBelongsToStore(w, r, "orders", req.OrderID, targetStoreID, "Order") {
		return
	}

	req.ID = uuid.New().String()
	req.StoreID = targetStoreID
	req.GeneratedBy = claims.ID

	if err := h.Repo.Bill.Create(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, req)
}

// GetNextInvoiceNo handles GET /api/bills/next-invoice-no
func (h *Handler) GetNextInvoiceNo(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	invoiceNo, err := h.Repo.Bill.GetNextInvoiceNo(r.Context(), targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, models.NextInvoiceNoResponse{InvoiceNo: invoiceNo})
}

// PrintBill handles POST /api/bills/:id/print
func (h *Handler) PrintBill(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	if !h.requireRecordStoreAccess(w, r, claims, "bills", id) {
		return
	}

	err := h.Repo.Bill.MarkAsPrinted(r.Context(), id, claims.ID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Bill marked as printed"})
}

// queuePrintItem is the print-ready line-item shape embedded in billData so
// the designated printer never has to look the order up itself.
type queuePrintItem struct {
	Name       string  `json:"name"`
	HSN        string  `json:"hsn,omitempty"`
	Qty        int     `json:"qty"`
	Unit       string  `json:"unit"`
	Rate       float64 `json:"rate"`
	TaxPercent float64 `json:"taxPercent"`
	Amount     float64 `json:"amount"`
}

// QueueBill handles POST /api/bills/queue
func (h *Handler) QueueBill(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req struct {
		OrderID       string  `json:"orderId"`
		TableNumber   int     `json:"tableNumber"`
		TableName     string  `json:"tableName"`
		InvoiceNo     string  `json:"invoiceNo"`
		Subtotal      float64 `json:"subtotal"`
		TaxTotal      float64 `json:"taxTotal"`
		Discount      float64 `json:"discount"`
		Total         float64 `json:"total"`
		PaymentMethod string  `json:"paymentMethod"`
		CustomerName  string  `json:"customerName"`
		StoreID       string  `json:"storeId"`
	}

	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	if req.OrderID != "" && !h.requireRecordBelongsToStore(w, r, "orders", req.OrderID, targetStoreID, "Order") {
		return
	}

	// Verify if remote billing is enabled for the store
	store, err := h.Repo.Store.GetByID(r.Context(), targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if store == nil {
		h.writeError(w, http.StatusNotFound, "Store not found")
		return
	}
	if !store.RemoteBillingEnabled {
		h.writeError(w, http.StatusBadRequest, "Remote billing is not enabled for this store")
		return
	}

	// Embed print-ready line items server-side so the bill is self-contained:
	// the printer never depends on fetching the order (which may already be
	// completed or otherwise filtered out of list endpoints).
	printItems := make([]queuePrintItem, 0)
	if req.OrderID != "" {
		order, err := h.Repo.Order.GetByID(r.Context(), req.OrderID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if order != nil {
			for _, oi := range order.Items {
				rate := oi.UnitPrice
				if rate == 0 {
					rate = oi.Item.Price
				}
				printItems = append(printItems, queuePrintItem{
					Name:       oi.Item.Name,
					HSN:        oi.Item.Description,
					Qty:        oi.Quantity,
					Unit:       "PCS",
					Rate:       rate,
					TaxPercent: oi.TaxPercent,
					Amount:     rate * float64(oi.Quantity),
				})
			}
		}
	}

	queueID := uuid.New().String()

	// Build JSON representation matching database DTO
	billDataMap := map[string]interface{}{
		"orderId":       req.OrderID,
		"tableNumber":   req.TableNumber,
		"tableName":     req.TableName,
		"invoiceNo":     req.InvoiceNo,
		"subtotal":      req.Subtotal,
		"taxTotal":      req.TaxTotal,
		"discount":      req.Discount,
		"total":         req.Total,
		"paymentMethod": req.PaymentMethod,
		"customerName":  req.CustomerName,
		"generatedBy":   claims.ID,
		"items":         printItems,
	}

	billDataBytes, err := json.Marshal(billDataMap)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to marshal bill data: "+err.Error())
		return
	}

	// Persist the job in the store's Redis queue (durable backlog)...
	err = h.Repo.Bill.QueueBill(r.Context(), queueID, targetStoreID, req.OrderID, billDataBytes)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// ...then push it to the store's designated printer instantly. The print
	// channel is only open to the designated device, so the event can never
	// reach another store or an unauthorized machine.
	if h.PrintHub != nil {
		msg, err := json.Marshal(map[string]interface{}{
			"type":    "bill_print_request",
			"storeId": targetStoreID,
			"queueId": queueID,
			"orderId": req.OrderID,
			"billData": json.RawMessage(billDataBytes),
		})
		if err == nil {
			h.PrintHub.Broadcast(targetStoreID, string(msg))
		}
	}

	printerOnline := h.PrintHub != nil && store.RemotePrinterDeviceID != "" &&
		h.PrintHub.IsDeviceConnected(targetStoreID, store.RemotePrinterDeviceID)

	h.writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success":       true,
		"message":       "Bill generation request queued successfully",
		"queueId":       queueID,
		"storeId":       targetStoreID,
		"orderId":       req.OrderID,
		"printerOnline": printerOnline,
	})
}

// requirePrintDevice verifies that the caller's device is the store's
// designated remote bill printer. Every print-facing endpoint (queue read,
// claim, ack, websocket) gates on this so a queued bill can only ever be
// touched by its own store's designated machine. Returns the store on success.
func (h *Handler) requirePrintDevice(w http.ResponseWriter, r *http.Request, storeID, deviceID string) (*models.Store, bool) {
	if deviceID == "" {
		h.writeError(w, http.StatusBadRequest, "deviceId is required")
		return nil, false
	}
	store, err := h.Repo.Store.GetByID(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return nil, false
	}
	if store == nil {
		h.writeError(w, http.StatusNotFound, "Store not found")
		return nil, false
	}
	if store.RemotePrinterDeviceID == "" || store.RemotePrinterDeviceID != deviceID {
		h.writeError(w, http.StatusForbidden, "This device is not the designated bill printer for this store")
		return nil, false
	}
	return store, true
}

// GetBillQueue handles GET /api/bills/queue — non-destructive catch-up read
// for the designated printer (e.g. after a websocket reconnect).
func (h *Handler) GetBillQueue(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	if _, ok := h.requirePrintDevice(w, r, targetStoreID, r.URL.Query().Get("deviceId")); !ok {
		return
	}

	queueItems, err := h.Repo.Bill.GetStoreBillQueue(r.Context(), targetStoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if queueItems == nil {
		queueItems = []models.BillQueueItem{}
	}

	h.writeJSON(w, http.StatusOK, queueItems)
}

// ClaimQueuedBill handles POST /api/bills/queue/{id}/claim — atomic first-wins
// claim so at most one device instance prints a given bill.
func (h *Handler) ClaimQueuedBill(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	queueID := chi.URLParam(r, "id")

	var req struct {
		StoreID  string `json:"storeId"`
		DeviceID string `json:"deviceId"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	if _, ok := h.requirePrintDevice(w, r, targetStoreID, req.DeviceID); !ok {
		return
	}

	// The item must live inside THIS store's queue — an ID belonging to
	// another store simply isn't found here.
	item, _, err := h.Repo.Bill.FindBillQueueItem(r.Context(), targetStoreID, queueID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if item == nil {
		h.writeError(w, http.StatusNotFound, "Queue item not found")
		return
	}
	if time.Since(item.CreatedAt) >= repository.BillQueueItemTTL {
		h.writeError(w, http.StatusGone, "Queue item expired")
		return
	}

	claimed, err := h.Repo.Bill.ClaimBillQueueItem(r.Context(), targetStoreID, queueID, req.DeviceID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !claimed {
		h.writeError(w, http.StatusConflict, "Bill is already being printed")
		return
	}

	h.writeJSON(w, http.StatusOK, item)
}

// AckQueuedBill handles POST /api/bills/queue/{id}/ack — removes the job from
// the queue after a print attempt and records the outcome.
func (h *Handler) AckQueuedBill(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	queueID := chi.URLParam(r, "id")

	var req struct {
		StoreID  string `json:"storeId"`
		DeviceID string `json:"deviceId"`
		Status   string `json:"status"`
		Error    string `json:"error"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if req.Status != "printed" && req.Status != "failed" {
		h.writeError(w, http.StatusBadRequest, "status must be 'printed' or 'failed'")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	if _, ok := h.requirePrintDevice(w, r, targetStoreID, req.DeviceID); !ok {
		return
	}

	if err := h.Repo.Bill.AckBillQueueItem(r.Context(), targetStoreID, queueID, req.Status, req.Error); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// GetBillQueueStatus handles GET /api/bills/queue/{id}/status — lets the
// requester check whether a queued bill was printed, failed, or expired.
func (h *Handler) GetBillQueueStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	queueID := chi.URLParam(r, "id")

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	result, err := h.Repo.Bill.GetBillQueueResult(r.Context(), targetStoreID, queueID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if result == nil {
		// No terminal result yet: still pending in the queue, or never existed.
		item, _, err := h.Repo.Bill.FindBillQueueItem(r.Context(), targetStoreID, queueID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if item == nil {
			h.writeError(w, http.StatusNotFound, "Queue item not found")
			return
		}
		h.writeJSON(w, http.StatusOK, map[string]string{"queueId": queueID, "status": "pending"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(result)
}
