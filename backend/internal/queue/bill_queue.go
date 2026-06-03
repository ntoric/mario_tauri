package queue

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"cafe-backend/internal/config"

	"github.com/google/uuid"
)

// BillData matches the JSON payload structure of enqueued bill data
type BillData struct {
	OrderID       string  `json:"orderId"`
	TableNumber   int     `json:"tableNumber"`
	InvoiceNo     string  `json:"invoiceNo"`
	Subtotal      float64 `json:"subtotal"`
	TaxTotal      float64 `json:"taxTotal"`
	Discount      float64 `json:"discount"`
	Total         float64 `json:"total"`
	PaymentMethod string  `json:"paymentMethod"`
	CustomerName  string  `json:"customerName"`
	GeneratedBy   string  `json:"generatedBy"`
}

// QueueItem represents a row in the bill_queue table
type QueueItem struct {
	ID        string
	StoreID   string
	OrderID   string
	BillData  []byte
	Status    string
	CreatedAt time.Time
}

// StartProcessor initializes and starts the background 2-second ticker for processing bills
func StartProcessor(db *sql.DB, cfg *config.Config) {
	log.Println("[Bill Queue] Background Go processor started (Checking every 2 seconds)")

	ticker := time.NewTicker(2 * time.Second)
	go func() {
		for range ticker.C {
			processPendingQueues(db, cfg)
		}
	}()
}

func processPendingQueues(db *sql.DB, cfg *config.Config) {
	// Reject/expire pending requests older than 1 minute
	_, err := db.Exec("UPDATE bill_queue SET status = 'failed', error_message = 'Rejected: Request expired (older than 1 minute)', updated_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 minute'")
	if err != nil {
		log.Printf("[Bill Queue Error] Failed to expire old requests: %v", err)
	}

	// 1. Get all stores that have pending bill requests
	rows, err := db.Query("SELECT DISTINCT store_id FROM bill_queue WHERE status = 'pending'")
	if err != nil {
		log.Printf("[Bill Queue Error] Failed to query pending stores: %v", err)
		return
	}
	defer rows.Close()

	var storeIDs []string
	for rows.Next() {
		var storeID string
		if err := rows.Scan(&storeID); err != nil {
			log.Printf("[Bill Queue Error] Failed to scan store ID: %v", err)
			continue
		}
		storeIDs = append(storeIDs, storeID)
	}

	if len(storeIDs) == 0 {
		return
	}

	// 2. Process each store sequentially
	for _, storeID := range storeIDs {
		// Check if a bill is already being generated/processed for this store
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM bill_queue WHERE store_id = $1 AND status = 'processing')", storeID).Scan(&exists)
		if err != nil {
			log.Printf("[Bill Queue Error] Store status check failed: %v", err)
			continue
		}

		if exists {
			// Skip store if an active bill is processing
			continue
		}

		// Fetch the oldest pending request for this store
		var item QueueItem
		err = db.QueryRow(
			"SELECT id, store_id, order_id, bill_data, status, created_at FROM bill_queue WHERE store_id = $1 AND status = 'pending' ORDER BY created_at ASC LIMIT 1",
			storeID,
		).Scan(&item.ID, &item.StoreID, &item.OrderID, &item.BillData, &item.Status, &item.CreatedAt)

		if err != nil {
			if err != sql.ErrNoRows {
				log.Printf("[Bill Queue Error] Failed to fetch next queue item: %v", err)
			}
			continue
		}

		// // Process the queue item in a separate goroutine
		// go func(qItem QueueItem) {
		// 	if err := handleQueueItem(db, cfg, qItem); err != nil {
		// 		log.Printf("[Bill Queue Error] Failed to process queue item %s: %v", qItem.ID, err)
		// 	}
		// }(item)
	}
}

func handleQueueItem(db *sql.DB, cfg *config.Config, item QueueItem) error {
	ctx := context.Background()

	// 1. Mark status as processing
	_, err := db.ExecContext(ctx, "UPDATE bill_queue SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = $1", item.ID)
	if err != nil {
		return fmt.Errorf("failed to mark queue item as processing: %w", err)
	}
	log.Printf("[Bill Queue] Processing item %s for store %s", item.ID, item.StoreID)

	// 2. Parse bill data
	var data BillData
	if err := json.Unmarshal(item.BillData, &data); err != nil {
		markFailed(db, item.ID, "JSON parse failure: "+err.Error())
		return fmt.Errorf("JSON unmarshal error: %w", err)
	}

	// 3. Start a database transaction to generate the bill and complete the order
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		markFailed(db, item.ID, "Transaction creation failed: "+err.Error())
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// 4. Create the bill
	billID := uuid.New().String()
	_, err = tx.ExecContext(ctx,
		`INSERT INTO bills (id, store_id, order_id, table_number, invoice_no, subtotal, tax_total, discount, total, payment_method, customer_name, generated_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		billID, item.StoreID, item.OrderID, data.TableNumber, data.InvoiceNo, data.Subtotal, data.TaxTotal, data.Discount, data.Total, data.PaymentMethod, data.CustomerName, data.GeneratedBy,
	)
	if err != nil {
		markFailed(db, item.ID, "Bill DB insert failed: "+err.Error())
		return fmt.Errorf("failed to create bill: %w", err)
	}

	// 5. Complete the order
	_, err = tx.ExecContext(ctx,
		"UPDATE orders SET status = 'completed', payment_method = $1, payment_status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $2",
		data.PaymentMethod, item.OrderID,
	)
	if err != nil {
		markFailed(db, item.ID, "Order complete DB update failed: "+err.Error())
		return fmt.Errorf("failed to complete order: %w", err)
	}

	// Commit database transaction
	if err := tx.Commit(); err != nil {
		markFailed(db, item.ID, "Transaction commit failed: "+err.Error())
		return fmt.Errorf("transaction commit failed: %w", err)
	}

	// Note: Printing is handled by the frontend directly

	// 6. Mark queue item as completed
	_, err = db.ExecContext(ctx, "UPDATE bill_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", item.ID)
	if err != nil {
		log.Printf("[Bill Queue Warning] Failed to update queue status to completed: %v", err)
	}

	log.Printf("[Bill Queue] Successfully completed queue item %s", item.ID)
	return nil
}

func markFailed(db *sql.DB, id string, errMsg string) {
	_, err := db.Exec("UPDATE bill_queue SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", errMsg, id)
	if err != nil {
		log.Printf("[Bill Queue Error] Failed to update queue status to failed: %v", err)
	}
}
