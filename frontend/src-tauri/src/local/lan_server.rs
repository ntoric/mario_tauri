//! Embedded LAN HTTP/WebSocket server.
//!
//! Exposes the local backend (the same `dispatch_impl` used by the Tauri
//! `api_request` command) over the local network so mobile apps on the same
//! Wi-Fi/LAN can talk directly to this machine — no internet required.
//!
//! - `ANY /api/*`            → forwarded to `api::dispatch_impl`
//! - `GET /api/ws/tables-status` → websocket stream of table_status_update
//! - UDP :48484              → discovery responder ("MARIO_DISCOVER" probe)

use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{any, get},
    Json, Router,
};
use serde_json::{json, Value};
use tauri::AppHandle;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;

use super::api::{self, ApiRequest};
use super::LocalBackend;

pub const DISCOVERY_PORT: u16 = 48484;
pub const DISCOVERY_PROBE: &[u8] = b"MARIO_DISCOVER";

/// Broadcast fan-out: forwards table-status changes to the desktop UI event
/// channel and LAN websocket subscribers.
pub type BroadcastFn = Arc<dyn Fn(&str, &str) + Send + Sync>;

#[derive(Clone)]
struct LanState {
    backend: Arc<LocalBackend>,
    broadcast: BroadcastFn,
}

/// Port the LAN API server binds to (default 8088, override via MARIO_LAN_PORT).
pub fn lan_port() -> u16 {
    std::env::var("MARIO_LAN_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8088)
}

/// Best-effort primary LAN IP of this machine (UDP route lookup, no packets sent).
pub fn local_ip() -> Option<String> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    // Route-table lookup only; nothing is transmitted.
    sock.connect("8.8.8.8:80").ok()?;
    let ip = sock.local_addr().ok()?.ip().to_string();
    if ip.is_empty() {
        None
    } else {
        Some(ip)
    }
}

pub fn lan_api_url() -> String {
    format!(
        "http://{}:{}/api",
        local_ip().unwrap_or_else(|| "127.0.0.1".to_string()),
        lan_port()
    )
}

/// Run the LAN HTTP+WS server. Spawns onto the Tauri async runtime.
/// Returns immediately if binding fails (e.g. port already in use) — the
/// desktop app keeps working regardless.
pub async fn serve(backend: Arc<LocalBackend>, app: AppHandle) {
    let port = lan_port();
    let broadcast: BroadcastFn = {
        let backend = backend.clone();
        Arc::new(move |sid: &str, reason: &str| {
            api::notify(&app, &backend, sid, reason);
        })
    };
    let router = build_router(backend, broadcast);

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[lan] Failed to bind port {}: {}", port, e);
            return;
        }
    };

    println!("[lan] API server listening on http://0.0.0.0:{}/api", port);
    if let Err(e) = axum::serve(listener, router).await {
        eprintln!("[lan] server error: {}", e);
    }
}

/// Build the LAN router — split out so tests can drive it over real HTTP.
pub(crate) fn build_router(backend: Arc<LocalBackend>, broadcast: BroadcastFn) -> Router {
    Router::new()
        .route("/api/ws/tables-status", get(ws_tables_status))
        .route("/api/{*path}", any(http_bridge))
        .route("/api", any(http_bridge))
        .route("/", any(http_bridge))
        .layer(CorsLayer::permissive())
        .with_state(LanState { backend, broadcast })
}

/// UDP discovery responder: mobile apps broadcast "MARIO_DISCOVER" on the LAN
/// and this answers with the API port and serverId so they can connect
/// without typing IPs — and recognize the same host across IP changes.
pub fn start_discovery_responder(server_id: String) {
    let port = lan_port();
    std::thread::spawn(move || {
        let sock = match UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[lan] discovery responder bind failed: {}", e);
                return;
            }
        };
        println!("[lan] discovery responder on udp/{}", DISCOVERY_PORT);
        let mut buf = [0u8; 2048];
        loop {
            match sock.recv_from(&mut buf) {
                Ok((n, src)) => {
                    if &buf[..n] == DISCOVERY_PROBE {
                        let reply = format!(
                            "{{\"type\":\"mario_pos\",\"name\":\"Mario POS\",\"serverId\":\"{}\",\"port\":{}}}",
                            server_id, port
                        );
                        let _ = sock.send_to(reply.as_bytes(), src);
                    }
                }
                Err(e) => {
                    eprintln!("[lan] discovery recv error: {}", e);
                }
            }
        }
    });
}

/// Bridge HTTP requests into the same dispatch pipeline used by the desktop app.
async fn http_bridge(
    State(s): State<LanState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let pq = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");
    let path = match pq.strip_prefix("/api") {
        Some(rest) if rest.is_empty() => "/",
        Some(rest) => rest,
        None => pq,
    };

    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.to_string());

    let body = if body.is_empty() {
        None
    } else {
        serde_json::from_slice::<Value>(&body).ok()
    };

    let resp = api::dispatch_impl(
        &s.backend,
        ApiRequest {
            method: method.to_string(),
            path: path.to_string(),
            body,
            token,
        },
        &*s.broadcast,
    )
    .await;

    (
        StatusCode::from_u16(resp.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        Json(resp.body),
    )
        .into_response()
}

/// GET /api/ws/tables-status?storeId&token — mirrors the Go WS endpoint.
async fn ws_tables_status(
    State(s): State<LanState>,
    ws: WebSocketUpgrade,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let token = q.get("token").cloned();
    match api::require_claims(&s.backend, &token) {
        Ok(_) => ws
            .on_upgrade(move |sock| ws_loop(sock, s.backend.lan_tx.subscribe())),
        Err(r) => (
            StatusCode::from_u16(r.status).unwrap_or(StatusCode::UNAUTHORIZED),
            Json(r.body),
        )
            .into_response(),
    }
}

/// Forward every table_status_update broadcast to the websocket client.
/// (Mirrors Go's BroadcastAll — the client filters by storeId itself.)
async fn ws_loop(mut sock: WebSocket, mut rx: broadcast::Receiver<Value>) {
    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(v) => {
                        if sock.send(Message::Text(v.to_string().into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            incoming = sock.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => continue,
                    Some(Err(_)) => break,
                }
            }
        }
    }
}

/// Human-readable info for the desktop UI ("Mobile devices connect to …").
pub fn server_info(state: &LocalBackend) -> Value {
    json!({
        "ip": local_ip(),
        "port": lan_port(),
        "url": lan_api_url(),
        "serverId": state.lan_server_id,
        "discoveryPort": DISCOVERY_PORT,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_db() -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let p = std::env::temp_dir().join(format!(
            "mario_lan_test_{}_{}.db",
            std::process::id(),
            n
        ));
        let _ = std::fs::remove_file(&p);
        p
    }

    /// Point the cloud URL at an unroutable address so logins take the
    /// offline local-auth path.
    fn force_offline_cloud(be: &LocalBackend) {
        let conn = be.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO global_settings (key, value) VALUES ('cloud_base_url', 'local')
             ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            [],
        )
        .unwrap();
    }

    /// Boots the real axum router on an ephemeral port and exercises the
    /// mobile app's request flow over actual HTTP.
    #[tokio::test]
    async fn serves_mobile_api_over_http() {
        let backend = Arc::new(LocalBackend::new(&temp_db()).unwrap());
        force_offline_cloud(&backend);
        let events = Arc::new(std::sync::Mutex::new(Vec::<(String, String)>::new()));
        let broadcast: BroadcastFn = {
            let events = events.clone();
            Arc::new(move |sid: &str, r: &str| {
                events.lock().unwrap().push((sid.to_string(), r.to_string()));
            })
        };

        let router = build_router(backend.clone(), broadcast);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { let _ = axum::serve(listener, router).await; });
        let base = format!("http://127.0.0.1:{}/api", port);
        let client = reqwest::Client::new();

        // Health check (what the mobile app pings on connect).
        let r = client.get(format!("{}/health", base)).send().await.unwrap();
        assert_eq!(r.status(), 200);

        // Unauthenticated → 401.
        let r = client
            .get(format!("{}/users", base))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 401);

        // Login over HTTP.
        let r = client
            .post(format!("{}/auth/login", base))
            .json(&json!({"username": "superadmin", "password": "superadmin123"}))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 200);
        let v: Value = r.json().await.unwrap();
        let token = v["token"].as_str().unwrap().to_string();

        // Query-string passthrough.
        let r = client
            .get(format!("{}/tables?storeId=1", base))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 200);

        // POST a table — the broadcast closure (LAN + desktop fan-out) fires.
        let r = client
            .post(format!("{}/tables", base))
            .bearer_auth(&token)
            .json(&json!({"number": 9, "seats": 2, "storeId": "1"}))
            .send()
            .await
            .unwrap();
        assert!(r.status() == 200 || r.status() == 201);
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|(sid, reason)| sid == "1" && reason == "table_created"));

        // /api root also routes.
        let r = client
            .get(format!("{}/support-config", base))
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 200);
    }

    /// The WS endpoint rejects unauthenticated connections and streams
    /// table_status_update payloads to authenticated clients.
    #[tokio::test]
    async fn websocket_streams_table_status() {
        let backend = Arc::new(LocalBackend::new(&temp_db()).unwrap());
        force_offline_cloud(&backend);
        // Reuse the backend's lan_tx so notify-style messages reach subscribers.
        let broadcast: BroadcastFn = {
            let be = backend.clone();
            Arc::new(move |sid: &str, r: &str| {
                let _ = be.lan_tx.send(json!({
                    "type": "table_status_update",
                    "storeId": sid,
                    "reason": r,
                }));
            })
        };
        let router = build_router(backend.clone(), broadcast.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { let _ = axum::serve(listener, router).await; });

        // Get a token via HTTP.
        let client = reqwest::Client::new();
        let r = client
            .post(format!("http://127.0.0.1:{}/api/auth/login", port))
            .json(&json!({"username": "superadmin", "password": "superadmin123"}))
            .send()
            .await
            .unwrap();
        let v: Value = r.json().await.unwrap();
        let token = v["token"].as_str().unwrap().to_string();

        // WS without token → handshake rejected.
        let bad = tokio_tungstenite::connect_async(format!(
            "ws://127.0.0.1:{}/api/ws/tables-status?storeId=1&token=nope",
            port
        ))
        .await;
        assert!(bad.is_err());

        // WS with token → receives broadcasts.
        let (mut ws, _) = tokio_tungstenite::connect_async(format!(
            "ws://127.0.0.1:{}/api/ws/tables-status?storeId=1&token={}",
            port, token
        ))
        .await
        .expect("ws connect failed");

        // Give the server a moment to register the subscriber.
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        (broadcast)("1", "order_created");

        use futures_util::StreamExt;
        let msg = tokio::time::timeout(std::time::Duration::from_secs(5), ws.next())
            .await
            .expect("no ws message")
            .expect("stream ended")
            .expect("ws error");
        let text = msg.into_text().unwrap();
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["type"], "table_status_update");
        assert_eq!(v["storeId"], "1");
        assert_eq!(v["reason"], "order_created");
    }
}
