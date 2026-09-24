pub mod auth_handlers;
pub mod bills;
pub mod rows;
pub mod catalog;
pub mod expenses;
pub mod menu;
pub mod orders;
pub mod stores;
pub mod system;
pub mod tables;
pub mod users;

use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::MutexGuard;
use tauri::{AppHandle, Emitter};

use super::auth::Claims;
use super::LocalBackend;

#[derive(Debug, Deserialize)]
pub struct ApiRequest {
    pub method: String,
    /// Path including optional query string, e.g. "/items?storeId=1".
    /// No "/api" prefix — the frontend already strips it.
    pub path: String,
    #[serde(default)]
    pub body: Option<Value>,
    #[serde(default)]
    pub token: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub body: Value,
}

pub fn ok(body: Value) -> ApiResponse {
    ApiResponse { status: 200, body }
}

pub fn created(body: Value) -> ApiResponse {
    ApiResponse { status: 201, body }
}

pub fn err(status: u16, msg: impl Into<String>) -> ApiResponse {
    ApiResponse {
        status,
        body: json!({ "error": msg.into() }),
    }
}

pub struct Ctx<'a> {
    pub conn: MutexGuard<'a, Connection>,
    pub claims: Option<Claims>,
    pub broadcast: &'a (dyn Fn(&str, &str) + Send + Sync),
    pub secret: &'a str,
    /// When true, successful mutations are NOT recorded in the sync outbox.
    /// Set while replaying cloud-originated events locally to prevent echo
    /// loops (pulled changes must not be re-pushed to the cloud).
    pub suppress_outbox: bool,
    /// Called after a mutation is queued in the sync outbox so the sync
    /// worker can push it promptly.
    pub outbox_kick: Option<&'a (dyn Fn() + Send + Sync)>,
}

impl<'a> Ctx<'a> {
    pub fn claims(&self) -> Result<&Claims, ApiResponse> {
        self.claims.as_ref().ok_or_else(|| err(401, "Unauthorized"))
    }

    pub fn jwt_secret(&self) -> &str {
        self.secret
    }
}

pub fn uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Primary key for a create: honor a client-supplied `id` when present (sync
/// replay sends the origin system's id so both sides converge on the same
/// primary key), otherwise generate a fresh UUID.
pub fn entity_id(body: &Value) -> String {
    body["id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(uuid)
}

pub fn now_ts() -> String {
    super::db::now_ts()
}

/// Convert a serde_json::Value into a rusqlite bind parameter.
pub fn json_to_sql(v: &Value) -> rusqlite::types::Value {
    match v {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else {
                rusqlite::types::Value::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        other => rusqlite::types::Value::Text(other.to_string()),
    }
}

/// Emit a table_status_update event to the frontend (replaces the WS broadcast).
fn emit_table_status(app: &AppHandle, store_id: &str, reason: &str) {
    if store_id.is_empty() {
        return;
    }
    let _ = app.emit(
        "table_status_update",
        json!({
            "type": "table_status_update",
            "storeId": store_id,
            "reason": reason,
        }),
    );
}

/// Notify the frontend that table/order status changed for a store.
pub fn broadcast_table_status(ctx: &Ctx<'_>, store_id: &str, reason: &str) {
    if store_id.is_empty() {
        return;
    }
    (ctx.broadcast)(store_id, reason);
}

/// Fan out a table-status change to both the in-app Tauri event channel and
/// LAN websocket clients connected to the embedded HTTP server.
pub fn notify(app: &AppHandle, state: &LocalBackend, store_id: &str, reason: &str) {
    if store_id.is_empty() {
        return;
    }
    emit_table_status(app, store_id, reason);
    let _ = state.lan_tx.send(json!({
        "type": "table_status_update",
        "storeId": store_id,
        "reason": reason,
    }));
}

/// Resolve the storeId from the request/query, falling back to the caller's
/// assigned store — mirrors the `targetStoreID` logic in the Go handlers.
pub fn target_store(claims: &Claims, requested: &str) -> Result<String, ApiResponse> {
    let id = if !requested.is_empty() {
        requested.to_string()
    } else {
        claims.store_id.clone()
    };
    if id.is_empty() {
        return Err(err(400, "Store ID required"));
    }
    Ok(id)
}

pub fn require_claims(state: &LocalBackend, token: &Option<String>) -> Result<Claims, ApiResponse> {
    let token = token
        .as_deref()
        .ok_or_else(|| err(401, "Access denied. No token provided."))?;
    let claims = super::auth::verify_token(token, &state.jwt_secret)
        .ok_or_else(|| err(401, "Invalid token"))?;

    // Verify user still exists and is active (mirrors Go auth middleware).
    let exists: bool = {
        let conn = state.conn.lock().unwrap();
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE id = ?1 AND is_active = 1)",
            [&claims.id],
            |r| r.get(0),
        )
        .unwrap_or(false)
    };
    if !exists {
        return Err(err(401, "Unauthorized: User not found or inactive"));
    }
    Ok(claims)
}

fn is_public(method: &str, segs: &[&str]) -> bool {
    match (method, segs) {
        ("POST", ["auth", "login"]) => true,
        ("GET", ["stores", "default"]) => true,
        ("GET", ["support-config"]) => true,
        ("GET", ["app-update"]) => true,
        ("GET", ["app-updates"]) => true,
        ("GET", ["update", "manifest"]) => true,
        ("GET", ["health"]) => true,
        _ => false,
    }
}

fn parse_query(path: &str) -> (String, HashMap<String, String>) {
    let (p, q) = match path.split_once('?') {
        Some((p, q)) => (p.to_string(), q),
        None => (path.to_string(), ""),
    };
    let mut params = HashMap::new();
    for pair in q.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        params.insert(
            urldecode(k),
            urldecode(v),
        );
    }
    (p, params)
}

fn urldecode(s: &str) -> String {
    let mut out = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = &s[i + 1..i + 3];
                if let Ok(b) = u8::from_str_radix(hex, 16) {
                    out.push(b);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn q<'a>(query: &'a HashMap<String, String>, key: &str) -> &'a str {
    query.get(key).map(|s| s.as_str()).unwrap_or("")
}

/// Main entry: dispatch an HTTP-like request to the local handler.
pub async fn dispatch(
    state: &LocalBackend,
    app: &AppHandle,
    req: ApiRequest,
) -> ApiResponse {
    let broadcast = |store_id: &str, reason: &str| notify(app, state, store_id, reason);
    dispatch_impl(state, req, &broadcast).await
}

/// Dispatch core, decoupled from the Tauri runtime so it can be driven by tests
/// or non-AppHandle callers. `broadcast` receives (store_id, reason) whenever
/// table status changes.
pub async fn dispatch_impl(
    state: &LocalBackend,
    req: ApiRequest,
    broadcast: &(dyn Fn(&str, &str) + Send + Sync),
) -> ApiResponse {
    dispatch_impl_ex(state, req, broadcast, false).await
}

/// `dispatch_impl` with explicit control over sync-outbox logging. The sync
/// worker passes `suppress_outbox = true` when replaying cloud-originated
/// events so they are not pushed back (no circular sync).
pub async fn dispatch_impl_ex(
    state: &LocalBackend,
    req: ApiRequest,
    broadcast: &(dyn Fn(&str, &str) + Send + Sync),
    suppress_outbox: bool,
) -> ApiResponse {
    let (path, query) = parse_query(&req.path);
    let path = path.trim_end_matches('/');
    let path = if path.is_empty() { "/" } else { path };
    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let method = req.method.to_uppercase();
    let body = req.body.clone().unwrap_or(Value::Null);

    // Health check
    if method == "GET" && segs == ["health"] {
        return ok(json!({ "status": "ok" }));
    }

    // LAN identity probe — lets mobile apps confirm which host they reached
    // (serverId survives IP changes; used for auto-reconnect).
    if method == "GET" && segs == ["lan-info"] {
        return ok(json!({
            "type": "mario_pos",
            "name": "Mario POS",
            "serverId": state.lan_server_id,
            "port": super::lan_server::lan_port(),
            "version": env!("CARGO_PKG_VERSION"),
        }));
    }

    // Auth
    let claims = if is_public(&method, &segs) {
        None
    } else {
        match require_claims(state, &req.token) {
            Ok(c) => Some(c),
            Err(r) => return r,
        }
    };

    // Gemini/network routes need async — gather DB data first, then await.
    if method == "GET" && segs == ["update", "manifest"] {
        return system::update_manifest(state, claims).await;
    }
    if method == "GET" && segs == ["system", "gemini-models"] {
        return menu::list_gemini_models(state, claims).await;
    }
    if method == "POST" && segs == ["menu", "parse"] {
        return menu::parse_menu(state, claims, body).await;
    }

    // Cloud-first login: try the remote backend so the user is authenticated
    // centrally; fall back to local credentials when offline. Runs before the
    // DB lock because the cloud call is async.
    if method == "POST" && segs == ["auth", "login"] {
        return auth_handlers::login_cloud_first(state, body).await;
    }

    let conn = state.conn.lock().unwrap();
    let kick = || state.sync_notify.notify_one();
    let mut ctx = Ctx {
        conn,
        claims,
        broadcast,
        secret: &state.jwt_secret,
        suppress_outbox,
        outbox_kick: Some(&kick),
    };

    let resp = match (method.as_str(), segs.as_slice()) {
        // ---- Auth ----
        ("POST", ["auth", "login"]) => auth_handlers::login(&mut ctx, body),
        ("POST", ["auth", "logout"]) => auth_handlers::logout(&mut ctx),
        ("GET", ["auth", "me"]) => auth_handlers::me(&mut ctx),

        // ---- Stores ----
        ("GET", ["stores"]) => stores::get_stores(&mut ctx),
        ("GET", ["stores", "default"]) => stores::get_default_store(&mut ctx),
        ("GET", ["stores", id]) => stores::get_store(&mut ctx, id),
        ("POST", ["stores"]) => stores::create_store(&mut ctx, body),
        ("PUT", ["stores", id]) => stores::update_store(&mut ctx, id, body),
        ("DELETE", ["stores", id]) => stores::delete_store(&mut ctx, id),
        ("POST", ["stores", "switch"]) => stores::switch_store(&mut ctx, body),
        ("POST", ["stores", id, "logo"]) => stores::upload_logo(&mut ctx, id, body),
        ("DELETE", ["stores", id, "logo"]) => stores::delete_logo(&mut ctx, id),

        // ---- Users ----
        ("GET", ["users"]) => users::get_users(&mut ctx),
        ("POST", ["users"]) => users::create_user(&mut ctx, body),
        ("PUT", ["users", id]) => users::update_user(&mut ctx, id, body),
        ("DELETE", ["users", id]) => users::delete_user(&mut ctx, id),
        ("POST", ["users", "change-password"]) => users::change_password(&mut ctx, body),
        ("POST", ["users", id, "reset-password"]) => users::reset_password(&mut ctx, id, body),

        // ---- Categories ----
        ("GET", ["categories"]) => catalog::get_categories(&mut ctx, q(&query, "storeId")),
        ("POST", ["categories"]) => catalog::create_category(&mut ctx, body),
        ("PUT", ["categories", id]) => catalog::update_category(&mut ctx, id, body),
        ("DELETE", ["categories", id]) => catalog::delete_category(&mut ctx, id),

        // ---- Items ----
        ("GET", ["items"]) => catalog::get_items(
            &mut ctx,
            q(&query, "storeId"),
            q(&query, "includeProfit") == "true",
        ),
        ("POST", ["items"]) => catalog::create_item(&mut ctx, body),
        ("PUT", ["items", id]) => catalog::update_item(&mut ctx, id, body),
        ("DELETE", ["items", id]) => catalog::delete_item(&mut ctx, id),
        ("GET", ["items", item_id, "expenses"]) => {
            catalog::get_item_expenses(&mut ctx, item_id)
        }
        ("POST", ["items", item_id, "expenses"]) => {
            catalog::create_item_expense(&mut ctx, item_id, body)
        }
        ("PUT", ["item-expenses", id]) => catalog::update_item_expense(&mut ctx, id, body),
        ("DELETE", ["item-expenses", id]) => {
            catalog::delete_item_expense(&mut ctx, id, q(&query, "storeId"))
        }

        // ---- Tables & sections ----
        ("GET", ["tables", "sections"]) => tables::get_sections(&mut ctx, q(&query, "storeId")),
        ("POST", ["tables", "sections"]) => tables::create_section(&mut ctx, body),
        ("PUT", ["tables", "sections", "rename"]) => tables::rename_section(&mut ctx, body),
        ("DELETE", ["tables", "sections", name]) => {
            tables::delete_section(&mut ctx, name, q(&query, "storeId"))
        }
        ("GET", ["tables"]) => tables::get_tables(&mut ctx, q(&query, "storeId")),
        ("POST", ["tables"]) => tables::create_table(&mut ctx, body),
        ("PUT", ["tables", id]) => tables::update_table(&mut ctx, id, body),
        ("DELETE", ["tables", id]) => tables::delete_table(&mut ctx, id),

        // ---- Orders ----
        ("POST", ["orders", "save-ebill"]) => orders::save_ebill(&mut ctx, body),
        ("POST", ["orders", "parcel"]) => orders::create_parcel_order(&mut ctx, body),
        ("GET", ["orders"]) => {
            orders::get_orders(&mut ctx, q(&query, "storeId"), q(&query, "status"))
        }
        ("POST", ["orders"]) => orders::create_order(&mut ctx, body),
        ("PUT", ["orders", id]) => orders::update_order(&mut ctx, id, body),
        ("PATCH", ["orders", id, "complete"]) => orders::complete_order(&mut ctx, id, body),
        ("PATCH", ["orders", id, "cancel"]) => orders::cancel_order(&mut ctx, id),
        ("POST", ["orders", id, "save-print"]) => orders::save_print(&mut ctx, id, body),

        // ---- Bills ----
        ("GET", ["bills", "queue"]) => bills::get_bill_queue(&mut ctx, q(&query, "storeId")),
        ("POST", ["bills", "queue"]) => bills::queue_bill(&mut ctx, body),
        ("GET", ["bills", "next-invoice-no"]) => {
            bills::get_next_invoice_no(&mut ctx, q(&query, "storeId"))
        }
        ("GET", ["bills"]) => bills::get_bills(&mut ctx, q(&query, "storeId")),
        ("POST", ["bills"]) => bills::create_bill(&mut ctx, body),

        // ---- System ----
        ("POST", ["system", "reset"]) => system::system_reset(&mut ctx, body),
        ("GET", ["system", "stats"]) => system::get_stats(&mut ctx),
        ("GET", ["system", "config"]) => system::get_system_config(&mut ctx),
        ("POST", ["system", "config"]) => system::update_system_config(&mut ctx, body),
        ("GET", ["app-update"]) => system::get_app_update(&mut ctx, q(&query, "platform")),
        ("GET", ["app-updates"]) => system::get_all_app_updates(&mut ctx),
        ("POST", ["app-update"]) => system::update_app_update(&mut ctx, body),
        ("GET", ["support-config"]) => system::get_support_config(&mut ctx),
        ("POST", ["support-config"]) => system::update_support_config(&mut ctx, body),
        ("GET", ["system", "update-config"]) => system::get_update_repo_config(&mut ctx),
        ("POST", ["system", "update-config"]) => {
            system::update_update_repo_config(&mut ctx, body)
        }
        ("GET", ["system", "gemini-config"]) => menu::get_gemini_config(&mut ctx),
        ("POST", ["system", "gemini-config"]) => menu::update_gemini_config(&mut ctx, body),
        ("POST", ["menu", "bulk"]) => menu::bulk_create_menu(&mut ctx, body),

        // ---- Expense categories ----
        ("GET", ["expense-categories"]) => {
            expenses::get_expense_categories(&mut ctx, q(&query, "storeId"))
        }
        ("POST", ["expense-categories"]) => expenses::create_expense_category(&mut ctx, body),
        ("PUT", ["expense-categories", id]) => {
            expenses::update_expense_category(&mut ctx, id, body)
        }
        ("DELETE", ["expense-categories", id]) => expenses::delete_expense_category(&mut ctx, id),

        // ---- Expenses & reports ----
        ("GET", ["expenses", "report", "by-category"]) => expenses::report_by_category(
            &mut ctx,
            q(&query, "storeId"),
            q(&query, "startDate"),
            q(&query, "endDate"),
        ),
        ("GET", ["expenses", "report", "by-date"]) => expenses::summary_by_date(
            &mut ctx,
            q(&query, "storeId"),
            q(&query, "startDate"),
            q(&query, "endDate"),
        ),
        ("GET", ["expenses"]) => expenses::get_expenses(
            &mut ctx,
            q(&query, "storeId"),
            q(&query, "startDate"),
            q(&query, "endDate"),
        ),
        ("GET", ["expenses", id]) => expenses::get_expense(&mut ctx, id),
        ("POST", ["expenses"]) => expenses::create_expense(&mut ctx, body),
        ("PUT", ["expenses", id]) => expenses::update_expense(&mut ctx, id, body),
        ("DELETE", ["expenses", id]) => expenses::delete_expense(&mut ctx, id),

        ("GET", ["reports", "revenue"]) => expenses::revenue_report(
            &mut ctx,
            q(&query, "storeId"),
            q(&query, "startDate"),
            q(&query, "endDate"),
        ),
        ("GET", ["reports", "item-profit"]) => {
            catalog::item_profit_report(&mut ctx, q(&query, "storeId"))
        }

        _ => err(404, "Not found"),
    };

    enqueue_outbox(&mut ctx, &method, &req.path, &segs, &req.body, &resp);
    resp
}

/// Operations that must never be replicated to the cloud: session/auth calls,
/// local-only actions (system reset, store switching), the AI parse call
/// (its result `menu/bulk` is synced instead), and probes.
fn is_sync_exempt(segs: &[&str]) -> bool {
    matches!(
        segs,
        ["auth", ..]
            | ["sync", ..]
            | ["stores", "switch"]
            | ["system", "reset"]
            | ["menu", "parse"]
            | ["menu", "bulk"]
            | ["lan-info"]
            | ["health"]
    )
}

/// Insert a mutation into the sync outbox directly — used by composite
/// operations (e.g. bulk menu import) that expand one API call into several
/// canonical CRUD events so the cloud replays them convergently.
pub fn queue_sync_event(
    conn: &Connection,
    method: &str,
    path: &str,
    body: &Value,
    store_id: &str,
) {
    let _ = conn.execute(
        "INSERT INTO sync_outbox (event_id, method, path, body, store_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![uuid(), method, path, body.to_string(), store_id, now_ts()],
    );
}

/// Record a successful local mutation in the sync outbox so the background
/// worker can replay it against the cloud backend. The response's `id` is
/// merged into the stored request body for creates so the cloud assigns the
/// same primary key (idempotent, convergent replay).
fn enqueue_outbox(
    ctx: &mut Ctx,
    method: &str,
    full_path: &str,
    segs: &[&str],
    req_body: &Option<Value>,
    resp: &ApiResponse,
) {
    if ctx.suppress_outbox
        || !matches!(method, "POST" | "PUT" | "PATCH" | "DELETE")
        || !(200..300).contains(&resp.status)
        || is_sync_exempt(segs)
    {
        return;
    }

    let mut stored_body = req_body.clone().unwrap_or(Value::Null);
    if let (Value::Object(b), Some(id)) = (&mut stored_body, resp.body.get("id")) {
        if b.get("id").is_none() {
            b.insert("id".to_string(), id.clone());
        }
    }

    let store_id = stored_body
        .get("storeId")
        .or_else(|| stored_body.get("store_id"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| ctx.claims.as_ref().map(|c| c.store_id.clone()))
        .unwrap_or_default();

    let _ = ctx.conn.execute(
        "INSERT INTO sync_outbox (event_id, method, path, body, store_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            uuid(),
            method,
            full_path,
            if stored_body.is_null() {
                None
            } else {
                Some(stored_body.to_string())
            },
            store_id,
            now_ts(),
        ],
    );
    // Kick the sync worker so the push happens promptly when online.
    if let Some(kick) = ctx.outbox_kick {
        kick();
    }
}
