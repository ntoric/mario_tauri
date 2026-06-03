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

	storeID := r.URL.Query().Get("storeId")
	status := r.URL.Query().Get("status")

	targetStoreID := storeID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}

	if targetStoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
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
	id := chi.URLParam(r, "id")

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
		updates["table_id"] = val
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

	err := h.Repo.Order.Update(r.Context(), id, updates, items, hasItems)
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
	id := chi.URLParam(r, "id")
	var req struct {
		PaymentMethod string `json:"paymentMethod"`
	}
	_ = h.readJSON(r, &req)

	err := h.Repo.Order.Complete(r.Context(), id, req.PaymentMethod)
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
func (h *Handler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	err := h.Repo.Order.Cancel(r.Context(), id)
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

	targetStoreID := req.StoreID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}
	if targetStoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
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
	if err := h.Repo.Order.Complete(r.Context(), orderID, req.PaymentMethod); err != nil {
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

	storeID := r.URL.Query().Get("storeId")
	targetStoreID := storeID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}

	if targetStoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
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

	storeID := r.URL.Query().Get("storeId")
	targetStoreID := storeID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
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
	id := chi.URLParam(r, "id")

	err := h.Repo.Bill.MarkAsPrinted(r.Context(), id)
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

	targetStoreID := req.StoreID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}

	if targetStoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
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

	storeID := r.URL.Query().Get("storeId")
	targetStoreID := storeID
	if targetStoreID == "" {
		targetStoreID = claims.StoreID
	}

	if targetStoreID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID required")
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
