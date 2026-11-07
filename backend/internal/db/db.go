package db

import (
	"database/sql"
	"fmt"
	"log"

	"cafe-backend/internal/config"

	"cafe-backend/internal/security"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// ConnString returns the Postgres DSN shared by the connection pool and any
// dedicated connections (e.g. the realtime LISTEN loop).
func ConnString(cfg *config.Config) string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName)
}

func InitDB(cfg *config.Config) (*sql.DB, error) {
	connStr := ConnString(cfg) + " default_query_exec_mode=simple_protocol"

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
	connStr := ConnString(cfg) + " default_query_exec_mode=simple_protocol"

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

		// Tables table — a table is unique per (store, section) by number and by
		// name; the same number/name may be reused across different sections.
		// Uniqueness is enforced by the section-scoped unique indexes created in
		// the migration list below (they also run for fresh installs).
		`CREATE TABLE IF NOT EXISTS tables (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			number INTEGER NOT NULL,
			name VARCHAR(255) DEFAULT NULL,
			seats INTEGER NOT NULL,
			position_x INTEGER DEFAULT 0,
			position_y INTEGER DEFAULT 0,
			section VARCHAR(255) DEFAULT NULL,
			is_active BOOLEAN DEFAULT true
		)`,

		// Orders table
		`CREATE TABLE IF NOT EXISTS orders (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			table_id VARCHAR(255) REFERENCES tables(id) ON DELETE SET NULL,
			table_number INTEGER NOT NULL,
			table_name VARCHAR(255),
			status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'completed', 'cancelled', 'merged')),
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
			table_name VARCHAR(255),
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
			is_default BOOLEAN NOT NULL DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(store_id, name)
		)`,

		// Support tickets — store-raised support requests visible to superadmin
		`CREATE TABLE IF NOT EXISTS support_tickets (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			created_by VARCHAR(255) REFERENCES users(id),
			subject VARCHAR(255) NOT NULL,
			category VARCHAR(50) DEFAULT 'general',
			priority VARCHAR(20) DEFAULT 'medium',
			status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Support messages — conversation thread per ticket
		`CREATE TABLE IF NOT EXISTS support_messages (
			id VARCHAR(255) PRIMARY KEY,
			ticket_id VARCHAR(255) REFERENCES support_tickets(id) ON DELETE CASCADE,
			sender_id VARCHAR(255) REFERENCES users(id),
			sender_role VARCHAR(50),
			message TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT false`,
		// Existing deployments created the column with DEFAULT true — bring
		// their default in line with tax-disabled-by-default.
		`ALTER TABLE stores ALTER COLUMN tax_enabled SET DEFAULT false`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_tax_percent DECIMAL(5, 2) DEFAULT 0`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) DEFAULT 'dine_in'`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_mobile VARCHAR(20)`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_mobile VARCHAR(20)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled'))`,
		`ALTER TABLE app_updates ADD COLUMN IF NOT EXISTS platform VARCHAR(20) CHECK (platform IN ('mobile', 'desktop'))`,
		// Table sections — additive migration for existing deployments (NULL = default section)
		`ALTER TABLE tables ADD COLUMN IF NOT EXISTS section VARCHAR(255) DEFAULT NULL`,
		// Table sections — marks which catalog section is the store's default,
		// i.e. the bucket tables with NULL section are displayed under.
		`ALTER TABLE table_sections ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`,
		// Alphanumeric table names — optional display label (e.g. "1A", "4AA").
		// number stays the internal sort/compat key so old clients keep working.
		`ALTER TABLE tables ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT NULL`,
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_name VARCHAR(255)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS table_name VARCHAR(255)`,
		// Table identity is (store, section, number/name) — the same number or
		// name may be reused across different sections of a store. Drop the
		// older store-wide unique constraints/indexes from pre-section
		// databases and replace them with section-scoped unique indexes.
		`ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_store_id_number_key`,
		`ALTER TABLE tables DROP CONSTRAINT IF EXISTS tables_store_id_name_key`,
		`DROP INDEX IF EXISTS idx_tables_store_name`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_store_section_number ON tables (store_id, (COALESCE(section, '')), number)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_store_section_name ON tables (store_id, (COALESCE(section, '')), name) WHERE name IS NOT NULL`,
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
		// Favourite flag for categories and items. Favourites are shown at the
		// top of the categories and items sections on the order create/edit page.
		`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_favourite BOOLEAN DEFAULT false`,
		`ALTER TABLE items ADD COLUMN IF NOT EXISTS is_favourite BOOLEAN DEFAULT false`,
		// Manual display order for categories on the order create/edit page.
		// Favourite categories always rank first; sort_order breaks ties
		// between non-favourites (0 means "not explicitly ordered").
		`ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`,
		// Desktop app version telemetry — the Tauri app reports its version so
		// superadmins can see which release each store is running.
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS app_version VARCHAR(64)`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS app_version_seen_at TIMESTAMP`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS remote_printer_device_id VARCHAR(255)`,
		// Order combine — the original orders_status_check only allowed
		// active/completed/cancelled, so the merge endpoint failed on databases
		// created before the 'merged' status existed. Re-create the constraint
		// with 'merged' included.
		`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check`,
		`ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('active', 'completed', 'cancelled', 'merged'))`,
		// Table deletion — orders keep denormalized table_number/table_name, so
		// dropping a table should null the FK instead of raising a violation.
		// Databases created before ON DELETE SET NULL existed need the FK
		// re-created; this also unblocks store deletion (stores → tables cascade
		// was previously blocked by orders.table_id).
		`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_table_id_fkey`,
		`ALTER TABLE orders ADD CONSTRAINT orders_table_id_fkey FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL`,
		// Support tickets — lookup indexes
		`CREATE INDEX IF NOT EXISTS idx_support_tickets_store ON support_tickets (store_id)`,
		`CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status)`,
		`CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id)`,
		// Orders — performance indexes for common queries
		`CREATE INDEX IF NOT EXISTS idx_orders_store_status_created ON orders (store_id, status, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders (store_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders (table_id) WHERE table_id IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders (created_by)`,
		// Order items — optimize the JOIN on order_items.order_id
		`CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id)`,
		`CREATE INDEX IF NOT EXISTS idx_order_items_item_id ON order_items (item_id)`,
		// Items — optimize the JOIN on items.category_id
		`CREATE INDEX IF NOT EXISTS idx_items_category_id ON items (category_id)`,
		`CREATE INDEX IF NOT EXISTS idx_items_store_id ON items (store_id)`,
		// Bills — for fetching bills by store and order
		`CREATE INDEX IF NOT EXISTS idx_bills_store_id ON bills (store_id)`,
		`CREATE INDEX IF NOT EXISTS idx_bills_order_id ON bills (order_id)`,
		`CREATE INDEX IF NOT EXISTS idx_bills_generated_at ON bills (generated_at DESC)`,
		// Categories — for fetching items by category
		`CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories (store_id)`,
		// Tables — for fetching tables by store
		`CREATE INDEX IF NOT EXISTS idx_tables_store_id ON tables (store_id)`,
		// Bill queue — for polling pending bills
		`CREATE INDEX IF NOT EXISTS idx_bill_queue_store_status ON bill_queue (store_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_bill_queue_order_id ON bill_queue (order_id)`,

		// GST compliance — store GST profile and document series config
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS gst_registration_type VARCHAR(20) DEFAULT 'regular'`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS state_code VARCHAR(2)`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS prices_include_tax BOOLEAN DEFAULT false`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(5) DEFAULT 'INV'`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS credit_note_prefix VARCHAR(5) DEFAULT 'CN'`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS default_sac_code VARCHAR(8) DEFAULT '996331'`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS swiggy_gstin VARCHAR(15)`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS zomato_gstin VARCHAR(15)`,
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS other_eco_gstin VARCHAR(15)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS eco_gstin VARCHAR(15)`,
		// Backfill the store state code from an existing GSTIN once.
		`UPDATE stores SET state_code = SUBSTRING(gstin, 1, 2) WHERE (state_code IS NULL OR state_code = '') AND gstin ~ '^[0-9]{2}'`,
		// Per-item GST tax category (taxable / nil_rated / exempt / non_gst)
		`ALTER TABLE items ADD COLUMN IF NOT EXISTS tax_category VARCHAR(20) DEFAULT 'taxable'`,
		// Order source distinguishes counter sales from e-commerce operator orders
		`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR(20) DEFAULT 'pos'`,
		// GST fields on bills — fy IS NOT NULL marks a bill as a GST-issued document
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS fy VARCHAR(4)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS invoice_seq INTEGER`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS document_type VARCHAR(20)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS supply_type VARCHAR(10)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(2)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS supplier_gstin VARCHAR(15)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS supplier_state_code VARCHAR(2)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS buyer_gstin VARCHAR(15)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS buyer_name VARCHAR(255)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS buyer_address TEXT`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS buyer_state_code VARCHAR(2)`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS order_source VARCHAR(20) DEFAULT 'pos'`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS prices_include_tax BOOLEAN DEFAULT false`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS taxable_value DECIMAL(12,2) DEFAULT 0`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS cgst DECIMAL(12,2) DEFAULT 0`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS sgst DECIMAL(12,2) DEFAULT 0`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS igst DECIMAL(12,2) DEFAULT 0`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS cess DECIMAL(12,2) DEFAULT 0`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS round_off DECIMAL(6,2) DEFAULT 0`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_utgst BOOLEAN DEFAULT false`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`,
		`ALTER TABLE bills ADD COLUMN IF NOT EXISTS cancel_reason TEXT`,
		// Unique invoice numbers only for GST bills — legacy rows may contain
		// duplicates and are deliberately left unconstrained.
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_store_invoice_no ON bills (store_id, invoice_no) WHERE fy IS NOT NULL`,
		`CREATE INDEX IF NOT EXISTS idx_bills_store_generated ON bills (store_id, generated_at)`,
		// Computed GST line snapshot per bill
		`CREATE TABLE IF NOT EXISTS bill_lines (
			id SERIAL PRIMARY KEY,
			bill_id VARCHAR(255) REFERENCES bills(id) ON DELETE CASCADE,
			item_id VARCHAR(255),
			name VARCHAR(255),
			hsn_code VARCHAR(50),
			unit VARCHAR(10),
			tax_category VARCHAR(20) DEFAULT 'taxable',
			quantity DECIMAL(10,3) NOT NULL,
			unit_price DECIMAL(12,2) NOT NULL,
			gross DECIMAL(12,2) DEFAULT 0,
			discount DECIMAL(12,2) DEFAULT 0,
			taxable_value DECIMAL(12,2) DEFAULT 0,
			tax_rate DECIMAL(5,2) DEFAULT 0,
			cgst_rate DECIMAL(5,2) DEFAULT 0,
			cgst DECIMAL(12,2) DEFAULT 0,
			sgst_rate DECIMAL(5,2) DEFAULT 0,
			sgst DECIMAL(12,2) DEFAULT 0,
			igst_rate DECIMAL(5,2) DEFAULT 0,
			igst DECIMAL(12,2) DEFAULT 0,
			cess DECIMAL(12,2) DEFAULT 0,
			total DECIMAL(12,2) DEFAULT 0
		)`,
		`CREATE INDEX IF NOT EXISTS idx_bill_lines_bill_id ON bill_lines (bill_id)`,
		// Per-store, per-FY document number series (invoice / credit_note).
		// The prefix is captured when the series starts and stays fixed for
		// the whole financial year.
		`CREATE TABLE IF NOT EXISTS doc_series (
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			doc_type VARCHAR(20) NOT NULL,
			fy VARCHAR(4) NOT NULL,
			prefix VARCHAR(5),
			last_seq INTEGER NOT NULL,
			PRIMARY KEY (store_id, doc_type, fy)
		)`,
		// GST credit notes issued against bills
		`CREATE TABLE IF NOT EXISTS credit_notes (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			bill_id VARCHAR(255) REFERENCES bills(id),
			credit_note_no VARCHAR(50),
			fy VARCHAR(4),
			seq INTEGER,
			reason TEXT NOT NULL,
			supply_type VARCHAR(10),
			place_of_supply VARCHAR(2),
			buyer_gstin VARCHAR(15),
			is_utgst BOOLEAN DEFAULT false,
			taxable_value DECIMAL(12,2) DEFAULT 0,
			cgst DECIMAL(12,2) DEFAULT 0,
			sgst DECIMAL(12,2) DEFAULT 0,
			igst DECIMAL(12,2) DEFAULT 0,
			cess DECIMAL(12,2) DEFAULT 0,
			round_off DECIMAL(6,2) DEFAULT 0,
			total DECIMAL(12,2) DEFAULT 0,
			status VARCHAR(20) DEFAULT 'active',
			issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			issued_by VARCHAR(255) REFERENCES users(id)
		)`,
		// Per-store data retention — orders/bills/reports older than this many
		// days are hidden from non-superadmin roles. Rows are never deleted;
		// superadmin (and analytics) keep the full history. 0 = unlimited.
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS data_retention_days INTEGER NOT NULL DEFAULT 0`,
		// My Plan page visibility per store — superadmin controls whether a
		// store's users see the subscription menu/page.
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS my_plan_enabled BOOLEAN DEFAULT false`,
		// Optional second contact number — printed on the bill under the
		// primary phone.
		`ALTER TABLE stores ADD COLUMN IF NOT EXISTS secondary_phone VARCHAR(50)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_notes_store_no ON credit_notes (store_id, credit_note_no)`,
		`CREATE TABLE IF NOT EXISTS credit_note_lines (
			id SERIAL PRIMARY KEY,
			credit_note_id VARCHAR(255) REFERENCES credit_notes(id) ON DELETE CASCADE,
			bill_line_id INTEGER REFERENCES bill_lines(id),
			item_id VARCHAR(255),
			name VARCHAR(255),
			hsn_code VARCHAR(50),
			unit VARCHAR(10),
			quantity DECIMAL(10,3) NOT NULL,
			taxable_value DECIMAL(12,2) DEFAULT 0,
			tax_rate DECIMAL(5,2) DEFAULT 0,
			cgst DECIMAL(12,2) DEFAULT 0,
			sgst DECIMAL(12,2) DEFAULT 0,
			igst DECIMAL(12,2) DEFAULT 0,
			cess DECIMAL(12,2) DEFAULT 0,
			total DECIMAL(12,2) DEFAULT 0
		)`,
		`CREATE INDEX IF NOT EXISTS idx_credit_note_lines_cn ON credit_note_lines (credit_note_id)`,
		`CREATE INDEX IF NOT EXISTS idx_credit_note_lines_bill_line ON credit_note_lines (bill_line_id)`,
		`CREATE INDEX IF NOT EXISTS idx_credit_notes_bill ON credit_notes (bill_id)`,
		`CREATE INDEX IF NOT EXISTS idx_credit_notes_store_issued ON credit_notes (store_id, issued_at)`,

		// Subscription plans — recurring pricing packages superadmin assigns
		// to stores (monthly / quarterly / bi-annually / yearly).
		`CREATE TABLE IF NOT EXISTS subscription_plans (
			id VARCHAR(255) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			price DECIMAL(10, 2) NOT NULL DEFAULT 0,
			features JSONB DEFAULT '[]'::jsonb,
			recurring_type VARCHAR(20) NOT NULL CHECK (recurring_type IN ('monthly', 'quarterly', 'biannually', 'yearly')),
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,

		// Store subscriptions — one row per billing period. Plan details are
		// snapshotted (plan_name/plan_price/recurring_type) so history stays
		// accurate when a plan is edited or deleted. end_date is the next
		// renewal date (auto_renew on) or expiry date (auto_renew off).
		`CREATE TABLE IF NOT EXISTS store_subscriptions (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
			plan_id VARCHAR(255) REFERENCES subscription_plans(id) ON DELETE SET NULL,
			plan_name VARCHAR(255) NOT NULL,
			plan_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
			recurring_type VARCHAR(20) NOT NULL CHECK (recurring_type IN ('monthly', 'quarterly', 'biannually', 'yearly')),
			status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'replaced')),
			start_date TIMESTAMP NOT NULL,
			end_date TIMESTAMP NOT NULL,
			auto_renew BOOLEAN DEFAULT true,
			renewal_count INTEGER NOT NULL DEFAULT 0,
			created_by VARCHAR(255) REFERENCES users(id),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		// At most one active subscription per store.
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_store_subscriptions_one_active ON store_subscriptions (store_id) WHERE status = 'active'`,
		`CREATE INDEX IF NOT EXISTS idx_store_subscriptions_store ON store_subscriptions (store_id)`,
		`CREATE INDEX IF NOT EXISTS idx_store_subscriptions_status_end ON store_subscriptions (status, end_date)`,

		// Subscription events — append-only audit log powering the history view
		// (created / renewed / expired / upgraded / downgraded / cancelled ...).
		`CREATE TABLE IF NOT EXISTS subscription_events (
			id SERIAL PRIMARY KEY,
			store_id VARCHAR(255) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
			subscription_id VARCHAR(255) REFERENCES store_subscriptions(id) ON DELETE CASCADE,
			action VARCHAR(30) NOT NULL,
			from_plan_id VARCHAR(255),
			from_plan_name VARCHAR(255),
			to_plan_id VARCHAR(255),
			to_plan_name VARCHAR(255),
			notes TEXT,
			created_by VARCHAR(255) REFERENCES users(id),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_subscription_events_store ON subscription_events (store_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_subscription_events_sub ON subscription_events (subscription_id)`,

		// Subscription change requests — store users ask to upgrade/downgrade
		// or cancel; superadmin approves and the change is applied when the
		// current billing cycle ends (see ProcessDue). Plan details are
		// snapshotted so applying later doesn't depend on the plan's state.
		`CREATE TABLE IF NOT EXISTS subscription_requests (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
			subscription_id VARCHAR(255) NOT NULL REFERENCES store_subscriptions(id) ON DELETE CASCADE,
			type VARCHAR(20) NOT NULL CHECK (type IN ('upgrade', 'downgrade', 'plan_change', 'cancel')),
			current_plan_name VARCHAR(255),
			requested_plan_id VARCHAR(255) REFERENCES subscription_plans(id) ON DELETE SET NULL,
			requested_plan_name VARCHAR(255),
			requested_plan_price DECIMAL(10, 2),
			requested_recurring_type VARCHAR(20),
			effective_date TIMESTAMP,
			status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'applied')),
			note TEXT,
			requested_by VARCHAR(255) REFERENCES users(id),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			resolved_by VARCHAR(255) REFERENCES users(id),
			resolved_at TIMESTAMP,
			updated_at TIMESTAMP
		)`,
		`ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
		// One open (pending or approved-awaiting-apply) request per subscription.
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_requests_open ON subscription_requests (subscription_id) WHERE status IN ('pending', 'approved')`,
		`CREATE INDEX IF NOT EXISTS idx_subscription_requests_store ON subscription_requests (store_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_subscription_requests_status ON subscription_requests (status)`,

		// Subscription payments — billing ledger per subscription. Auto-renew
		// writes a 'auto'-method payment each cycle; non-renewing subscriptions
		// only roll forward when a payment is recorded for the next period.
		`CREATE TABLE IF NOT EXISTS subscription_payments (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
			subscription_id VARCHAR(255) NOT NULL REFERENCES store_subscriptions(id) ON DELETE CASCADE,
			amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
			method VARCHAR(30) NOT NULL DEFAULT 'manual',
			status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'failed', 'refunded')),
			period_start TIMESTAMP,
			period_end TIMESTAMP,
			paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			recorded_by VARCHAR(255) REFERENCES users(id),
			notes TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_subscription_payments_sub ON subscription_payments (subscription_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_subscription_payments_store ON subscription_payments (store_id, created_at DESC)`,

		// Payment orders — one row per Cashfree checkout session a store user
		// starts from the My Plan page. Plan details are snapshotted so the
		// fulfillment on payment success doesn't depend on plan/subscription
		// state that may have changed while the customer was paying.
		`CREATE TABLE IF NOT EXISTS payment_orders (
			id VARCHAR(255) PRIMARY KEY,
			gateway VARCHAR(30) NOT NULL DEFAULT 'cashfree',
			store_id VARCHAR(255) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
			subscription_id VARCHAR(255) REFERENCES store_subscriptions(id) ON DELETE SET NULL,
			plan_id VARCHAR(255) REFERENCES subscription_plans(id) ON DELETE SET NULL,
			plan_name VARCHAR(255) NOT NULL,
			plan_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
			recurring_type VARCHAR(20) NOT NULL,
			amount DECIMAL(10, 2) NOT NULL,
			currency VARCHAR(10) NOT NULL DEFAULT 'INR',
			status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
			payment_session_id VARCHAR(255),
			cf_payment_id VARCHAR(255),
			payment_id VARCHAR(255) REFERENCES subscription_payments(id) ON DELETE SET NULL,
			created_by VARCHAR(255) REFERENCES users(id),
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_payment_orders_store ON payment_orders (store_id, created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders (status)`,
		`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255)`,

		// show_price hides the plan amount from the store's My Plan page when
		// off (default). Superadmin-controlled per subscription.
		`ALTER TABLE store_subscriptions ADD COLUMN IF NOT EXISTS show_price BOOLEAN NOT NULL DEFAULT false`,

		// Raw materials — store-scoped ingredient/supply catalog. current_stock
		// is maintained by the transaction ledger (raw_material_transactions).
		`CREATE TABLE IF NOT EXISTS raw_materials (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			name VARCHAR(255) NOT NULL,
			unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
			description TEXT,
			current_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
			min_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_by VARCHAR(255) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_materials_store ON raw_materials (store_id)`,

		// Raw material purchases — each row is a stock-in event with cost
		// details; creating/updating/deleting one writes/adjusts the matching
		// 'purchase' transaction in the ledger.
		`CREATE TABLE IF NOT EXISTS raw_material_purchases (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			material_id VARCHAR(255) REFERENCES raw_materials(id) ON DELETE CASCADE,
			quantity DECIMAL(12,3) NOT NULL,
			unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
			total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
			vendor VARCHAR(255),
			invoice_number VARCHAR(100),
			purchase_date TIMESTAMP NOT NULL,
			payment_method VARCHAR(50),
			notes TEXT,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_by VARCHAR(255) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_material_purchases_store ON raw_material_purchases (store_id, purchase_date DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_material_purchases_material ON raw_material_purchases (material_id)`,

		// Raw material stock ledger — signed quantity per event
		// ('purchase' adds, 'usage'/'wastage' subtract, 'adjustment' either).
		// stock_after snapshots the running balance for display; both it and
		// raw_materials.current_stock are recomputed whenever the ledger
		// changes so edits/deletes stay consistent.
		`CREATE TABLE IF NOT EXISTS raw_material_transactions (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			material_id VARCHAR(255) REFERENCES raw_materials(id) ON DELETE CASCADE,
			type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'usage', 'wastage', 'adjustment')),
			quantity DECIMAL(12,3) NOT NULL,
			stock_after DECIMAL(12,3),
			reference_id VARCHAR(255),
			notes TEXT,
			transaction_date TIMESTAMP NOT NULL,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_by VARCHAR(255) REFERENCES users(id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_material_txns_store ON raw_material_transactions (store_id, transaction_date DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_material_txns_material ON raw_material_transactions (material_id, transaction_date)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_material_txns_ref ON raw_material_transactions (reference_id) WHERE reference_id IS NOT NULL`,

		// Item recipes — raw materials (and their quantities) needed to
		// prepare one unit of a menu item. Replaces the manual preparation
		// cost entries for items that have a recipe; items without a recipe
		// keep using item_expenses for cost tracking.
		`CREATE TABLE IF NOT EXISTS item_recipes (
			id VARCHAR(255) PRIMARY KEY,
			store_id VARCHAR(255) REFERENCES stores(id) ON DELETE CASCADE,
			item_id VARCHAR(255) REFERENCES items(id) ON DELETE CASCADE,
			material_id VARCHAR(255) REFERENCES raw_materials(id) ON DELETE CASCADE,
			quantity DECIMAL(12,3) NOT NULL,
			is_active BOOLEAN DEFAULT true,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(item_id, material_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_item_recipes_store ON item_recipes (store_id)`,
		`CREATE INDEX IF NOT EXISTS idx_item_recipes_item ON item_recipes (item_id)`,
		`CREATE INDEX IF NOT EXISTS idx_item_recipes_material ON item_recipes (material_id)`,

		// Weighted-average purchase cost per material — drives recipe/item
		// cost calculations and the unit_cost snapshot on consumption rows.
		`ALTER TABLE raw_materials ADD COLUMN IF NOT EXISTS avg_cost DECIMAL(12,4) DEFAULT 0`,
		`UPDATE raw_materials m SET avg_cost = COALESCE((
			SELECT SUM(p.total_cost) / NULLIF(SUM(p.quantity), 0)
			FROM raw_material_purchases p
			WHERE p.material_id = m.id AND p.is_active = true), 0)
		 WHERE m.avg_cost IS NULL OR m.avg_cost = 0`,

		// Consumption ledger rows: link back to the menu item that consumed
		// the material and snapshot the unit cost at write time.
		`ALTER TABLE raw_material_transactions ADD COLUMN IF NOT EXISTS item_id VARCHAR(255)`,
		`ALTER TABLE raw_material_transactions ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,4) DEFAULT 0`,
		`CREATE INDEX IF NOT EXISTS idx_raw_material_txns_item ON raw_material_transactions (item_id) WHERE item_id IS NOT NULL`,
		// Order-driven stock deduction uses the dedicated 'consumption' type —
		// re-create the type check so it is allowed alongside the manual types.
		`ALTER TABLE raw_material_transactions DROP CONSTRAINT IF EXISTS raw_material_transactions_type_check`,
		`ALTER TABLE raw_material_transactions ADD CONSTRAINT raw_material_transactions_type_check CHECK (type IN ('purchase', 'usage', 'wastage', 'adjustment', 'consumption'))`,

		// Batch tracking — a purchase row doubles as a stock batch: buys at
		// the same unit cost merge into the oldest open batch, different
		// prices stay separate. remaining_qty is what's left of the batch;
		// stock-outs drain batches oldest-first (FIFO).
		`ALTER TABLE raw_material_purchases ADD COLUMN IF NOT EXISTS remaining_qty DECIMAL(12,3)`,
		// Optional expiry date on the batch. Batches are keyed by
		// (material, unit_cost, expiry_date): same price but different
		// expiry means a different batch.
		`ALTER TABLE raw_material_purchases ADD COLUMN IF NOT EXISTS expiry_date DATE`,
		// Prefer bill invoice numbers in consumption notes over the raw order id.
		`UPDATE raw_material_transactions t
		 SET notes = regexp_replace(t.notes, '\(order [^)]*\)', '(order ' || b.invoice_no || ')')
		 FROM bills b
		 WHERE t.type = 'consumption' AND t.reference_id = b.order_id
		   AND b.invoice_no IS NOT NULL AND b.invoice_no <> ''`,
		`UPDATE raw_material_purchases SET remaining_qty = quantity WHERE remaining_qty IS NULL`,
		// Backfill: allocate existing stock-outs FIFO per material.
		`WITH outs AS (
			SELECT material_id, -SUM(quantity) AS out_qty
			FROM raw_material_transactions
			WHERE is_active = true AND quantity < 0 GROUP BY material_id),
		b AS (
			SELECT p.id,
				SUM(p.quantity) OVER (PARTITION BY p.material_id ORDER BY p.purchase_date, p.created_at, p.id) - p.quantity AS prior,
				o.out_qty
			FROM raw_material_purchases p JOIN outs o ON o.material_id = p.material_id
			WHERE p.is_active = true)
		UPDATE raw_material_purchases p
		SET remaining_qty = p.quantity - GREATEST(0, LEAST(p.quantity, b.out_qty - b.prior))
		FROM b WHERE p.id = b.id`,
	}

	for _, q := range alterQueries {
		if _, err := db.Exec(q); err != nil {
			log.Printf("Non-blocking warning: Alter failed or column already exists: %v", err)
		}
	}

	// Audit columns — record when a row was last modified and by which user.
	// Backward compatible: both columns are optional so existing rows, old
	// INSERT statements, and old clients continue to work unchanged.
	// modified_at defaults to the insert time for new rows and is refreshed by
	// a BEFORE UPDATE trigger on every change (including writes from older
	// backend versions); modified_by is populated by the application for
	// user-initiated writes (NULL for system or unknown actors).
	auditTables := []string{
		"stores", "users", "user_stores", "categories", "items", "tables",
		"orders", "order_items", "bills", "bill_queue", "settings",
		"global_settings", "app_updates", "expense_categories", "expenses",
		"item_expenses", "table_sections", "support_tickets", "support_messages",
		"bill_lines", "doc_series", "credit_notes", "credit_note_lines",
		"subscription_plans", "store_subscriptions", "subscription_events",
		"subscription_requests", "subscription_payments", "payment_orders",
		"raw_materials", "raw_material_purchases", "raw_material_transactions",
		"item_recipes",
	}
	for _, t := range auditTables {
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP", t)); err != nil {
			log.Printf("Non-blocking warning: failed adding modified_at to %s: %v", t, err)
		}
		if _, err := db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS modified_by VARCHAR(255)", t)); err != nil {
			log.Printf("Non-blocking warning: failed adding modified_by to %s: %v", t, err)
		}
	}

	if _, err := db.Exec(`CREATE OR REPLACE FUNCTION set_modified_at() RETURNS TRIGGER AS $$
BEGIN
	NEW.modified_at := CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql`); err != nil {
		log.Printf("Non-blocking warning: failed creating set_modified_at function: %v", err)
	}
	for _, t := range auditTables {
		if _, err := db.Exec(fmt.Sprintf("DROP TRIGGER IF EXISTS trg_modified_at_%s ON %s", t, t)); err != nil {
			log.Printf("Non-blocking warning: failed dropping audit trigger on %s: %v", t, err)
		}
		if _, err := db.Exec(fmt.Sprintf("CREATE TRIGGER trg_modified_at_%s BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_modified_at()", t, t)); err != nil {
			log.Printf("Non-blocking warning: failed creating audit trigger on %s: %v", t, err)
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
