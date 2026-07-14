package queue

import (
	"context"
	"database/sql"
	"log"
	"strconv"
	"time"

	"cafe-backend/internal/config"
)

var isRunningCleanup = false

/**
 * StartCleanupProcessor starts the background 1-minute ticker for global periodic cleanups.
 */
func StartCleanupProcessor(db *sql.DB, cfg *config.Config) {
	log.Println("[Cleanup] Periodic cleanup background worker started (Checking every 1 minute)")

	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for range ticker.C {
			checkAndRunCleanup(db)
		}
	}()
}

func checkAndRunCleanup(db *sql.DB) {
	if isRunningCleanup {
		return
	}
	isRunningCleanup = true
	defer func() {
		isRunningCleanup = false
	}()

	ctx := context.Background()

	// 1. Get global settings
	rows, err := db.QueryContext(ctx, "SELECT key, value FROM global_settings")
	if err != nil {
		log.Printf("[Cleanup Error] Failed to fetch settings: %v", err)
		return
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var key, val string
		if err := rows.Scan(&key, &val); err != nil {
			log.Printf("[Cleanup Error] Failed to scan setting row: %v", err)
			continue
		}
		settings[key] = val
	}

	enabled := settings["cleanup_enabled"] == "true"
	intervalStr := settings["cleanup_interval_mins"]
	lastRunStr := settings["cleanup_last_run"]

	if !enabled {
		return
	}

	intervalMins, err := strconv.Atoi(intervalStr)
	if err != nil || intervalMins <= 0 {
		intervalMins = 60
	}

	now := time.Now()
	var lastRun time.Time

	if lastRunStr != "" {
		parsedTime, err := time.Parse(time.RFC3339, lastRunStr)
		if err == nil {
			lastRun = parsedTime
		}
	}

	// If no last run timestamp, initialize to now
	if lastRun.IsZero() {
		_, err = db.ExecContext(ctx, `
			INSERT INTO global_settings (key, value) VALUES ('cleanup_last_run', $1)
			ON CONFLICT (key) DO UPDATE SET value = $1
		`, now.Format(time.RFC3339))
		if err != nil {
			log.Printf("[Cleanup Error] Failed to initialize last run: %v", err)
		}
		return
	}

	nextRunTime := lastRun.Add(time.Duration(intervalMins) * time.Minute)

	if now.After(nextRunTime) || now.Equal(nextRunTime) {
		log.Printf("[Cleanup] Starting periodic cleanup of all stores' orders, bills, bill queues, and order items...")

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[Cleanup Error] Failed to begin transaction: %v", err)
			return
		}
		defer tx.Rollback()

		// Sequentially delete referencing items first to avoid foreign key violations
		queries := []string{
			"DELETE FROM bills",
			"DELETE FROM bill_queue",
			"DELETE FROM order_items",
			"DELETE FROM orders",
		}

		for _, q := range queries {
			_, err = tx.ExecContext(ctx, q)
			if err != nil {
				log.Printf("[Cleanup Error] Failed executing statement %s: %v", q, err)
				return
			}
		}

		err = tx.Commit()
		if err != nil {
			log.Printf("[Cleanup Error] Failed to commit transaction: %v", err)
			return
		}

		log.Printf("[Cleanup] Completed database cleanup successfully.")

		// Update last run time in DB
		_, err = db.ExecContext(ctx, `
			INSERT INTO global_settings (key, value) VALUES ('cleanup_last_run', $1)
			ON CONFLICT (key) DO UPDATE SET value = $1
		`, now.Format(time.RFC3339))
		if err != nil {
			log.Printf("[Cleanup Error] Failed to update last run: %v", err)
		}
	}
}
