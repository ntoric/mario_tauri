package db

import (
	"database/sql"
	"fmt"
	"log"

	"cafe-backend/internal/config"

	"cafe-backend/internal/security"

	_ "github.com/jackc/pgx/v5/stdlib"
)
 
func InitDB(cfg *config.Config) (*sql.DB, error) {
	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable default_query_exec_mode=simple_protocol",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName)
 
	db, err := sql.Open("pgx", connStr)
	if err != nil {
		return nil, fmt.Errorf("error opening db connection: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("error pinging db: %w", err)
	}

	if err := runMigrations(db, cfg); err != nil {
		db.Close()
		return nil, fmt.Errorf("migration failure: %w", err)
	}

	return db, nil
}

// Migrate opens a database connection and applies all pending migrations and seeds.
func Migrate(cfg *config.Config) error {
	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable default_query_exec_mode=simple_protocol",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName)

	db, err := sql.Open("pgx", connStr)
	if err != nil {
		return fmt.Errorf("error opening db connection: %w", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		return fmt.Errorf("error pinging db: %w", err)
	}

	if err := runMigrations(db, cfg); err != nil {
		return fmt.Errorf("migration failure: %w", err)
	}

	log.Println("Database migrations applied successfully")
	return nil
}

func runMigrations(db *sql.DB, cfg *config.Config) error {
	queries := []string{
		// Stores table
		`CREATE TABLE IF NOT EXISTS stores (
			id VARCHAR(255) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			branch VARCHAR(255),
			location TEXT,
			gstin VARCHAR(50),
			fssai_no VARCHAR(50),
			phone VARCHAR(50),
			printer_name VARCHAR(255),
			printer_vendor_id VARCHAR(50),
			printer_product_id VARCHAR(50),
			invoice_size VARCHAR(20) DEFAULT '3inch',
			kot_print_enabled BOOLEAN DEFAULT true,
			remote_billing_enabled BOOLEAN DEFAULT false,
			logo_url TEXT,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Users table
		`CREATE TABLE IF NOT EXISTS users (
			id VARCHAR(255) PRIMARY KEY,
			username VARCHAR(255) UNIQUE NOT NULL,
			password VARCHAR(255) NOT NULL,
			name VARCHAR(255) NOT NULL,
			email VARCHAR(255),
			role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'business_owner', 'business_admin', 'staff')),
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE SET NULL,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// User stores mapping table
		`CREATE TABLE IF NOT EXISTS user_stores (
			id SERIAL PRIMARY KEY,
			user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, store_id)
		)`,

		// Categories table
		`CREATE TABLE IF NOT EXISTS categories (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Items table
		`CREATE TABLE IF NOT EXISTS items (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			category_id VARCHAR(255) REFERENCES categories(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			price DECIMAL(10, 2) NOT NULL,
			hsn_code VARCHAR(50),
			tax_percent DECIMAL(5, 2) DEFAULT 0,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Tables table
		`CREATE TABLE IF NOT EXISTS tables (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			number INTEGER NOT NULL,
			seats INTEGER NOT NULL,
			position_x INTEGER DEFAULT 0,
			position_y INTEGER DEFAULT 0,
			is_active BOOLEAN DEFAULT true,
			UNIQUE(store_id, number)
		)`,

		// Orders table
		`CREATE TABLE IF NOT EXISTS orders (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			table_id VARCHAR(255) REFERENCES tables(id),
			table_number INTEGER NOT NULL,
			status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
			total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
			tax_amount DECIMAL(10, 2) DEFAULT 0,
			discount_amount DECIMAL(10, 2) DEFAULT 0,
			payment_method VARCHAR(50),
			payment_status VARCHAR(50) DEFAULT 'pending',
			created_by VARCHAR(255) REFERENCES users(id),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Order items table
		`CREATE TABLE IF NOT EXISTS order_items (
			id SERIAL PRIMARY KEY,
			order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
			item_id VARCHAR(255) REFERENCES items(id),
			quantity INTEGER NOT NULL,
			unit_price DECIMAL(10, 2) NOT NULL,
			tax_percent DECIMAL(5, 2) DEFAULT 0,
			notes TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Bills table
		`CREATE TABLE IF NOT EXISTS bills (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			order_id VARCHAR(255) REFERENCES orders(id),
			table_number INTEGER NOT NULL,
			invoice_no VARCHAR(50),
			subtotal DECIMAL(10, 2) NOT NULL,
			tax_total DECIMAL(10, 2) NOT NULL,
			discount DECIMAL(10, 2) DEFAULT 0,
			total DECIMAL(10, 2) NOT NULL,
			payment_method VARCHAR(50),
			customer_name VARCHAR(255),
			is_printed BOOLEAN DEFAULT false,
			generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			generated_by VARCHAR(255) REFERENCES users(id)
		)`,

		// Bill generation queue
		`CREATE TABLE IF NOT EXISTS bill_queue (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
			bill_data JSONB NOT NULL,
			status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
			error_message TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Settings table
		`CREATE TABLE IF NOT EXISTS settings (
			id SERIAL PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			key VARCHAR(255) NOT NULL,
			value TEXT,
			UNIQUE(store_id, key)
		)`,

		// Global/system settings table
		`CREATE TABLE IF NOT EXISTS global_settings (
			key VARCHAR(255) PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// App updates table
		`CREATE TABLE IF NOT EXISTS app_updates (
			id VARCHAR(255) PRIMARY KEY,
			platform VARCHAR(20) NOT NULL CHECK (platform IN ('mobile', 'desktop')),
			enabled BOOLEAN DEFAULT false,
			version VARCHAR(50) NOT NULL,
			download_url TEXT NOT NULL,
			release_notes TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(platform)
		)`,

		// Expense categories table
		`CREATE TABLE IF NOT EXISTS expense_categories (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Expenses table
		`CREATE TABLE IF NOT EXISTS expenses (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			category_id VARCHAR(255) REFERENCES expense_categories(id) ON DELETE SET NULL,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			amount DECIMAL(10, 2) NOT NULL,
			expense_date TIMESTAMP NOT NULL,
			payment_method VARCHAR(50),
			receipt_number VARCHAR(100),
			vendor VARCHAR(255),
			attachments JSONB DEFAULT '[]'::jsonb,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_by VARCHAR(255) REFERENCES users(id)
		)`,

		// Item preparation expenses (cost components per menu item)
		`CREATE TABLE IF NOT EXISTS item_expenses (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			item_id VARCHAR(255) REFERENCES items(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			amount DECIMAL(10, 2) NOT NULL,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Table sections — sections exist independently of tables so a section
		// can be created before any table is assigned to it.
		`CREATE TABLE IF NOT EXISTS table_sections (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(store_id, name)
		)`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			return fmt.Errorf("error executing DDL statement: %w\nQuery: %s", err, q)
		}
	}

	// Columns verification/migrations (ADD COLUMN IF NOT EXISTS)
	alterQueries := []string{
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS printer_name VARCHAR(255)`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS kot_print_enabled BOOLEAN DEFAULT true`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS remote_billing_enabled BOOLEAN DEFAULT false`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS logo_url TEXT`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS theme_color VARCHAR(50)`,
		// Tax configuration — global enable/disable per store and a default tax percent
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT true`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_tax_percent DECIMAL(5, 2) DEFAULT 0`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) DEFAULT 'dine_in'`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_mobile VARCHAR(20)`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_mobile VARCHAR(20)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled'))`,
		`ALTER TABLE app_updates ADD COLUMN IF NOT EXISTS platform VARCHAR(20) CHECK (platform IN ('mobile', 'desktop'))`,
		// Table sections — additive migration for existing deployments (NULL = default "Ground Floor")
		`ALTER TABLE tables ADD COLUMN IF NOT EXISTS section VARCHAR(255) DEFAULT NULL`,
		// Item preparation expenses — additive migration for existing deployments
		`CREATE TABLE IF NOT EXISTS item_expenses (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			item_id VARCHAR(255) REFERENCES items(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			description TEXT,
			amount DECIMAL(10, 2) NOT NULL,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		// Enable/disable flag for categories and items (separate from is_active
		// which is used for soft-delete). Disabled categories and their items
		// are hidden from order creation but still visible in management.
		`ALTER TABLE categories ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true`,
		`ALTER TABLE items ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true`,
	}

	for _, q := range alterQueries {
		if _, err := db.Exec(q); err != nil {
			log.Printf("Non-blocking warning: Alter failed or column already exists: %v", err)
		}
	}

	// Seed data
	if err := runSeeds(db, cfg); err != nil {
		return fmt.Errorf("seed failed: %w", err)
	}

	return nil
}

func runSeeds(db *sql.DB, cfg *config.Config) error {
	// Seed default global settings
	_, err := db.Exec(`
		INSERT INTO global_settings (key, value)
		VALUES
			('cleanup_enabled', 'false'),
			('cleanup_interval_mins', '60'),
			('update_github_repo', 'ntoric/mario_tauri')
		ON CONFLICT (key) DO NOTHING
	`)
	if err != nil {
		return fmt.Errorf("failed seeding default global settings: %w", err)
	}
	log.Println("Seeded default global settings")

	// Seed default store
	var storeCount int
	err = db.QueryRow("SELECT COUNT(*) FROM stores").Scan(&storeCount)
	if err != nil {
		return err
	}

	if storeCount == 0 {
		_, err = db.Exec(`
			INSERT INTO stores (id, name, branch, location, phone, invoice_size)
			VALUES ('1', 'Main Cafe', 'Main Branch', 'City Center', '+1234567890', '3inch')
		`)
		if err != nil {
			return fmt.Errorf("failed seeding default store: %w", err)
		}
		log.Println("Seeded default store '1'")
	}

	// Hash superadmin password
	passwordHash, err := security.HashPassword(cfg.SuperadminPassword)
	if err != nil {
		return err
	}

	var adminExists bool
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'superadmin')").Scan(&adminExists)
	if err != nil {
		return err
	}

	if !adminExists {
		adminID := "11111111-1111-1111-1111-111111111111"
		_, err = db.Exec(`
			INSERT INTO users (id, username, password, name, email, role, is_active)
			VALUES ($1, $2, $3, $4, $5, 'superadmin', true)
		`, adminID, cfg.SuperadminUsername, string(passwordHash), cfg.SuperadminName, "admin@cafe.com")
		if err != nil {
			return fmt.Errorf("failed seeding superadmin user: %w", err)
		}
		log.Printf("Superadmin user created: %s", cfg.SuperadminUsername)
	} else {
		// Update password if changed in env
		_, err = db.Exec(`
			UPDATE users SET password = $1 WHERE role = 'superadmin'
		`, string(passwordHash))
		if err != nil {
			return fmt.Errorf("failed updating superadmin password: %w", err)
		}
	}

	// Insert sample business owner if none exists
	var ownerExists bool
	err = db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE username = 'owner')").Scan(&ownerExists)
	if err != nil {
		return err
	}

	if !ownerExists {
		ownerPassword, err := security.HashPassword("password")
		if err != nil {
			return err
		}
		ownerID := "22222222-2222-2222-2222-222222222222"
		_, err = db.Exec(`
			INSERT INTO users (id, username, password, name, email, role, is_active)
			VALUES ($1, 'owner', $2, 'Business Owner', 'owner@cafe.com', 'business_owner', true)
		`, ownerID, string(ownerPassword))
		if err != nil {
			return fmt.Errorf("failed seeding sample business owner: %w", err)
		}

		// Map owner to store '1'
		_, err = db.Exec(`
			INSERT INTO user_stores (user_id, store_id) VALUES ($1, '1')
			ON CONFLICT DO NOTHING
		`, ownerID)
		if err != nil {
			return fmt.Errorf("failed mapping owner to store 1: %w", err)
		}
		log.Println("Seeded business owner 'owner' linked to store '1'")
	}

	log.Println("Database initialized successfully")
	return nil
}
