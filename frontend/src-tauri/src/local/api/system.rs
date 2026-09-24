use rusqlite::OptionalExtension;
use serde_json::{json, Value};

use super::{err, ok, ApiResponse, Ctx};
use crate::local::auth::Claims;
use crate::local::LocalBackend;

fn superadmin(ctx: &mut Ctx) -> Result<Claims, ApiResponse> {
    let claims = ctx.claims()?.clone();
    if claims.role != "superadmin" {
        return Err(err(403, "Access denied. Superadmin role required."));
    }
    Ok(claims)
}

/// POST /api/system/reset (superadmin)
pub fn system_reset(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    if claims.role != "superadmin" {
        return err(403, "Only superadmin can perform system reset");
    }

    let p = |k: &str| body[k].as_bool().unwrap_or(false);
    let (p_users, p_stores, p_cats, p_items, p_orders, p_tables, p_bills) = (
        p("users"),
        p("stores"),
        p("categories"),
        p("items"),
        p("orders"),
        p("tables"),
        p("bills"),
    );

    let mut results = serde_json::Map::new();
    let count = |tx: &rusqlite::Transaction, table: &str| -> i64 {
        tx.query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |r| r.get(0))
            .unwrap_or(0)
    };

    let tx = match ctx.conn.transaction() {
        Ok(t) => t,
        Err(e) => return err(500, e.to_string()),
    };

    macro_rules! run {
        ($sql:expr) => {
            if let Err(e) = tx.execute($sql, []) {
                return err(500, e.to_string());
            }
        };
    }

    if p_bills {
        run!("DELETE FROM bills");
        let c = count(&tx, "bills");
        results.insert("bills".into(), json!({"success": true, "remaining": c}));
    }
    if p_orders {
        run!("DELETE FROM order_items");
        run!("DELETE FROM orders");
        let c = count(&tx, "orders");
        results.insert("orders".into(), json!({"success": true, "remaining": c}));
    }
    if p_tables {
        run!("DELETE FROM tables");
        let c = count(&tx, "tables");
        results.insert("tables".into(), json!({"success": true, "remaining": c}));
    }
    if p_items {
        let _ = tx.execute("DELETE FROM item_expenses", []);
        run!("DELETE FROM items");
        let c = count(&tx, "items");
        results.insert("items".into(), json!({"success": true, "remaining": c}));
    }
    if p_cats {
        run!("DELETE FROM categories");
        let c = count(&tx, "categories");
        results.insert("categories".into(), json!({"success": true, "remaining": c}));
    }
    if p_stores {
        if !p_bills {
            let _ = tx.execute("DELETE FROM bills", []);
        }
        if !p_orders {
            let _ = tx.execute("DELETE FROM order_items", []);
            let _ = tx.execute("DELETE FROM orders", []);
        }
        if !p_tables {
            let _ = tx.execute("DELETE FROM tables", []);
        }
        if !p_items {
            let _ = tx.execute("DELETE FROM items", []);
        }
        if !p_cats {
            let _ = tx.execute("DELETE FROM categories", []);
        }
        run!("UPDATE users SET store_id = NULL WHERE role IN ('business_admin', 'staff')");
        run!("DELETE FROM user_stores");
        run!("DELETE FROM stores");
        let c = count(&tx, "stores");
        results.insert("stores".into(), json!({"success": true, "remaining": c}));
    }
    if p_users {
        run!("DELETE FROM users WHERE role != 'superadmin'");
        if !p_stores {
            let _ = tx.execute("DELETE FROM user_stores", []);
        }
        let c = count(&tx, "users");
        results.insert("users".into(), json!({"success": true, "remaining": c}));
    }

    if let Err(e) = tx.commit() {
        return err(500, e.to_string());
    }

    ok(json!({
        "message": "System reset completed successfully",
        "resetResults": Value::Object(results),
    }))
}

/// GET /api/system/stats
pub fn get_stats(ctx: &mut Ctx) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    if !["superadmin", "business_owner", "business_admin"].contains(&claims.role.as_str()) {
        return err(403, "Access denied");
    }

    let mut stats = serde_json::Map::new();
    for t in ["users", "stores", "categories", "items", "orders", "tables", "bills"] {
        let c: i64 = ctx
            .conn
            .query_row(&format!("SELECT COUNT(*) FROM {}", t), [], |r| r.get(0))
            .unwrap_or(0);
        stats.insert(t.to_string(), json!(c));
    }
    ok(Value::Object(stats))
}

/// GET /api/system/config (superadmin)
pub fn get_system_config(ctx: &mut Ctx) -> ApiResponse {
    if let Err(r) = superadmin(ctx) {
        return r;
    }

    let mut settings = std::collections::HashMap::new();
    if let Ok(mut stmt) = ctx.conn.prepare("SELECT key, value FROM global_settings") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        }) {
            for row in rows.flatten() {
                settings.insert(row.0, row.1);
            }
        }
    }

    let enabled = settings.get("cleanup_enabled").map(|s| s.as_str()) == Some("true");
    let interval: i64 = settings
        .get("cleanup_interval_mins")
        .and_then(|s| s.parse().ok())
        .filter(|v: &i64| *v > 0)
        .unwrap_or(60);
    let last_run = settings
        .get("cleanup_last_run")
        .filter(|s| !s.is_empty())
        .cloned();

    ok(json!({
        "cleanupEnabled": enabled,
        "cleanupIntervalMins": interval,
        "cleanupLastRun": last_run,
    }))
}

/// POST /api/system/config (superadmin)
pub fn update_system_config(ctx: &mut Ctx, body: Value) -> ApiResponse {
    if let Err(r) = superadmin(ctx) {
        return r;
    }
    let enabled = body["cleanupEnabled"].as_bool().unwrap_or(false);
    let interval = body["cleanupIntervalMins"].as_i64().unwrap_or(0);
    if interval <= 0 {
        return err(400, "cleanupIntervalMins must be a positive integer greater than 0");
    }

    let res = ctx.conn.execute_batch(&format!(
        "INSERT INTO global_settings (key, value) VALUES ('cleanup_enabled', '{}')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value;
         INSERT INTO global_settings (key, value) VALUES ('cleanup_interval_mins', '{}')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value;",
        if enabled { "true" } else { "false" },
        interval
    ));
    match res {
        Ok(_) => ok(json!({
            "message": "System configuration updated successfully",
            "config": {
                "cleanupEnabled": enabled,
                "cleanupIntervalMins": interval,
            },
        })),
        Err(e) => err(500, e.to_string()),
    }
}

// ==========================================
// APP UPDATES
// ==========================================

fn app_update_json(r: &rusqlite::Row) -> Result<Value, rusqlite::Error> {
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "platform": r.get::<_, String>(1)?,
        "enabled": r.get::<_, i64>(2).map(|v| v != 0)?,
        "version": r.get::<_, String>(3)?,
        "downloadUrl": r.get::<_, String>(4)?,
        "releaseNotes": r.get::<_, Option<String>>(5)?,
        "createdAt": r.get::<_, Option<String>>(6)?.unwrap_or_default(),
        "updatedAt": r.get::<_, Option<String>>(7)?,
    }))
}

/// GET /api/app-update?platform= (public)
pub fn get_app_update(ctx: &mut Ctx, platform: &str) -> ApiResponse {
    let platform = if platform.is_empty() { "mobile" } else { platform };
    let row = ctx
        .conn
        .query_row(
            "SELECT id, platform, enabled, version, download_url, release_notes, created_at, updated_at
             FROM app_updates WHERE platform = ?1",
            [platform],
            |r| app_update_json(r),
        )
        .optional();
    match row {
        Ok(Some(u)) => ok(u),
        Ok(None) => ok(json!({ "enabled": false })),
        Err(e) => err(500, e.to_string()),
    }
}

/// GET /api/app-updates (public)
pub fn get_all_app_updates(ctx: &mut Ctx) -> ApiResponse {
    let mut stmt = match ctx.conn.prepare(
        "SELECT id, platform, enabled, version, download_url, release_notes, created_at, updated_at
         FROM app_updates ORDER BY platform",
    ) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let updates: Vec<Value> = match stmt.query_map([], |r| app_update_json(r)) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    ok(json!({ "updates": updates }))
}

/// POST /api/app-update (superadmin)
pub fn update_app_update(ctx: &mut Ctx, body: Value) -> ApiResponse {
    if let Err(r) = superadmin(ctx) {
        return r;
    }
    let platform = body["platform"].as_str().unwrap_or("");
    if platform.is_empty() {
        return err(400, "Platform is required (mobile or desktop)");
    }
    if platform != "mobile" && platform != "desktop" {
        return err(400, "Platform must be either 'mobile' or 'desktop'");
    }
    let version = body["version"].as_str().unwrap_or("");
    if version.is_empty() {
        return err(400, "Version is required");
    }
    let download_url = body["downloadUrl"].as_str().unwrap_or("");
    if download_url.is_empty() {
        return err(400, "Download URL is required");
    }
    let enabled = body["enabled"].as_bool().unwrap_or(false) as i64;
    let notes: Option<String> = body["releaseNotes"]
        .as_str()
        .map(String::from);

    // Upsert (mirrors CreateOrUpdate).
    let existing: Option<String> = ctx
        .conn
        .query_row(
            "SELECT id FROM app_updates WHERE platform = ?1",
            [platform],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten();

    let id = if let Some(existing_id) = existing {
        if let Err(e) = ctx.conn.execute(
            "UPDATE app_updates SET enabled = ?1, version = ?2, download_url = ?3, release_notes = ?4, updated_at = ?5 WHERE id = ?6",
            rusqlite::params![enabled, version, download_url, notes, super::now_ts(), existing_id],
        ) {
            return err(500, e.to_string());
        }
        existing_id
    } else {
        let new_id = format!("{}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default());
        if let Err(e) = ctx.conn.execute(
            "INSERT INTO app_updates (id, platform, enabled, version, download_url, release_notes)
             VALUES (?1,?2,?3,?4,?5,?6)",
            rusqlite::params![new_id, platform, enabled, version, download_url, notes],
        ) {
            return err(500, e.to_string());
        }
        new_id
    };

    ok(json!({
        "message": "App update configuration updated successfully",
        "update": {
            "id": id,
            "platform": platform,
            "enabled": body["enabled"].as_bool().unwrap_or(false),
            "version": version,
            "downloadUrl": download_url,
            "releaseNotes": body["releaseNotes"].as_str().unwrap_or(""),
        },
    }))
}

// ==========================================
// SUPPORT CONFIG
// ==========================================

/// GET /api/support-config (public)
pub fn get_support_config(ctx: &mut Ctx) -> ApiResponse {
    let mut cfg = json!({ "email": "", "phone": "", "whatsappLink": "" });
    if let Ok(mut stmt) = ctx.conn.prepare(
        "SELECT key, value FROM global_settings WHERE key IN ('support_email', 'support_phone', 'support_whatsapp_link')",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        }) {
            for (k, v) in rows.flatten() {
                match k.as_str() {
                    "support_email" => cfg["email"] = json!(v),
                    "support_phone" => cfg["phone"] = json!(v),
                    "support_whatsapp_link" => cfg["whatsappLink"] = json!(v),
                    _ => {}
                }
            }
        }
    }
    ok(cfg)
}

/// POST /api/support-config (superadmin)
pub fn update_support_config(ctx: &mut Ctx, body: Value) -> ApiResponse {
    if let Err(r) = superadmin(ctx) {
        return r;
    }
    let email = body["email"].as_str().unwrap_or("");
    let phone = body["phone"].as_str().unwrap_or("");
    let whatsapp = body["whatsappLink"].as_str().unwrap_or("");

    for (k, v) in [
        ("support_email", email),
        ("support_phone", phone),
        ("support_whatsapp_link", whatsapp),
    ] {
        if let Err(e) = ctx.conn.execute(
            "INSERT INTO global_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            rusqlite::params![k, v],
        ) {
            return err(500, e.to_string());
        }
    }

    ok(json!({
        "message": "Support configuration updated successfully",
        "config": {
            "email": email,
            "phone": phone,
            "whatsappLink": whatsapp,
        },
    }))
}

// ==========================================
// UPDATE REPO CONFIG
// ==========================================

/// GET /api/system/update-config (superadmin)
pub fn get_update_repo_config(ctx: &mut Ctx) -> ApiResponse {
    if let Err(r) = superadmin(ctx) {
        return r;
    }
    let repo: String = ctx
        .conn
        .query_row(
            "SELECT value FROM global_settings WHERE key = 'update_github_repo'",
            [],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default();
    ok(json!({ "githubRepo": repo }))
}

/// POST /api/system/update-config (superadmin)
pub fn update_update_repo_config(ctx: &mut Ctx, body: Value) -> ApiResponse {
    if let Err(r) = superadmin(ctx) {
        return r;
    }
    let repo = body["githubRepo"].as_str().unwrap_or("").trim().to_string();
    if repo.is_empty() {
        return err(400, "githubRepo is required");
    }
    if repo.matches('/').count() != 1 || repo.starts_with('/') || repo.ends_with('/') {
        return err(400, "githubRepo must be in 'owner/repo' format (e.g. ntoric/mario_tauri)");
    }
    match ctx.conn.execute(
        "INSERT INTO global_settings (key, value) VALUES ('update_github_repo', ?1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ?2",
        rusqlite::params![repo, super::now_ts()],
    ) {
        Ok(_) => ok(json!({
            "message": "Update repository configuration saved successfully",
            "config": { "githubRepo": repo },
        })),
        Err(e) => err(500, e.to_string()),
    }
}

/// GET /api/update/manifest (public) — proxies the GitHub latest.json manifest.
/// This is the only network-dependent endpoint; requires connectivity.
pub async fn update_manifest(
    state: &LocalBackend,
    _claims: Option<Claims>,
) -> ApiResponse {
    let repo: String = {
        let conn = state.conn.lock().unwrap();
        conn.query_row(
            "SELECT value FROM global_settings WHERE key = 'update_github_repo'",
            [],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default()
    };
    if repo.is_empty() {
        return err(404, "Update repository is not configured");
    }

    let url = format!(
        "https://github.com/{}/releases/latest/download/latest.json",
        repo
    );
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
    {
        Ok(c) => c,
        Err(_) => return err(500, "Failed to create manifest request"),
    };

    let resp = match client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return err(502, "Failed to fetch update manifest from GitHub"),
    };

    let status = resp.status().as_u16();
    if status == 404 {
        return err(404, "No update manifest found for the configured repository");
    }
    if status != 200 {
        return err(502, format!("GitHub returned non-200 status: {}", status));
    }

    match resp.json::<Value>().await {
        Ok(v) => ok(v),
        Err(e) => err(502, format!("Failed to parse manifest: {}", e)),
    }
}
