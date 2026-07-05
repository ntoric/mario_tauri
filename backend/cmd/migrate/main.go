package main

import (
	"log"

	"cafe-backend/internal/config"
	"cafe-backend/internal/db"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Printf("Running migrations against %s:%d/%s ...", cfg.DBHost, cfg.DBPort, cfg.DBName)

	if err := db.Migrate(cfg); err != nil {
		log.Fatalf("Migration failed: %v", err)
	}
}
