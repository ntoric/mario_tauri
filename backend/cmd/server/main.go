package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"cafe-backend/internal/config"
	"cafe-backend/internal/db"
	"cafe-backend/internal/handler"
	"cafe-backend/internal/middleware"
	"cafe-backend/internal/queue"
	"cafe-backend/internal/realtime"
	"cafe-backend/internal/repository"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/cors"
)

func main() {
	log.Println("Starting Cafe Backend (Go Version)...")

	// 1. Load Configurations
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// 2. Initialize Database Pool and Migrations
	sqlDB, err := db.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer sqlDB.Close()
	log.Printf("Successfully connected to Database: %s on host: %s", cfg.DBName, cfg.DBHost)

	// Start Background Bill Queue Processor
	queue.StartProcessor(sqlDB, cfg)

	// Start Background Periodic Cleanup Worker
	queue.StartCleanupProcessor(sqlDB, cfg)

	// 3. Initialize Repository and Handler Layer
	redisCache := repository.NewRedisCache(cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	if err := redisCache.Ping(context.Background()); err != nil {
		log.Printf("Redis unavailable, continuing without cache: %v", err)
		redisCache = nil
	} else {
		log.Printf("Connected to Redis at %s (db=%d)", cfg.RedisAddr, cfg.RedisDB)
	}
	repo := repository.NewRepository(sqlDB, redisCache)
	realtimeHub := realtime.NewHub()
	h := handler.NewHandler(repo, cfg, realtimeHub)

	// 5. Setup Router & Middlewares
	r := chi.NewRouter()

	// Standard middlewares
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	// CORS Config — restrict origins in production, allow all in development
	allowedOrigins := []string{"http://localhost:1420", "http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:1420", "tauri://localhost"}
	if cfg.Port != "" {
		allowedOrigins = append(allowedOrigins, "http://localhost:"+cfg.Port)
	}
	if envOrigins := os.Getenv("CORS_ALLOWED_ORIGINS"); envOrigins != "" {
		allowedOrigins = strings.Split(envOrigins, ",")
	}
	c := cors.New(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // 5 minutes
	})
	r.Use(c.Handler)

	// --- ROUTE REGISTRATION ---

	// Public Health Check
	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status": "ok"}`))
	})

	// Public Routes
	r.Group(func(r chi.Router) {
		r.Post("/api/auth/login", h.Login)
		r.Get("/api/stores/default", h.GetDefaultStore)
		r.Get("/api/support-config", h.GetSupportConfig)
		r.Get("/api/app-update", h.GetAppUpdate)
		r.Get("/api/app-updates", h.GetAllAppUpdates)
	})

	// Protected Routes (JWT Auth required)
	r.Group(func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(sqlDB, cfg.JWTSecret))

		// Auth & Me
		r.Get("/api/auth/me", h.Me)

		// Stores
		r.Get("/api/stores", h.GetStores)
		r.Get("/api/stores/{id}", h.GetStore)
		r.Post("/api/stores", h.CreateStore)
		r.Put("/api/stores/{id}", h.UpdateStore)
		r.Delete("/api/stores/{id}", h.DeleteStore)
		r.Post("/api/stores/switch", h.SwitchStore)
		r.Post("/api/stores/{id}/logo", h.UploadLogo)
		r.Delete("/api/stores/{id}/logo", h.DeleteLogo)

		// Users
		r.Get("/api/users", h.GetUsers)
		r.Post("/api/users", h.CreateUser)
		r.Put("/api/users/{id}", h.UpdateUser)
		r.Delete("/api/users/{id}", h.DeleteUser)
		r.Post("/api/users/change-password", h.ChangePassword)
		r.Post("/api/users/{id}/reset-password", h.ResetPassword)

		// Categories
		r.Get("/api/categories", h.GetCategories)
		r.Post("/api/categories", h.CreateCategory)
		r.Put("/api/categories/{id}", h.UpdateCategory)
		r.Delete("/api/categories/{id}", h.DeleteCategory)

		// Items
		r.Get("/api/items", h.GetItems)
		r.Post("/api/items", h.CreateItem)
		r.Put("/api/items/{id}", h.UpdateItem)
		r.Delete("/api/items/{id}", h.DeleteItem)

		// Tables
		r.Get("/api/tables", h.GetTables)
		r.Get("/api/ws/tables-status", h.TableStatusWS)
		r.Post("/api/tables", h.CreateTable)
		r.Put("/api/tables/{id}", h.UpdateTable)
		r.Delete("/api/tables/{id}", h.DeleteTable)

		// Orders
		r.Get("/api/orders", h.GetOrders)
		r.Post("/api/orders", h.CreateOrder)
		r.Post("/api/orders/parcel", h.CreateParcelOrder)
		r.Put("/api/orders/{id}", h.UpdateOrder)
		r.Patch("/api/orders/{id}/complete", h.CompleteOrder)
		r.Patch("/api/orders/{id}/cancel", h.CancelOrder)

		// Bills
		r.Get("/api/bills", h.GetBills)
		r.Post("/api/bills", h.CreateBill)
		r.Post("/api/bills/queue", h.QueueBill)
		r.Get("/api/bills/queue", h.GetBillQueue)
		r.Get("/api/bills/next-invoice-no", h.GetNextInvoiceNo)

		// System
		r.Post("/api/system/reset", h.SystemReset)
		r.Get("/api/system/stats", h.GetStats)
		r.Get("/api/system/config", h.GetSystemConfig)
		r.Post("/api/system/config", h.UpdateSystemConfig)

		// App Update (POST requires superadmin)
		r.Post("/api/app-update", h.UpdateAppUpdate)

		// Support Config (POST requires superadmin)
		r.Post("/api/support-config", h.UpdateSupportConfig)
	})

	// 6. Start HTTP Server with Graceful Shutdown
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Run server in background goroutine
	go func() {
		log.Printf("Server running on port %s", cfg.Port)
		log.Printf("Superadmin: %s", cfg.SuperadminUsername)

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe failed: %v", err)
		}
	}()

	// Watch system signals for graceful closure
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit

	log.Printf("Received system signal: %s. Shutting down gracefully...", sig)

	// Graceful shutdown context
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Stop HTTP server
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server shutdown failure: %v", err)
	}

	log.Println("Server exited and resources cleaned up.")
}
