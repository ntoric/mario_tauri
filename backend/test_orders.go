package main

import (
	"database/sql"
	"fmt"
	"log"

	"cafe-backend/internal/config"

	_ "github.com/lib/pq"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}

	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Error opening connection: %v", err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, table_number, status, total_amount FROM orders WHERE status = 'active'")
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()

	log.Println("Active orders in database:")
	for rows.Next() {
		var id string
		var tableNum int
		var status string
		var amount float64
		_ = rows.Scan(&id, &tableNum, &status, &amount)
		log.Printf("  - Order ID: %s, Table: %d, Status: %s, Amount: %.2f", id, tableNum, status, amount)
	}
}
