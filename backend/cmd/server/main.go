package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cafe-backend/internal/config"
	"cafe-backend/internal/db"
	"cafe-backend/internal/handler"
	"cafe-backend/internal/middleware"
	"cafe-backend/internal/queue"
	"cafe-backend/internal/realtime"
	"cafe-backend/internal/repository"
	"cafe-backend/internal/session"

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
	printHub := realtime.NewPrintHub()

	// Cross-instance realtime relay. Clients are spread over multiple backend
	// processes (mobile and desktop hit different hosts backed by this same
	// database), so broadcasts are republished through Postgres LISTEN/NOTIFY
	// and every instance re-delivers them to its own websocket clients.
	pgBridge := realtime.NewPgBridge(sqlDB, db.ConnString(cfg), realtimeHub)
	realtimeHub.SetPublisher(pgBridge.Publish)
	bridgeCtx, stopBridge := context.WithCancel(context.Background())
	defer stopBridge()
	go pgBridge.Listen(bridgeCtx)

	// Expire remote-bill print jobs that never got acked by the printer.
	queue.StartBillQueueSweeper(repo, printHub)

	// Server-side session store backed by Redis. Required for auth: if Redis is
	// unavailable, protected endpoints return 503 rather than trusting tokens.
	var sessionStore *session.Store
	if redisCache != nil {
		sessionStore = session.New(redisCache.Client(), 24*time.Hour)
	} else {
		log.Println("WARNING: Redis unavailable — session store disabled; all authenticated requests will fail")
	}
	h := handler.NewHandler(repo, cfg, realtimeHub, printHub, sessionStore)

	// 5. Setup Router & Middlewares
	r := chi.NewRouter()

	// Standard middlewares
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Compress(5))

	// JSON-lines request log, retained ~24h and purged daily at 03:00 IST.
	if reqLogger, err := middleware.NewRequestLogger(cfg.RequestLogDir, sessionStore); err != nil {
		log.Printf("Request logging disabled: %v", err)
	} else {
		r.Use(reqLogger.Middleware)
		reqLogger.StartDailyCleanup()
	}

	// CORS Config matching Node.js
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
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
		r.Post("/api/auth/logout", h.Logout)
		r.Get("/api/stores/default", h.GetDefaultStore)
		r.Get("/api/support-config", h.GetSupportConfig)
		r.Get("/api/app-update", h.GetAppUpdate)
		r.Get("/api/app-updates", h.GetAllAppUpdates)
		r.Get("/api/update/manifest", h.GetUpdateManifest)
	})

	// Protected Routes (JWT Auth required)
	r.Group(func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(sqlDB, sessionStore))

		// Auth & Me
		r.Get("/api/auth/me", h.Me)
		r.Post("/api/auth/app-version", h.ReportAppVersion)

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
		r.Post("/api/categories/reorder", h.ReorderCategories)
		r.Put("/api/categories/{id}", h.UpdateCategory)
		r.Delete("/api/categories/{id}", h.DeleteCategory)

		// Items
		r.Get("/api/items", h.GetItems)
		r.Post("/api/items", h.CreateItem)
		r.Put("/api/items/{id}", h.UpdateItem)
		r.Delete("/api/items/{id}", h.DeleteItem)
		r.Get("/api/items/{itemId}/expenses", h.GetItemExpenses)
		r.Post("/api/items/{itemId}/expenses", h.CreateItemExpense)
		r.Put("/api/item-expenses/{id}", h.UpdateItemExpense)
		r.Delete("/api/item-expenses/{id}", h.DeleteItemExpense)

		// Tables
		r.Get("/api/tables", h.GetTables)
		r.Get("/api/ws/tables-status", h.TableStatusWS)
		r.Post("/api/tables", h.CreateTable)
		r.Put("/api/tables/{id}", h.UpdateTable)
		r.Delete("/api/tables/{id}", h.DeleteTable)
		// Table sections (bulk operations)
		r.Get("/api/tables/sections", h.GetSections)
		r.Post("/api/tables/sections", h.CreateSection)
		r.Put("/api/tables/sections/rename", h.RenameSection)
		r.Put("/api/tables/sections/default", h.SetDefaultSection)
		r.Delete("/api/tables/sections/{name}", h.DeleteSection)

		// Orders
		r.Get("/api/orders", h.GetOrders)
		r.Post("/api/orders", h.CreateOrder)
		r.Post("/api/orders/save-ebill", h.SaveEBill)
		r.Post("/api/orders/{id}/save-print", h.SavePrint)
		r.Post("/api/orders/parcel", h.CreateParcelOrder)
		r.Put("/api/orders/{id}", h.UpdateOrder)
		r.Patch("/api/orders/{id}/complete", h.CompleteOrder)
		r.Patch("/api/orders/{id}/cancel", h.CancelOrder)
		r.Post("/api/orders/{id}/merge", h.MergeOrders)

		// Bills
		r.Get("/api/bills", h.GetBills)
		r.Post("/api/bills", h.CreateBill)
		r.Post("/api/bills/queue", h.QueueBill)
		r.Get("/api/bills/queue", h.GetBillQueue)
		r.Post("/api/bills/queue/{id}/claim", h.ClaimQueuedBill)
		r.Post("/api/bills/queue/{id}/ack", h.AckQueuedBill)
		r.Get("/api/bills/queue/{id}/status", h.GetBillQueueStatus)
		r.Get("/api/bills/next-invoice-no", h.GetNextInvoiceNo)

		// Remote bill printing — designated-printer websocket channel
		r.Get("/api/ws/bill-print", h.BillPrintWS)

		// System
		r.Post("/api/system/reset", h.SystemReset)
		r.Get("/api/system/stats", h.GetStats)
		r.Get("/api/system/config", h.GetSystemConfig)
		r.Post("/api/system/config", h.UpdateSystemConfig)

		// App Update (POST requires superadmin)
		r.Post("/api/app-update", h.UpdateAppUpdate)

		// Support Config (POST requires superadmin)
		r.Post("/api/support-config", h.UpdateSupportConfig)

		// Support Tickets — store users raise/manage their own; superadmin sees all
		r.Get("/api/support/tickets", h.GetSupportTickets)
		r.Post("/api/support/tickets", h.CreateSupportTicket)
		r.Get("/api/support/tickets/{id}", h.GetSupportTicket)
		r.Post("/api/support/tickets/{id}/messages", h.CreateSupportMessage)
		r.Patch("/api/support/tickets/{id}/status", h.UpdateSupportTicketStatus)
		r.Get("/api/admin/support/tickets", h.GetAllSupportTickets)

		// Update Repo Config (superadmin only)
		r.Get("/api/system/update-config", h.GetUpdateRepoConfig)
		r.Post("/api/system/update-config", h.UpdateUpdateRepoConfig)

		// Gemini Config & AI Menu Parsing (superadmin only)
		r.Get("/api/system/gemini-config", h.GetGeminiConfig)
		r.Post("/api/system/gemini-config", h.UpdateGeminiConfig)
		r.Get("/api/system/gemini-models", h.ListGeminiModels)
		r.Post("/api/menu/parse", h.ParseMenuImage)
		r.Post("/api/menu/bulk", h.BulkCreateMenu)

		// Expense Categories
		r.Get("/api/expense-categories", h.GetExpenseCategories)
		r.Post("/api/expense-categories", h.CreateExpenseCategory)
		r.Put("/api/expense-categories/{id}", h.UpdateExpenseCategory)
		r.Delete("/api/expense-categories/{id}", h.DeleteExpenseCategory)

		// Expenses
		r.Get("/api/expenses", h.GetExpenses)
		r.Get("/api/expenses/{id}", h.GetExpense)
		r.Post("/api/expenses", h.CreateExpense)
		r.Put("/api/expenses/{id}", h.UpdateExpense)
		r.Delete("/api/expenses/{id}", h.DeleteExpense)

		// Expense Reports
		r.Get("/api/expenses/report/by-category", h.GetExpenseReportByCategory)
		r.Get("/api/expenses/report/by-date", h.GetExpenseSummaryByDate)

		// Revenue Report
		r.Get("/api/reports/revenue", h.GetRevenueReport)
		r.Get("/api/reports/item-profit", h.GetItemProfitReport)
		r.Get("/api/reports/top-selling-items", h.GetTopSellingItems)
		r.Get("/api/reports/top-selling-categories", h.GetTopSellingCategories)
		r.Get("/api/reports/sales-profit", h.GetSalesProfitReport)
		r.Get("/api/reports/menu-profit", h.GetMenuProfitReport)
		r.Get("/api/reports/expenses-by-category", h.GetExpenseCategoryReport)
		r.Get("/api/reports/expenses-by-date", h.GetExpenseDateReport)
		r.Get("/api/reports/revenue-entries", h.GetRevenueEntries)
		r.Get("/api/reports/expense-entries", h.GetExpenseEntries)
	})

	// 6. Start HTTP Server with Graceful Shutdown
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
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
