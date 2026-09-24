pub mod api;
pub mod auth;
pub mod cleanup;
pub mod db;
pub mod lan_server;
pub mod sync;

use rusqlite::Connection;
use std::sync::Mutex;

/// Shared state for the embedded local backend.
/// Holds the SQLite connection and the JWT signing secret.
pub struct LocalBackend {
    pub conn: Mutex<Connection>,
    pub jwt_secret: String,
    /// Broadcast channel for LAN websocket clients (table status updates).
    pub lan_tx: tokio::sync::broadcast::Sender<serde_json::Value>,
    /// Stable identifier for this POS host — persisted in global_settings so
    /// mobile apps can recognize the same machine across IP changes.
    pub lan_server_id: String,
    /// Shared HTTP client for cloud sync requests.
    pub http: reqwest::Client,
    /// Notified whenever a sync cycle should run immediately (e.g. after a
    /// successful cloud login so the snapshot pull starts right away).
    pub sync_notify: std::sync::Arc<tokio::sync::Notify>,
}

impl LocalBackend {
    pub fn new(db_path: &std::path::Path) -> Result<Self, String> {
        let conn = db::init_db(db_path).map_err(|e| format!("Failed to initialize local DB: {}", e))?;

        // Load or generate the JWT secret and persist it so user sessions
        // remain valid across app restarts.
        let jwt_secret = conn
            .query_row(
                "SELECT value FROM global_settings WHERE key = 'jwt_secret'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                let mut bytes = [0u8; 32];
                rand::Rng::fill(&mut rand::thread_rng(), &mut bytes);
                let secret = hex::encode(bytes);
                let _ = conn.execute(
                    "INSERT INTO global_settings (key, value) VALUES ('jwt_secret', ?1)
                     ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                    [&secret],
                );
                secret
            });

        // Stable server identity for LAN discovery — generated once, persisted.
        let lan_server_id = conn
            .query_row(
                "SELECT value FROM global_settings WHERE key = 'lan_server_id'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                let id = uuid::Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO global_settings (key, value) VALUES ('lan_server_id', ?1)
                     ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                    [&id],
                );
                id
            });

        Ok(LocalBackend {
            conn: Mutex::new(conn),
            jwt_secret,
            lan_tx: tokio::sync::broadcast::channel(100).0,
            lan_server_id,
            http: reqwest::Client::new(),
            sync_notify: std::sync::Arc::new(tokio::sync::Notify::new()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local::api::{self, ApiRequest, ApiResponse};
    use crate::local::auth;
    use serde_json::{json, Value};
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_db() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let p = std::env::temp_dir().join(format!(
            "mario_test_{}_{}.db",
            std::process::id(),
            n
        ));
        let _ = std::fs::remove_file(&p);
        p
    }

    fn req(method: &str, path: &str, body: Option<Value>, token: Option<&str>) -> ApiRequest {
        ApiRequest {
            method: method.to_string(),
            path: path.to_string(),
            body,
            token: token.map(|s| s.to_string()),
        }
    }

    fn run(
        state: &LocalBackend,
        broadcast: &(dyn Fn(&str, &str) + Send + Sync),
        r: ApiRequest,
    ) -> ApiResponse {
        tauri::async_runtime::block_on(api::dispatch_impl(state, r, broadcast))
    }

    #[test]
    fn seeds_store_and_users() {
        let path = temp_db();
        let be = LocalBackend::new(&path).unwrap();
        let conn = be.conn.lock().unwrap();

        let store: String = conn
            .query_row("SELECT name FROM stores WHERE id = '1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(store, "Main Cafe");

        let hash: String = conn
            .query_row(
                "SELECT password FROM users WHERE username = 'superadmin'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(auth::verify_password(&hash, "superadmin123"));
        assert!(!auth::verify_password(&hash, "wrong"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn jwt_roundtrip() {
        let be = LocalBackend::new(&temp_db()).unwrap();
        let claims = auth::new_claims("u1", "superadmin", "superadmin", "1");
        let token = auth::generate_token(&claims, &be.jwt_secret).unwrap();
        let parsed = auth::verify_token(&token, &be.jwt_secret).unwrap();
        assert_eq!(parsed.id, "u1");
        assert_eq!(parsed.role, "superadmin");
        assert!(auth::verify_token(&token, "other-secret").is_none());
    }

    /// Point the cloud URL at an unroutable address so logins take the
    /// offline local-auth path and sync pushes fail instantly.
    fn force_offline_cloud(be: &LocalBackend) {
        let conn = be.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO global_settings (key, value) VALUES ('cloud_base_url', 'local')
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            [],
        )
        .unwrap();
    }

    /// End-to-end: login → CRUD → order → bill → reports, all via dispatch_impl.
    #[test]
    fn end_to_end_pos_flow() {
        let be = LocalBackend::new(&temp_db()).unwrap();
        force_offline_cloud(&be);
        let events: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());
        let broadcast = |sid: &str, reason: &str| {
            events
                .lock()
                .unwrap()
                .push((sid.to_string(), reason.to_string()));
        };
        let b: &(dyn Fn(&str, &str) + Send + Sync) = &broadcast;

        // Unauthenticated request must be rejected.
        let r = run(&be, b, req("GET", "/users", None, None));
        assert_eq!(r.status, 401, "{:?}", r.body);

        // Public endpoints work without a token.
        assert_eq!(run(&be, b, req("GET", "/stores/default", None, None)).status, 200);
        assert_eq!(run(&be, b, req("GET", "/support-config", None, None)).status, 200);
        assert_eq!(run(&be, b, req("GET", "/app-updates", None, None)).status, 200);

        // Bad login → 401, good login → token.
        let r = run(
            &be,
            b,
            req(
                "POST",
                "/auth/login",
                Some(json!({"username": "superadmin", "password": "bad"})),
                None,
            ),
        );
        assert_eq!(r.status, 401, "{:?}", r.body);

        let r = run(
            &be,
            b,
            req(
                "POST",
                "/auth/login",
                Some(json!({"username": "superadmin", "password": "superadmin123"})),
                None,
            ),
        );
        assert_eq!(r.status, 200, "{:?}", r.body);
        let token = r.body["token"].as_str().unwrap().to_string();
        let t = Some(token.as_str());

        let r = run(&be, b, req("GET", "/auth/me", None, t));
        assert_eq!(r.status, 200, "{:?}", r.body);
        assert_eq!(r.body["username"], "superadmin");

        // Category + item.
        let r = run(
            &be,
            b,
            req(
                "POST",
                "/categories",
                Some(json!({"name": "Drinks", "storeId": "1"})),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);
        let cat_id = r.body["id"].as_str().unwrap().to_string();

        let r = run(
            &be,
            b,
            req(
                "POST",
                "/items",
                Some(json!({
                    "name": "Coffee", "price": 3.5, "categoryId": cat_id, "storeId": "1"
                })),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);
        let item_id = r.body["id"].as_str().unwrap().to_string();

        // Table.
        let r = run(
            &be,
            b,
            req(
                "POST",
                "/tables",
                Some(json!({"number": 5, "seats": 4, "storeId": "1", "section": "Main"})),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);
        let table_id = r.body["id"].as_str().unwrap().to_string();

        // Order on that table.
        let r = run(
            &be,
            b,
            req(
                "POST",
                "/orders",
                Some(json!({
                    "storeId": "1", "tableId": table_id, "tableNumber": 5,
                    "totalAmount": 7.0, "taxAmount": 0.0, "discountAmount": 0.0,
                    "items": [{"itemId": item_id, "quantity": 2, "unitPrice": 3.5}]
                })),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);
        let order_id = r.body["id"].as_str().unwrap().to_string();

        // Table-status broadcast fired for order creation.
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|(sid, reason)| sid == "1" && reason == "order_created"));

        // Orders list contains it.
        let r = run(&be, b, req("GET", "/orders?storeId=1&status=active", None, t));
        assert_eq!(r.status, 200, "{:?}", r.body);
        assert!(r
            .body
            .as_array()
            .unwrap()
            .iter()
            .any(|o| o["id"].as_str() == Some(order_id.as_str())));

        // Invoice number generation + bill creation.
        let r = run(&be, b, req("GET", "/bills/next-invoice-no?storeId=1", None, t));
        assert_eq!(r.status, 200, "{:?}", r.body);
        let invoice_no = r.body["invoiceNo"].as_str().unwrap().to_string();
        assert!(!invoice_no.is_empty());

        let r = run(
            &be,
            b,
            req(
                "POST",
                "/bills",
                Some(json!({
                    "storeId": "1", "orderId": order_id, "tableNumber": 5,
                    "invoiceNo": invoice_no, "subtotal": 7.0, "taxTotal": 0.0,
                    "discount": 0.0, "total": 7.0, "paymentMethod": "cash"
                })),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);

        // Reports and stats.
        assert_eq!(
            run(&be, b, req("GET", "/reports/revenue?storeId=1", None, t)).status,
            200
        );
        assert_eq!(
            run(&be, b, req("GET", "/reports/item-profit?storeId=1", None, t)).status,
            200
        );
        assert_eq!(run(&be, b, req("GET", "/system/stats", None, t)).status, 200);

        // Expense category + expense.
        let r = run(
            &be,
            b,
            req(
                "POST",
                "/expense-categories",
                Some(json!({"name": "Supplies", "storeId": "1"})),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);
        let exp_cat = r.body["id"].as_str().unwrap().to_string();

        let r = run(
            &be,
            b,
            req(
                "POST",
                "/expenses",
                Some(json!({
                    "storeId": "1", "categoryId": exp_cat, "amount": 10.0,
                    "title": "Napkins", "description": "Napkins for tables"
                })),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);

        // User management.
        let r = run(
            &be,
            b,
            req(
                "POST",
                "/users",
                Some(json!({
                    "username": "cashier1", "password": "pw12345", "name": "Cashier",
                    "role": "staff", "storeId": "1"
                })),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);

        // New user can log in.
        let r = run(
            &be,
            b,
            req(
                "POST",
                "/auth/login",
                Some(json!({"username": "cashier1", "password": "pw12345"})),
                None,
            ),
        );
        assert_eq!(r.status, 200, "{:?}", r.body);

        // Unknown route → 404.
        assert_eq!(run(&be, b, req("GET", "/nope", None, t)).status, 404);
    }

    /// Mutations land in sync_outbox; suppressed replays (cloud-originated
    /// events applied locally) do NOT get re-enqueued — no circular sync.
    #[test]
    fn outbox_records_mutations_and_suppresses_replays() {
        let be = LocalBackend::new(&temp_db()).unwrap();
        force_offline_cloud(&be);
        let b: &(dyn Fn(&str, &str) + Send + Sync) = &|_s: &str, _r: &str| {};

        let r = run(
            &be,
            b,
            req(
                "POST",
                "/auth/login",
                Some(json!({"username": "superadmin", "password": "superadmin123"})),
                None,
            ),
        );
        assert_eq!(r.status, 200, "{:?}", r.body);
        let token = r.body["token"].as_str().unwrap().to_string();
        let t = Some(token.as_str());

        // A create → one outbox row carrying the assigned id.
        let r = run(
            &be,
            b,
            req(
                "POST",
                "/categories",
                Some(json!({"name": "Drinks", "storeId": "1"})),
                t,
            ),
        );
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);
        let cat_id = r.body["id"].as_str().unwrap().to_string();

        let count_after_create: i64 = {
            let conn = be.conn.lock().unwrap();
            let (method, path, body): (String, String, String) = conn
                .query_row(
                    "SELECT method, path, body FROM sync_outbox ORDER BY id DESC LIMIT 1",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .unwrap();
            assert_eq!(method, "POST");
            assert_eq!(path, "/categories");
            let parsed: Value = serde_json::from_str(&body).unwrap();
            assert_eq!(parsed["id"].as_str(), Some(cat_id.as_str()));
            conn.query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))
                .unwrap()
        };
        assert_eq!(count_after_create, 1);

        // Failed mutations are not queued.
        let r = run(
            &be,
            b,
            req(
                "PUT",
                "/categories",
                Some(json!({"name": "X"})),
                t,
            ),
        );
        assert!(r.status >= 400);
        {
            let conn = be.conn.lock().unwrap();
            let count: i64 = conn
                .query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 1);
        }

        // Replay with suppress → outbox unchanged, client id honored.
        let r = tauri::async_runtime::block_on(api::dispatch_impl_ex(
            &be,
            req(
                "POST",
                "/categories",
                Some(json!({"id": "cloud-cat-1", "name": "FromCloud", "storeId": "1"})),
                t,
            ),
            b,
            true,
        ));
        assert!(r.status == 200 || r.status == 201, "{:?}", r.body);
        assert_eq!(r.body["id"].as_str(), Some("cloud-cat-1"));

        let conn = be.conn.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1); // suppressed replay added nothing
    }
}
