use rusqlite::Connection;
use std::path::Path;

use super::auth;

/// Default timestamp expression producing RFC3339-ish UTC strings
/// ("2026-09-24T10:15:30.123Z"), matching how Go serialized time.Time to JSON.
pub const TS_DEFAULT: &str = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

pub fn now_ts() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.6fZ").to_string()
}

pub fn init_db(path: &Path) -> Result<Connection, rusqlite::Error> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    run_migrations(&conn)?;
    run_seeds(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    let ts = TS_DEFAULT;
    let ddl = format!(
        r#"
CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    branch TEXT,
    location TEXT,
    gstin TEXT,
    fssai_no TEXT,
    phone TEXT,
    printer_name TEXT,
    printer_vendor_id TEXT,
    printer_product_id TEXT,
    invoice_size TEXT DEFAULT '3inch',
    kot_print_enabled INTEGER DEFAULT 1,
    remote_billing_enabled INTEGER DEFAULT 0,
    logo_url TEXT,
    theme_color TEXT,
    tax_enabled INTEGER DEFAULT 1,
    default_tax_percent REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT {ts},
    updated_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'business_owner', 'business_admin', 'staff')),
    store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT {ts},
    updated_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS user_stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT {ts},
    UNIQUE(user_id, store_id)
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    enabled INTEGER DEFAULT 1,
    is_favourite INTEGER DEFAULT 0,
    created_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    hsn_code TEXT,
    tax_percent REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    enabled INTEGER DEFAULT 1,
    is_favourite INTEGER DEFAULT 0,
    created_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    seats INTEGER NOT NULL,
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    section TEXT DEFAULT NULL,
    UNIQUE(store_id, number)
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    table_id TEXT REFERENCES tables(id),
    table_number INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
    order_type TEXT DEFAULT 'dine_in',
    customer_name TEXT,
    customer_mobile TEXT,
    total_amount REAL NOT NULL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT {ts},
    updated_at TEXT DEFAULT {ts},
    cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id),
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    tax_percent REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES orders(id),
    table_number INTEGER NOT NULL,
    invoice_no TEXT,
    subtotal REAL NOT NULL,
    tax_total REAL NOT NULL,
    discount REAL DEFAULT 0,
    total REAL NOT NULL,
    payment_method TEXT,
    customer_name TEXT,
    customer_mobile TEXT,
    is_printed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    generated_at TEXT DEFAULT {ts},
    generated_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bill_queue (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
    bill_data TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TEXT DEFAULT {ts},
    updated_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    UNIQUE(store_id, key)
);

CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS app_updates (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL CHECK (platform IN ('mobile', 'desktop')),
    enabled INTEGER DEFAULT 0,
    version TEXT NOT NULL,
    download_url TEXT NOT NULL,
    release_notes TEXT,
    created_at TEXT DEFAULT {ts},
    updated_at TEXT DEFAULT {ts},
    UNIQUE(platform)
);

CREATE TABLE IF NOT EXISTS expense_categories (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    expense_date TEXT NOT NULL,
    payment_method TEXT,
    receipt_number TEXT,
    vendor TEXT,
    attachments TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT {ts},
    updated_at TEXT DEFAULT {ts},
    created_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS item_expenses (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT {ts}
);

CREATE TABLE IF NOT EXISTS table_sections (
    id TEXT PRIMARY KEY,
    store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT {ts},
    UNIQUE(store_id, name)
);

-- Outbox for offline-first cloud sync. Every successful mutating API call is
-- recorded here and replayed to the cloud backend by the sync worker.
CREATE TABLE IF NOT EXISTS sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    body TEXT,
    store_id TEXT,
    attempts INTEGER DEFAULT 0,
    pushed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT {ts}
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(pushed, id);
"#,
        ts = ts
    );

    conn.execute_batch(&ddl)?;

    // Additive column migrations for databases created by older builds.
    let alters = [
        "ALTER TABLE stores ADD COLUMN printer_name TEXT",
        "ALTER TABLE stores ADD COLUMN kot_print_enabled INTEGER DEFAULT 1",
        "ALTER TABLE stores ADD COLUMN remote_billing_enabled INTEGER DEFAULT 0",
        "ALTER TABLE stores ADD COLUMN logo_url TEXT",
        "ALTER TABLE stores ADD COLUMN theme_color TEXT",
        "ALTER TABLE stores ADD COLUMN tax_enabled INTEGER DEFAULT 1",
        "ALTER TABLE stores ADD COLUMN default_tax_percent REAL DEFAULT 0",
        "ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'dine_in'",
        "ALTER TABLE orders ADD COLUMN customer_name TEXT",
        "ALTER TABLE orders ADD COLUMN customer_mobile TEXT",
        "ALTER TABLE orders ADD COLUMN cancelled_at TEXT",
        "ALTER TABLE bills ADD COLUMN customer_mobile TEXT",
        "ALTER TABLE bills ADD COLUMN status TEXT DEFAULT 'active'",
        "ALTER TABLE tables ADD COLUMN section TEXT DEFAULT NULL",
        "ALTER TABLE categories ADD COLUMN enabled INTEGER DEFAULT 1",
        "ALTER TABLE items ADD COLUMN enabled INTEGER DEFAULT 1",
        "ALTER TABLE categories ADD COLUMN is_favourite INTEGER DEFAULT 0",
        "ALTER TABLE items ADD COLUMN is_favourite INTEGER DEFAULT 0",
    ];
    for q in alters {
        let _ = conn.execute(q, []);
    }

    Ok(())
}

fn run_seeds(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Default global settings
    conn.execute_batch(
        "INSERT OR IGNORE INTO global_settings (key, value) VALUES
            ('cleanup_enabled', 'false'),
            ('cleanup_interval_mins', '60'),
            ('update_github_repo', 'ntoric/mario_tauri');",
    )?;

    // Default store
    let store_count: i64 = conn.query_row("SELECT COUNT(*) FROM stores", [], |r| r.get(0))?;
    if store_count == 0 {
        conn.execute(
            "INSERT INTO stores (id, name, branch, location, phone, invoice_size)
             VALUES ('1', 'Main Cafe', 'Main Branch', 'City Center', '+1234567890', '3inch')",
            [],
        )?;
    }

    // Superadmin
    let superadmin_username =
        std::env::var("SUPERADMIN_USERNAME").unwrap_or_else(|_| "superadmin".to_string());
    let superadmin_password =
        std::env::var("SUPERADMIN_PASSWORD").unwrap_or_else(|_| "superadmin123".to_string());
    let superadmin_name =
        std::env::var("SUPERADMIN_NAME").unwrap_or_else(|_| "Super Administrator".to_string());

    let admin_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM users WHERE role = 'superadmin')",
        [],
        |r| r.get(0),
    )?;

    let password_hash = auth::hash_password(&superadmin_password);
    if !admin_exists {
        conn.execute(
            "INSERT INTO users (id, username, password, name, email, role, is_active)
             VALUES (?1, ?2, ?3, ?4, ?5, 'superadmin', 1)",
            rusqlite::params![
                "11111111-1111-1111-1111-111111111111",
                superadmin_username,
                password_hash,
                superadmin_name,
                "admin@cafe.com"
            ],
        )?;
    }

    // Sample business owner
    let owner_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = 'owner')",
        [],
        |r| r.get(0),
    )?;
    if !owner_exists {
        let owner_id = "22222222-2222-2222-2222-222222222222";
        let owner_hash = auth::hash_password("password");
        conn.execute(
            "INSERT INTO users (id, username, password, name, email, role, is_active)
             VALUES (?1, 'owner', ?2, 'Business Owner', 'owner@cafe.com', 'business_owner', 1)",
            rusqlite::params![owner_id, owner_hash],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?1, '1')",
            [owner_id],
        )?;
    }

    Ok(())
}
