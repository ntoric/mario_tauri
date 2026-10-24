package queue

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"cafe-backend/internal/realtime"
	"cafe-backend/internal/repository"
)

// StartBillQueueSweeper expires remote-bill print jobs that were never acked.
// Queue items live in Redis (bill_queue:{storeId}); the desktop printer pushes
// an ack after printing, and anything still pending after
// repository.BillQueueItemTTL is dropped here and announced to the store so a
// dead printer fails loudly instead of silently printing stale bills later.
func StartBillQueueSweeper(repo *repository.Repository, printHub *realtime.PrintHub) {
	if repo == nil || printHub == nil {
		log.Println("[Bill Queue] Sweeper not started — repository or print hub unavailable")
		return
	}

	log.Println("[Bill Queue] Expiry sweeper started (checking every 15 seconds)")

	ticker := time.NewTicker(15 * time.Second)
	go func() {
		for t := range ticker.C {
			if InQuietHours(t) {
				continue
			}
			expireStaleItems(repo, printHub)
		}
	}()
}

func expireStaleItems(repo *repository.Repository, printHub *realtime.PrintHub) {
	ctx := context.Background()

	expired, err := repo.Bill.ExpireBillQueueItems(ctx, repository.BillQueueItemTTL)
	if err != nil {
		log.Printf("[Bill Queue Error] Failed to expire stale queue items: %v", err)
		return
	}

	for _, item := range expired {
		log.Printf("[Bill Queue] Expired unprinted bill job %s for store %s (order %s)", item.ID, item.StoreID, item.OrderID)
		msg, err := json.Marshal(map[string]string{
			"type":    "bill_print_expired",
			"storeId": item.StoreID,
			"queueId": item.ID,
			"orderId": item.OrderID,
		})
		if err == nil {
			printHub.Broadcast(item.StoreID, string(msg))
		}
	}
}
