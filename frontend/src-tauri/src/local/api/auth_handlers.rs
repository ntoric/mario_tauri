use rusqlite::OptionalExtension;
use serde_json::{json, Value};

use super::rows;
use super::{err, ok, ApiResponse, Ctx};
use crate::local::auth::{self, new_claims};
use crate::local::sync::{self, CloudLogin};
use crate::local::LocalBackend;

struct FullUser {
    id: String,
    username: String,
    password: String,
    name: String,
    email: String,
    role: String,
    store_id: String,
    is_active: bool,
    store_name: String,
}

fn fetch_user(
    conn: &rusqlite::Connection,
    where_clause: &str,
    param: &str,
) -> Result<Option<FullUser>, rusqlite::Error> {
    let sql = format!(
        "SELECT u.id, u.username, u.password, u.name, u.email, u.role, u.store_id, u.is_active, u.created_at,
                COALESCE(s.name, '') as store_name
         FROM users u LEFT JOIN stores s ON u.store_id = s.id
         WHERE {}",
        where_clause
    );
    conn.query_row(&sql, [param], |r| {
        Ok(FullUser {
            id: r.get(0)?,
            username: r.get(1)?,
            password: r.get(2)?,
            name: r.get(3)?,
            email: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
            role: r.get(5)?,
            store_id: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
            is_active: r.get::<_, i64>(7).map(|v| v != 0)?,
            store_name: r.get::<_, String>(9).unwrap_or_default(),
        })
    })
    .optional()
}

fn stores_for_user(conn: &rusqlite::Connection, u: &FullUser) -> Result<Vec<Value>, rusqlite::Error> {
    match u.role.as_str() {
        "superadmin" => rows::stores_for_role(conn, "superadmin", "", ""),
        "business_owner" => rows::user_stores(conn, &u.id),
        _ => {
            if !u.store_id.is_empty() {
                match rows::get_store(conn, &u.store_id)? {
                    Some(s) => Ok(vec![s]),
                    None => Ok(vec![]),
                }
            } else {
                Ok(vec![])
            }
        }
    }
}

fn user_summary(u: &FullUser, stores: Vec<Value>) -> Value {
    json!({
        "id": u.id,
        "username": u.username,
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "storeId": u.store_id,
        "storeName": u.store_name,
        "stores": stores,
        "isActive": u.is_active,
    })
}

/// Cloud-first login: authenticate against the remote backend when it is
/// reachable, cache the cloud session for the sync worker, upsert the user
/// (with a local password hash for offline re-login) and their stores, then
/// issue a local JWT. Falls back to local credentials when offline so the
/// app keeps working without a network.
pub async fn login_cloud_first(state: &LocalBackend, body: Value) -> ApiResponse {
    let username = body["username"].as_str().unwrap_or("").to_string();
    let password = body["password"].as_str().unwrap_or("").to_string();

    match sync::cloud_login(state, &username, &password).await {
        CloudLogin::Success { token, user } => {
            {
                let conn = state.conn.lock().unwrap();
                sync::cache_cloud_session(&conn, &username, &password, &token, &user);
            }
            // Refresh menu/tables/orders/etc from cloud now that we know the
            // store, and kick the background worker.
            let _ = sync::pull_snapshot(state).await;
            state.sync_notify.notify_one();

            let claims = new_claims(
                user["id"].as_str().unwrap_or(""),
                user["username"].as_str().unwrap_or(&username),
                user["role"].as_str().unwrap_or("staff"),
                user["storeId"].as_str().unwrap_or(""),
            );
            let local_token = match auth::generate_token(&claims, &state.jwt_secret) {
                Ok(t) => t,
                Err(e) => return err(500, format!("Failed to generate token: {}", e)),
            };
            return ok(json!({ "token": local_token, "user": user }));
        }
        // Cloud is authoritative: an explicit rejection means the login
        // fails — no silent fallback to local accounts.
        CloudLogin::Invalid(msg) => return err(401, msg),
        CloudLogin::Offline => {
            // Internet is mandatory for login. The only exception is an
            // explicit local-only deployment (cloud_base_url = "local").
            let conn = state.conn.lock().unwrap();
            if !sync::local_only_mode(&conn) {
                return err(
                    503,
                    "Cannot reach the cloud server. An internet connection is required to sign in.",
                );
            }
            return local_login(&conn, &state.jwt_secret, &username, &password);
        }
    }
}

fn local_login(
    conn: &rusqlite::Connection,
    secret: &str,
    username: &str,
    password: &str,
) -> ApiResponse {

    let user = match fetch_user(conn, "u.username = ?1 AND u.is_active = 1", username) {
        Ok(Some(u)) => u,
        Ok(None) => return err(401, "Invalid credentials"),
        Err(e) => return err(500, e.to_string()),
    };

    if !auth::verify_password(&user.password, password) {
        return err(401, "Invalid credentials");
    }

    let stores = match stores_for_user(conn, &user) {
        Ok(s) => s,
        Err(e) => return err(500, format!("Failed to load user stores: {}", e)),
    };

    let claims = new_claims(&user.id, &user.username, &user.role, &user.store_id);
    let token = match auth::generate_token(&claims, secret) {
        Ok(t) => t,
        Err(e) => return err(500, format!("Failed to generate token: {}", e)),
    };

    ok(json!({
        "token": token,
        "user": user_summary(&user, stores),
    }))
}

pub fn login(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let username = body["username"].as_str().unwrap_or("");
    let password = body["password"].as_str().unwrap_or("");
    local_login(&ctx.conn, ctx.jwt_secret(), username, password)
}

/// Manual logout ends the cloud sync session: the cached cloud credentials
/// and token are wiped so the background worker stops pushing/pulling. Local
/// user rows are kept so the next login can still authenticate offline.
pub fn logout(ctx: &mut Ctx) -> ApiResponse {
    for key in ["cloud_token", "cloud_username", "cloud_password"] {
        let _ = ctx.conn.execute(
            "DELETE FROM global_settings WHERE key = ?1",
            [key],
        );
    }
    ok(json!({ "message": "Logged out" }))
}

pub fn me(ctx: &mut Ctx) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let conn = &ctx.conn;

    let user = match fetch_user(conn, "u.id = ?1", &claims.id) {
        Ok(Some(u)) => u,
        Ok(None) => return err(404, "User not found"),
        Err(e) => return err(500, e.to_string()),
    };

    let stores = match stores_for_user(conn, &user) {
        Ok(s) => s,
        Err(e) => return err(500, format!("Failed to load user stores: {}", e)),
    };

    ok(user_summary(&user, stores))
}
