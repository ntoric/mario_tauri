//! Offline-first bidirectional sync between the local SQLite backend and the
//! remote cloud (Go/Postgres) backend.
//!
//! Push: every successful local mutation is recorded in `sync_outbox` and
//! replayed to `POST /api/sync/apply` on the cloud. Events carry a unique
//! `event_id` so the cloud can dedupe retries (idempotent).
//!
//! Pull: the cloud logs its own CRUDs into `sync_events`; the worker polls
//! `GET /api/sync/events?since=<seq>&storeId=<store>` and replays each event
//! locally with the outbox suppressed — pulled changes are never pushed back,
//! which prevents circular sync in both directions.
//!
//! Scope: the local system serves a single store — the store of the user who
//! logged in (`cloud_store_id`). All pulls are filtered by it.

use rusqlite::Connection;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;

use super::api::{self, json_to_sql, ApiRequest};
use super::auth;
use super::LocalBackend;

/// Default cloud backend. Overridable via global_settings.cloud_base_url.
const DEFAULT_CLOUD_BASE: &str = "https://mario-v2-backend.ntoric.com";
const REQ_TIMEOUT: Duration = Duration::from_secs(8);
const CYCLE_INTERVAL: Duration = Duration::from_secs(15);
const MAX_PUSH_ATTEMPTS: i64 = 10;
const PULL_BATCH: i64 = 500;

// ---------------------------------------------------------------------------
// Settings helpers (sync state lives in global_settings)
// ---------------------------------------------------------------------------

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM global_settings WHERE key = ?1",
        [key],
        |r| r.get(0),
    )
    .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) {
    let _ = conn.execute(
        "INSERT INTO global_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    );
}

fn cloud_base(conn: &Connection) -> String {
    get_setting(conn, "cloud_base_url")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_CLOUD_BASE.to_string())
        .trim_end_matches('/')
        .to_string()
}

/// Local-only mode: `cloud_base_url` set to "local" (or off/none) disables the
/// cloud backend entirely — login uses local credentials and the sync worker
/// stays idle. The default deployment syncs with the real cloud.
pub fn local_only_mode(conn: &Connection) -> bool {
    matches!(
        get_setting(conn, "cloud_base_url")
            .unwrap_or_default()
            .as_str(),
        "local" | "local-only" | "off" | "none"
    )
}

// ---------------------------------------------------------------------------
// Cloud authentication
// ---------------------------------------------------------------------------

pub enum CloudLogin {
    Success { token: String, user: Value },
    /// The cloud explicitly rejected the credentials (4xx).
    Invalid(String),
    /// Cloud unreachable — caller should fall back to local auth.
    Offline,
}

/// POST /api/auth/login against the cloud backend.
pub async fn cloud_login(state: &LocalBackend, username: &str, password: &str) -> CloudLogin {
    let base = {
        let conn = state.conn.lock().unwrap();
        if local_only_mode(&conn) {
            return CloudLogin::Offline;
        }
        cloud_base(&conn)
    };
    let resp = state
        .http
        .post(format!("{}/api/auth/login", base))
        .json(&json!({ "username": username, "password": password }))
        .timeout(REQ_TIMEOUT)
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(_) => return CloudLogin::Offline,
    };
    let status = resp.status().as_u16();
    let body: Value = resp.json().await.unwrap_or(Value::Null);

    if status == 200 {
        let token = body["token"].as_str().unwrap_or("").to_string();
        let user = body["user"].clone();
        if token.is_empty() || !user.is_object() {
            return CloudLogin::Offline;
        }
        CloudLogin::Success { token, user }
    } else if (400..500).contains(&status) {
        CloudLogin::Invalid(
            body["error"]
                .as_str()
                .unwrap_or("Invalid credentials")
                .to_string(),
        )
    } else {
        CloudLogin::Offline
    }
}

/// Persist the cloud session after a successful cloud login: token, the
/// credentials (so the worker can silently re-authenticate when the 24h cloud
/// token expires), the store this terminal serves, and upserts of the user +
/// their stores so local auth/foreign keys work offline.
pub fn cache_cloud_session(
    conn: &Connection,
    username: &str,
    password: &str,
    cloud_token: &str,
    user: &Value,
) {
    set_setting(conn, "cloud_token", cloud_token);
    set_setting(conn, "cloud_username", username);
    // Cached so the sync worker can re-login when the cloud JWT expires.
    set_setting(conn, "cloud_password", password);
    set_setting(conn, "cloud_user_id", user["id"].as_str().unwrap_or(""));
    set_setting(conn, "cloud_role", user["role"].as_str().unwrap_or("staff"));
    set_setting(conn, "cloud_store_id", user["storeId"].as_str().unwrap_or(""));

    // Stores first — users.store_id and user_stores reference them.
    if let Some(stores) = user["stores"].as_array() {
        for s in stores {
            upsert_row(conn, "stores", s, STORE_COLS, &[]);
        }
    }

    // Upsert the user; the password they just used is hashed locally so the
    // same credentials keep working when the cloud is unreachable.
    let id = user["id"].as_str().unwrap_or("");
    if !id.is_empty() {
        let pw_hash = auth::hash_password(password);
        let _ = conn.execute(
            "INSERT INTO users (id, username, password, name, email, role, store_id, is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT (id) DO UPDATE SET
                username=excluded.username, password=excluded.password, name=excluded.name,
                email=excluded.email, role=excluded.role, store_id=excluded.store_id,
                is_active=excluded.is_active",
            rusqlite::params![
                id,
                user["username"].as_str().unwrap_or(username),
                pw_hash,
                user["name"].as_str().unwrap_or(""),
                user["email"].as_str().unwrap_or(""),
                user["role"].as_str().unwrap_or("staff"),
                user["storeId"].as_str().unwrap_or(""),
                if user["isActive"].as_bool().unwrap_or(true) { 1 } else { 0 },
                user["createdAt"].as_str().unwrap_or(""),
            ],
        );
        // Keep the user's store memberships in sync (business_owner flows
        // resolve stores through user_stores).
        let _ = conn.execute("DELETE FROM user_stores WHERE user_id = ?1", [id]);
        if let Some(stores) = user["stores"].as_array() {
            for s in stores {
                if let Some(sid) = s["id"].as_str() {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?1, ?2)",
                        rusqlite::params![id, sid],
                    );
                }
            }
        }
    }
}

/// Valid cloud token — returns the cached one, or silently re-logs in with
/// the cached credentials when it is absent/expired.
async fn ensure_cloud_token(state: &LocalBackend) -> Option<String> {
    let (token, username, password) = {
        let conn = state.conn.lock().unwrap();
        (
            get_setting(&conn, "cloud_token"),
            get_setting(&conn, "cloud_username"),
            get_setting(&conn, "cloud_password"),
        )
    };
    if let Some(t) = token.filter(|t| !t.is_empty()) {
        return Some(t);
    }
    let (u, p) = match (username, password) {
        (Some(u), Some(p)) if !u.is_empty() => (u, p),
        _ => return None,
    };
    match cloud_login(state, &u, &p).await {
        CloudLogin::Success { token, user } => {
            let conn = state.conn.lock().unwrap();
            cache_cloud_session(&conn, &u, &p, &token, &user);
            Some(token)
        }
        _ => None,
    }
}

fn clear_cloud_token(conn: &Connection) {
    set_setting(conn, "cloud_token", "");
}

// ---------------------------------------------------------------------------
// Generic upsert helpers for snapshot pulls
// ---------------------------------------------------------------------------

/// (json_key, column) pairs. `id` must be present — it is the conflict key.
type ColMap = &'static [(&'static str, &'static str)];

const STORE_COLS: ColMap = &[
    ("id", "id"), ("name", "name"), ("branch", "branch"), ("location", "location"),
    ("gstin", "gstin"), ("fssaiNo", "fssai_no"), ("phone", "phone"),
    ("printerName", "printer_name"), ("printerVendorId", "printer_vendor_id"),
    ("printerProductId", "printer_product_id"), ("invoiceSize", "invoice_size"),
    ("kotPrintEnabled", "kot_print_enabled"), ("remoteBillingEnabled", "remote_billing_enabled"),
    ("logoUrl", "logo_url"), ("themeColor", "theme_color"),
    ("taxEnabled", "tax_enabled"), ("defaultTaxPercent", "default_tax_percent"),
    ("isActive", "is_active"), ("createdAt", "created_at"),
];

const CATEGORY_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("name", "name"), ("description", "description"),
    ("isActive", "is_active"), ("enabled", "enabled"), ("isFavourite", "is_favourite"),
    ("createdAt", "created_at"),
];

const ITEM_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("categoryId", "category_id"), ("name", "name"),
    ("description", "description"), ("price", "price"), ("hsnCode", "hsn_code"),
    ("taxPercent", "tax_percent"), ("isActive", "is_active"), ("enabled", "enabled"),
    ("isFavourite", "is_favourite"), ("createdAt", "created_at"),
];

const ITEM_EXPENSE_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("itemId", "item_id"), ("name", "name"),
    ("description", "description"), ("amount", "amount"), ("isActive", "is_active"),
    ("createdAt", "created_at"),
];

const SECTION_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("name", "name"), ("createdAt", "created_at"),
];

const ORDER_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("tableId", "table_id"),
    ("tableNumber", "table_number"), ("status", "status"), ("orderType", "order_type"),
    ("customerName", "customer_name"), ("customerMobile", "customer_mobile"),
    ("totalAmount", "total_amount"), ("taxAmount", "tax_amount"),
    ("discountAmount", "discount_amount"), ("paymentMethod", "payment_method"),
    ("paymentStatus", "payment_status"), ("createdBy", "created_by"),
    ("createdAt", "created_at"), ("updatedAt", "updated_at"), ("cancelledAt", "cancelled_at"),
];

const BILL_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("orderId", "order_id"),
    ("tableNumber", "table_number"), ("invoiceNo", "invoice_no"), ("subtotal", "subtotal"),
    ("taxTotal", "tax_total"), ("discount", "discount"), ("total", "total"),
    ("paymentMethod", "payment_method"), ("customerName", "customer_name"),
    ("customerMobile", "customer_mobile"), ("isPrinted", "is_printed"),
    ("status", "status"), ("generatedAt", "generated_at"), ("generatedBy", "generated_by"),
];

const BILL_QUEUE_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("orderId", "order_id"),
    ("billData", "bill_data"), ("status", "status"), ("errorMessage", "error_message"),
    ("createdAt", "created_at"), ("updatedAt", "updated_at"),
];

const EXPENSE_CAT_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("name", "name"), ("description", "description"),
    ("isActive", "is_active"), ("createdAt", "created_at"),
];

const EXPENSE_COLS: ColMap = &[
    ("id", "id"), ("storeId", "store_id"), ("categoryId", "category_id"),
    ("title", "title"), ("description", "description"), ("amount", "amount"),
    ("expenseDate", "expense_date"), ("paymentMethod", "payment_method"),
    ("receiptNumber", "receipt_number"), ("vendor", "vendor"),
    ("attachments", "attachments"), ("isActive", "is_active"),
    ("createdAt", "created_at"), ("updatedAt", "updated_at"), ("createdBy", "created_by"),
];

/// INSERT … ON CONFLICT(id) DO UPDATE for a cloud JSON row. `pre` lets callers
/// inject derived column values (e.g. tables' nested `position` object or a
/// constant like users.password on insert).
fn upsert_row(conn: &Connection, table: &str, row: &Value, map: ColMap, pre: &[(&str, Value)]) {
    let Some(id) = row["id"].as_str() else { return };
    if id.is_empty() {
        return;
    }

    let mut cols: Vec<String> = Vec::new();
    let mut vals: Vec<rusqlite::types::Value> = Vec::new();
    for (jk, col) in map {
        cols.push(col.to_string());
        vals.push(json_to_sql(&row[*jk]));
    }
    for (col, v) in pre {
        cols.push(col.to_string());
        vals.push(json_to_sql(v));
    }

    let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{}", i)).collect();
    let updates: Vec<String> = cols
        .iter()
        .filter(|c| c.as_str() != "id")
        .map(|c| format!("{} = excluded.{}", c, c))
        .collect();
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT (id) DO UPDATE SET {}",
        table,
        cols.join(", "),
        placeholders.join(", "),
        updates.join(", ")
    );
    let _ = conn.execute(&sql, rusqlite::params_from_iter(vals));
}

fn upsert_table(conn: &Connection, row: &Value) {
    let x = row["position"]["x"].clone();
    let y = row["position"]["y"].clone();
    upsert_row(
        conn,
        "tables",
        row,
        &[
            ("id", "id"), ("storeId", "store_id"), ("number", "number"),
            ("seats", "seats"), ("isActive", "is_active"), ("section", "section"),
        ],
        &[("position_x", x), ("position_y", y)],
    );
}

fn upsert_order(conn: &Connection, row: &Value) {
    upsert_row(conn, "orders", row, ORDER_COLS, &[]);
    if let Some(order_id) = row["id"].as_str() {
        let _ = conn.execute("DELETE FROM order_items WHERE order_id = ?1", [order_id]);
        if let Some(items) = row["items"].as_array() {
            for it in items {
                let _ = conn.execute(
                    "INSERT INTO order_items (order_id, item_id, quantity, unit_price, tax_percent, notes)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    rusqlite::params![
                        order_id,
                        it["itemId"].as_str().unwrap_or(""),
                        it["quantity"].as_i64().unwrap_or(0),
                        it["unitPrice"].as_f64().unwrap_or(0.0),
                        it["taxPercent"].as_f64().unwrap_or(0.0),
                        it["notes"].as_str().or(it["note"].as_str()).unwrap_or(""),
                    ],
                );
            }
        }
    }
}

fn upsert_bill(conn: &Connection, row: &Value) {
    upsert_row(conn, "bills", row, BILL_COLS, &[]);
    // Convergence: a queued bill is finalized independently on both sides with
    // a deterministic id (orderId + "-bill"); if a different local bill exists
    // for the same order the cloud version wins.
    if let (Some(oid), Some(bid)) = (row["orderId"].as_str(), row["id"].as_str()) {
        let _ = conn.execute(
            "DELETE FROM bills WHERE order_id = ?1 AND id <> ?2",
            rusqlite::params![oid, bid],
        );
    }
}

fn upsert_user(conn: &Connection, row: &Value) {
    // password is never sent by the cloud — keep the local hash on update and
    // insert an empty one on first sight (offline login activates once the
    // user logs in via cloud, which caches the hash).
    upsert_row(
        conn,
        "users",
        row,
        &[
            ("id", "id"), ("username", "username"), ("name", "name"), ("email", "email"),
            ("role", "role"), ("storeId", "store_id"), ("isActive", "is_active"),
            ("createdAt", "created_at"),
        ],
        &[("password", Value::String(String::new()))],
    );
    if let (Some(uid), Some(ids)) = (row["id"].as_str(), row["storeIds"].as_array()) {
        for s in ids {
            if let Some(sid) = s.as_str() {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?1, ?2)",
                    rusqlite::params![uid, sid],
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Snapshot pull — refresh a store's data from cloud into the local DB
// ---------------------------------------------------------------------------

async fn cloud_get(state: &LocalBackend, base: &str, token: &str, path: &str) -> Option<Value> {
    let resp = state
        .http
        .get(format!("{}{}", base, path))
        .bearer_auth(token)
        .timeout(REQ_TIMEOUT)
        .send()
        .await
        .ok()?;
    if resp.status().as_u16() != 200 {
        return None;
    }
    resp.json().await.ok()
}

/// Pull the full dataset for the logged-in store from cloud into SQLite.
/// Non-fatal: individual collection failures are skipped so the app stays
/// usable on partial connectivity.
pub async fn pull_snapshot(state: &LocalBackend) -> Result<(), String> {
    let (base, store_id) = {
        let conn = state.conn.lock().unwrap();
        (cloud_base(&conn), get_setting(&conn, "cloud_store_id").unwrap_or_default())
    };
    if store_id.is_empty() {
        return Err("no store selected".to_string());
    }
    let Some(token) = ensure_cloud_token(state).await else {
        return Err("cloud unreachable".to_string());
    };

    // Grab the event cursor BEFORE fetching collections: anything that changes
    // on the cloud after this point is picked up by incremental event pulls,
    // so the snapshot can't silently miss it.
    let cursor = if last_seq(state).is_none() {
        cloud_get(state, &base, &token, "/api/sync/events?since=-1&storeId=")
            .await
            .and_then(|v| v["latest"].as_i64())
    } else {
        None
    };

    let enc = |s: &str| urlencoding(s);
    let sid = enc(&store_id);

    // Fetch all collections first (network), then write under one DB lock.
    let store = cloud_get(state, &base, &token, &format!("/api/stores/{}", sid)).await;
    let categories = cloud_get(state, &base, &token, &format!("/api/categories?storeId={}", sid)).await;
    let items = cloud_get(state, &base, &token, &format!("/api/items?storeId={}", sid)).await;
    let tables = cloud_get(state, &base, &token, &format!("/api/tables?storeId={}", sid)).await;
    let sections = cloud_get(state, &base, &token, &format!("/api/tables/sections?storeId={}", sid)).await;
    let orders = cloud_get(state, &base, &token, &format!("/api/orders?storeId={}", sid)).await;
    let bills = cloud_get(state, &base, &token, &format!("/api/bills?storeId={}", sid)).await;
    let bill_queue = cloud_get(state, &base, &token, &format!("/api/bills/queue?storeId={}", sid)).await;
    let expense_cats = cloud_get(state, &base, &token, &format!("/api/expense-categories?storeId={}", sid)).await;
    let expenses = cloud_get(state, &base, &token, &format!("/api/expenses?storeId={}", sid)).await;
    let users = cloud_get(state, &base, &token, "/api/users").await;

    // Item expenses are per-item on the API.
    let mut item_expenses: Vec<Value> = Vec::new();
    if let Some(arr) = items.as_ref().and_then(|v| v.as_array()) {
        for it in arr {
            if let Some(iid) = it["id"].as_str() {
                if let Some(v) = cloud_get(
                    state,
                    &base,
                    &token,
                    &format!("/api/items/{}/expenses", enc(iid)),
                )
                .await
                {
                    if let Some(list) = v.as_array() {
                        item_expenses.extend(list.iter().cloned());
                    }
                }
            }
        }
    }

    {
        let conn = state.conn.lock().unwrap();
        // Cloud data is already referentially consistent; disabling FK during
        // the bulk upsert avoids dropping rows that reference entities outside
        // this store's scope (e.g. a user from another store as created_by).
        let _ = conn.pragma_update(None, "foreign_keys", "OFF");
        if let Some(s) = store.as_ref().filter(|v| v.is_object()) {
            upsert_row(&conn, "stores", s, STORE_COLS, &[]);
        }
        let apply = |v: &Option<Value>, f: &dyn Fn(&Connection, &Value)| {
            if let Some(arr) = v.as_ref().and_then(|v| v.as_array()) {
                for row in arr {
                    f(&conn, row);
                }
            }
        };
        // FK-safe order: stores → users → categories → items → item_expenses
        // → sections → tables → orders → bills → queue → expense_cats → expenses.
        apply(&users, &|c, r| upsert_user(c, r));
        apply(&categories, &|c, r| upsert_row(c, "categories", r, CATEGORY_COLS, &[]));
        apply(&items, &|c, r| upsert_row(c, "items", r, ITEM_COLS, &[]));
        for r in &item_expenses {
            upsert_row(&conn, "item_expenses", r, ITEM_EXPENSE_COLS, &[]);
        }
        apply(&sections, &|c, r| upsert_row(c, "table_sections", r, SECTION_COLS, &[]));
        apply(&tables, &|c, r| upsert_table(c, r));
        apply(&orders, &|c, r| upsert_order(c, r));
        apply(&bills, &|c, r| upsert_bill(c, r));
        apply(&bill_queue, &|c, r| upsert_row(c, "bill_queue", r, BILL_QUEUE_COLS, &[]));
        apply(&expense_cats, &|c, r| upsert_row(c, "expense_categories", r, EXPENSE_CAT_COLS, &[]));
        apply(&expenses, &|c, r| upsert_row(c, "expenses", r, EXPENSE_COLS, &[]));
        set_setting(&conn, "cloud_last_snapshot", &super::db::now_ts());
        // Start the event cursor at the position captured before the fetch so
        // later changes flow in incrementally (and history isn't replayed).
        if let Some(latest) = cursor {
            set_setting(&conn, "cloud_last_seq", &latest.to_string());
        }
        let _ = conn.pragma_update(None, "foreign_keys", "ON");
    }

    Ok(())
}

fn urlencoding(s: &str) -> String {
    // Minimal percent-encoding sufficient for uuid/number store ids.
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Push — replay local mutations to the cloud
// ---------------------------------------------------------------------------

async fn push_outbox(state: &LocalBackend, token: &mut String, base: &str) {
    let rows: Vec<(i64, String, String, String, Option<String>)> = {
        let conn = state.conn.lock().unwrap();
        (|| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, event_id, method, path, body FROM sync_outbox
                     WHERE pushed = 0 AND attempts < ?1 ORDER BY id ASC LIMIT 100",
                )
                .ok()?;
            let rows = stmt
                .query_map(rusqlite::params![MAX_PUSH_ATTEMPTS], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, Option<String>>(4)?,
                    ))
                })
                .ok()?;
            Some(rows.filter_map(|r| r.ok()).collect())
        })()
        .unwrap_or_default()
    };

    for (row_id, event_id, method, path, body) in rows {
        let payload = json!({
            "eventId": event_id,
            "method": method,
            "path": path,
            "body": body
                .as_deref()
                .and_then(|s| serde_json::from_str::<Value>(s).ok())
                .unwrap_or(Value::Null),
        });

        let mut retried = false;
        loop {
            let resp = state
                .http
                .post(format!("{}/api/sync/apply", base))
                .bearer_auth(&*token)
                .json(&payload)
                .timeout(REQ_TIMEOUT)
                .send()
                .await;

            match resp {
                Ok(r) if r.status().as_u16() == 200 => {
                    let conn = state.conn.lock().unwrap();
                    let _ = conn.execute(
                        "UPDATE sync_outbox SET pushed = 1 WHERE id = ?1",
                        [row_id],
                    );
                    break;
                }
                Ok(r) if r.status().as_u16() == 401 && !retried => {
                    retried = true;
                    {
                        let conn = state.conn.lock().unwrap();
                        clear_cloud_token(&conn);
                    }
                    match ensure_cloud_token(state).await {
                        Some(t) => *token = t,
                        None => return, // can't re-auth — retry next cycle
                    }
                    continue;
                }
                Ok(_) => {
                    // Applied-but-failed or rejected — count the attempt; the
                    // event is dead-lettered after MAX_PUSH_ATTEMPTS.
                    let conn = state.conn.lock().unwrap();
                    let _ = conn.execute(
                        "UPDATE sync_outbox SET attempts = attempts + 1 WHERE id = ?1",
                        [row_id],
                    );
                    break;
                }
                Err(_) => return, // offline — stop the batch, retry next cycle
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pull — replay cloud CRUD events locally
// ---------------------------------------------------------------------------

fn last_seq(state: &LocalBackend) -> Option<i64> {
    let conn = state.conn.lock().unwrap();
    get_setting(&conn, "cloud_last_seq").and_then(|s| s.parse().ok())
}

/// Mint a local JWT for the cached cloud user so replayed events satisfy the
/// normal auth checks (and writes get the right created_by/store).
fn internal_token(state: &LocalBackend) -> Option<String> {
    let conn = state.conn.lock().unwrap();
    let uid = get_setting(&conn, "cloud_user_id").unwrap_or_default();
    if uid.is_empty() {
        return None;
    }
    let username = get_setting(&conn, "cloud_username").unwrap_or_default();
    let role = get_setting(&conn, "cloud_role").unwrap_or_else(|| "staff".into());
    let store_id = get_setting(&conn, "cloud_store_id").unwrap_or_default();
    drop(conn);
    auth::generate_token(&auth::new_claims(&uid, &username, &role, &store_id), &state.jwt_secret).ok()
}

async fn pull_events(
    state: &LocalBackend,
    token: &mut String,
    base: &str,
    store_id: &str,
    app: &tauri::AppHandle,
) {
    let Some(since) = last_seq(state) else {
        return; // cursor only initialized after a snapshot pull
    };
    let local_token = match internal_token(state) {
        Some(t) => t,
        None => return,
    };

    let url = format!(
        "{}/api/sync/events?since={}&storeId={}&limit={}",
        base,
        since,
        urlencoding(store_id),
        PULL_BATCH
    );
    let resp = state
        .http
        .get(&url)
        .bearer_auth(&*token)
        .timeout(REQ_TIMEOUT)
        .send()
        .await;
    let body: Value = match resp {
        Ok(r) if r.status().as_u16() == 200 => r.json().await.unwrap_or(Value::Null),
        Ok(r) if r.status().as_u16() == 401 => {
            {
                let conn = state.conn.lock().unwrap();
                clear_cloud_token(&conn);
            }
            if let Some(t) = ensure_cloud_token(state).await {
                *token = t;
            }
            return;
        }
        _ => return, // offline or error — next cycle
    };

    let events = match body["events"].as_array() {
        Some(e) => e.clone(),
        None => return,
    };

    // Cloud-originated replays fan out to the desktop UI + LAN clients just
    // like local edits do.
    let broadcast = |sid: &str, reason: &str| api::notify(app, state, sid, reason);
    for ev in events {
        let seq = ev["seq"].as_i64().unwrap_or(0);
        let method = ev["method"].as_str().unwrap_or("").to_string();
        let path = ev["path"].as_str().unwrap_or("").to_string();
        let ev_body = if ev["body"].is_null() { None } else { Some(ev["body"].clone()) };
        if method.is_empty() || path.is_empty() {
            continue;
        }

        let req = ApiRequest {
            method,
            path,
            body: ev_body,
            token: Some(local_token.clone()),
        };
        // suppress_outbox = true → the applied change is NOT re-pushed.
        let resp = api::dispatch_impl_ex(state, req, &broadcast, true).await;
        if resp.status >= 400 {
            eprintln!(
                "[sync] event seq={} replay failed ({}): {}",
                seq, resp.status, resp.body
            );
        }
        if seq > 0 {
            let conn = state.conn.lock().unwrap();
            set_setting(&conn, "cloud_last_seq", &seq.to_string());
        }
    }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/// Spawn the background sync worker. Runs a push+pull cycle every
/// CYCLE_INTERVAL, or immediately when `sync_notify` fires (after a mutation
/// is queued or a user logs in). `app` is used to fan out table-status
/// broadcasts when cloud-originated events are replayed locally.
pub fn start(state: Arc<LocalBackend>, app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Initial refresh when the app opens with an existing session —
        // keeps local data current before the user touches anything.
        {
            let has_session = {
                let conn = state.conn.lock().unwrap();
                !get_setting(&conn, "cloud_username")
                    .unwrap_or_default()
                    .is_empty()
            };
            if has_session {
                let _ = pull_snapshot(&state).await;
            }
        }

        loop {
            tokio::select! {
                _ = tokio::time::sleep(CYCLE_INTERVAL) => {},
                _ = state.sync_notify.notified() => {},
            }
            sync_cycle(&state, &app).await;
        }
    });
}

async fn sync_cycle(state: &Arc<LocalBackend>, app: &tauri::AppHandle) {
    let (base, store_id, has_creds) = {
        let conn = state.conn.lock().unwrap();
        if local_only_mode(&conn) {
            return; // cloud disabled — nothing to sync
        }
        (
            cloud_base(&conn),
            get_setting(&conn, "cloud_store_id").unwrap_or_default(),
            !get_setting(&conn, "cloud_username")
                .unwrap_or_default()
                .is_empty(),
        )
    };
    if !has_creds {
        return; // never logged in via cloud — nothing to sync
    }

    let Some(mut token) = ensure_cloud_token(state).await else {
        return; // offline or credentials stale — retry next cycle
    };

    push_outbox(state, &mut token, &base).await;
    if !store_id.is_empty() {
        pull_events(state, &mut token, &base, &store_id, app).await;
    }
}
