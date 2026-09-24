use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;

use super::db::now_ts;
use super::LocalBackend;

/// Spawn the periodic cleanup worker (mirrors the Go 1-minute ticker).
/// Deletes orders, order items, bills, and bill_queue rows when enabled and due.
pub fn start_cleanup_worker(state: Arc<LocalBackend>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60));
        run_cleanup(&state);
    });
}

/// Spawn the bill-queue worker (mirrors the Go 2-second ticker).
/// Expires stale pending requests and finalizes items the frontend has
/// popped for printing by creating the bill and completing the order.
pub fn start_bill_queue_worker(state: Arc<LocalBackend>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(2));
        process_bill_queue(&state);
    });
}

fn run_cleanup(state: &LocalBackend) {
    let conn = match state.conn.lock() {
        Ok(c) => c,
        Err(_) => return,
    };
    let mut conn = conn;

    // 1. Read global settings
    let mut settings = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare("SELECT key, value FROM global_settings") {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        }) {
            for row in rows.flatten() {
                settings.insert(row.0, row.1);
            }
        }
    }

    if settings.get("cleanup_enabled").map(|s| s.as_str()) != Some("true") {
        return;
    }
    let interval_mins: i64 = settings
        .get("cleanup_interval_mins")
        .and_then(|s| s.parse().ok())
        .filter(|v: &i64| *v > 0)
        .unwrap_or(60);

    let now = chrono::Utc::now();
    let last_run = settings
        .get("cleanup_last_run")
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&chrono::Utc));

    // If no last-run timestamp, initialize it and return (mirrors Go).
    let last_run = match last_run {
        Some(t) => t,
        None => {
            let _ = conn.execute(
                "INSERT INTO global_settings (key, value) VALUES ('cleanup_last_run', ?1)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                [now.to_rfc3339()],
            );
            return;
        }
    };

    let next_run = last_run + chrono::Duration::minutes(interval_mins);
    if now < next_run {
        return;
    }

    // 2. Delete referencing rows first to avoid FK violations.
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(_) => return,
    };
    let ok = ["DELETE FROM bills", "DELETE FROM bill_queue", "DELETE FROM order_items", "DELETE FROM orders"]
        .iter()
        .all(|q| tx.execute(q, []).is_ok());
    if !ok {
        return;
    }
    if tx.commit().is_err() {
        return;
    }

    // 3. Persist last-run timestamp.
    let _ = conn.execute(
        "INSERT INTO global_settings (key, value) VALUES ('cleanup_last_run', ?1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [now.to_rfc3339()],
    );
}

fn process_bill_queue(state: &LocalBackend) {
    let conn = match state.conn.lock() {
        Ok(c) => c,
        Err(_) => return,
    };

    // 1. Expire pending requests older than 1 minute.
    let threshold = (chrono::Utc::now() - chrono::Duration::minutes(1)).to_rfc3339();
    let _ = conn.execute(
        "UPDATE bill_queue SET status = 'failed', error_message = 'Rejected: Request expired (older than 1 minute)', updated_at = ?1
         WHERE status = 'pending' AND created_at < ?2",
        rusqlite::params![now_ts(), threshold],
    );

    // 2. Finalize items the frontend popped for printing ('processing'):
    //    create the bill and complete the order in one transaction.
    let items: Vec<(String, String, String, String)> = {
        let mut stmt = match conn.prepare(
            "SELECT id, store_id, order_id, bill_data FROM bill_queue WHERE status = 'processing' ORDER BY created_at ASC LIMIT 20",
        ) {
            Ok(s) => s,
            Err(_) => return,
        };
        let mapped = match stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        }) {
            Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
            Err(_) => return,
        };
        mapped
    };

    for (id, store_id, order_id, bill_data_raw) in items {
        let data: Value = match serde_json::from_str(&bill_data_raw) {
            Ok(v) => v,
            Err(e) => {
                mark_failed(&conn, &id, &format!("JSON parse failure: {}", e));
                continue;
            }
        };

        if let Err(e) = conn.execute_batch("BEGIN IMMEDIATE") {
            mark_failed(&conn, &id, &format!("Transaction creation failed: {}", e));
            continue;
        }

        let result = (|| -> Result<(), String> {
            let bill_id = format!("{}-bill", order_id);
            let opt = |k: &str| -> Option<String> {
                data[k].as_str().filter(|s| !s.is_empty()).map(String::from)
            };
            conn.execute(
                "INSERT INTO bills (id, store_id, order_id, table_number, invoice_no, subtotal, tax_total, discount, total, payment_method, customer_name, generated_by)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                rusqlite::params![
                    bill_id, store_id, order_id,
                    data["tableNumber"].as_i64().unwrap_or(0),
                    data["invoiceNo"].as_str().unwrap_or(""),
                    data["subtotal"].as_f64().unwrap_or(0.0),
                    data["taxTotal"].as_f64().unwrap_or(0.0),
                    data["discount"].as_f64().unwrap_or(0.0),
                    data["total"].as_f64().unwrap_or(0.0),
                    opt("paymentMethod"),
                    opt("customerName"),
                    opt("generatedBy"),
                ],
            )
            .map_err(|e| format!("Bill DB insert failed: {}", e))?;

            conn.execute(
                "UPDATE orders SET status = 'completed', payment_method = ?1, payment_status = 'paid', updated_at = ?2 WHERE id = ?3",
                rusqlite::params![
                    data["paymentMethod"].as_str().unwrap_or(""),
                    now_ts(),
                    order_id,
                ],
            )
            .map_err(|e| format!("Order complete DB update failed: {}", e))?;
            Ok(())
        })();

        match result {
            Ok(_) => {
                if conn.execute_batch("COMMIT").is_err() {
                    let _ = conn.execute_batch("ROLLBACK");
                    mark_failed(&conn, &id, "Transaction commit failed");
                    continue;
                }
                let _ = conn.execute(
                    "UPDATE bill_queue SET status = 'completed', updated_at = ?1 WHERE id = ?2",
                    rusqlite::params![now_ts(), id],
                );
            }
            Err(msg) => {
                let _ = conn.execute_batch("ROLLBACK");
                mark_failed(&conn, &id, &msg);
            }
        }
    }
}

fn mark_failed(conn: &rusqlite::Connection, id: &str, msg: &str) {
    let _ = conn.execute(
        "UPDATE bill_queue SET status = 'failed', error_message = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![msg, now_ts(), id],
    );
}
