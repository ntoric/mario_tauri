package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"fmt"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ==========================================
// ORDER HANDLERS
// ==========================================

// GetOrders handles GET /api/orders
func (h *Handler) GetOrders(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	status := r.URL.Query().Get("status")

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	orders, err := h.Repo.Order.GetAll(r.Context(), targetStoreID, status)
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
		} else {
			// The target table must belong to the same store as the order,
			// otherwise the order would surface in another store's table view.
			if !h.requireRecordBelongsToStore(w, r, "tables", tableID, orderStoreID, "Table") {
				return
			}
			updates["table_id"] = tableID
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

	bills, err := h.Repo.Bill.GetAll(r.Context(), targetStoreID)
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

// QueueBill handles POST /api/bills/queue
func (h *Handler) QueueBill(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	fmt.Println("Claims : ", claims)

	var req struct {
		OrderID       string  `json:"orderId"`
		TableNumber   int     `json:"tableNumber"`
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
		fmt.Println("Error : ", err)
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	fmt.Println("REQ : ", req)

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
		fmt.Println("Error 2. : ", err)
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if store == nil {
		fmt.Println("Error 3 : ", err)
		h.writeError(w, http.StatusNotFound, "Store not found")
		return
	}
	fmt.Println("store.RemoteBillingEnabled : ", store.RemoteBillingEnabled)
	if !store.RemoteBillingEnabled {
		h.writeError(w, http.StatusBadRequest, "Remote billing is not enabled for this store")
		return
	}

	queueID := uuid.New().String()

	// Build JSON representation matching database DTO
	billDataMap := map[string]interface{}{
		"orderId":       req.OrderID,
		"tableNumber":   req.TableNumber,
		"invoiceNo":     req.InvoiceNo,
		"subtotal":      req.Subtotal,
		"taxTotal":      req.TaxTotal,
		"discount":      req.Discount,
		"total":         req.Total,
		"paymentMethod": req.PaymentMethod,
		"customerName":  req.CustomerName,
		"generatedBy":   claims.ID,
	}

	fmt.Println("billDataMap : ", billDataMap)

	billDataBytes, err := json.Marshal(billDataMap)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to marshal bill data: "+err.Error())
		return
	}

	// Insert into bill_queue table via repository
	err = h.Repo.Bill.QueueBill(r.Context(), queueID, targetStoreID, req.OrderID, billDataBytes)
	if err != nil {
		fmt.Println("Error 4 : ", err)
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "Bill generation request queued successfully",
		"queueId": queueID,
		"storeId": targetStoreID,
		"orderId": req.OrderID,
	})
}

// GetBillQueue handles GET /api/bills/queue
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
