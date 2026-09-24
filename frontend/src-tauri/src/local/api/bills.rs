use serde_json::{json, Value};

use super::rows::{self, ItemsKind};
use super::{created, err, now_ts, ok, target_store, entity_id, ApiResponse, Ctx};

fn attach_bill_items(conn: &rusqlite::Connection, bills: &mut Vec<Value>) {
    let order_ids: Vec<String> = bills
        .iter()
        .filter_map(|b| b["orderId"].as_str().map(String::from))
        .collect();
    let items_map = rows::order_items_map(conn, &order_ids, ItemsKind::Bill);
    for b in bills.iter_mut() {
        let oid = b["orderId"].as_str().unwrap_or("").to_string();
        b["items"] = json!(items_map.get(&oid).cloned().unwrap_or_default());
    }
}

/// GET /api/bills?storeId=
pub fn get_bills(ctx: &mut Ctx, store_id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let sql = format!(
        "SELECT {} FROM bills b WHERE b.store_id = ?1 ORDER BY b.generated_at DESC",
        rows::BILL_COLS
    );
    let mut stmt = match ctx.conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let mut bills: Vec<Value> = match stmt.query_map([&target], |r| {
        Ok(rows::bill_json(r, vec![], true))
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    drop(stmt);

    attach_bill_items(&ctx.conn, &mut bills);
    ok(json!(bills))
}

/// POST /api/bills
pub fn create_bill(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let id = entity_id(&body);
    let pay: Option<String> = body["paymentMethod"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let cust: Option<String> = body["customerName"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let mobile: Option<String> = body["customerMobile"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);

    let res = ctx.conn.execute(
        "INSERT INTO bills (id, store_id, order_id, table_number, invoice_no, subtotal, tax_total, discount, total, payment_method, customer_name, customer_mobile, generated_by)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        rusqlite::params![
            id,
            target,
            body["orderId"].as_str().unwrap_or(""),
            body["tableNumber"].as_i64().unwrap_or(0),
            body["invoiceNo"].as_str().unwrap_or(""),
            body["subtotal"].as_f64().unwrap_or(0.0),
            body["taxTotal"].as_f64().unwrap_or(0.0),
            body["discount"].as_f64().unwrap_or(0.0),
            body["total"].as_f64().unwrap_or(0.0),
            pay,
            cust,
            mobile,
            claims.id,
        ],
    );
    match res {
        Ok(_) => {
            // Mirror Go: returns the request object with server-assigned fields.
            let mut resp = body.clone();
            resp["id"] = json!(id);
            resp["storeId"] = json!(target);
            resp["generatedBy"] = json!(claims.id);
            created(resp)
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// GET /api/bills/next-invoice-no?storeId=
pub fn get_next_invoice_no(ctx: &mut Ctx, store_id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let count: i64 = ctx
        .conn
        .query_row(
            "SELECT COUNT(*) FROM bills WHERE store_id = ?1",
            [&target],
            |r| r.get(0),
        )
        .unwrap_or(0);
    ok(json!({ "invoiceNo": format!("INV-{:06}", count + 1) }))
}

/// POST /api/bills/queue — enqueue a remote bill request.
pub fn queue_bill(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    // Verify remote billing is enabled for the store.
    let remote_enabled: Option<bool> = ctx
        .conn
        .query_row(
            "SELECT remote_billing_enabled FROM stores WHERE id = ?1",
            [&target],
            |r| r.get::<_, i64>(0).map(|v| v != 0),
        )
        .ok();
    match remote_enabled {
        None => return err(404, "Store not found"),
        Some(false) => return err(400, "Remote billing is not enabled for this store"),
        Some(true) => {}
    }

    let queue_id = entity_id(&body);
    let bill_data = json!({
        "orderId": body["orderId"].as_str().unwrap_or(""),
        "tableNumber": body["tableNumber"].as_i64().unwrap_or(0),
        "invoiceNo": body["invoiceNo"].as_str().unwrap_or(""),
        "subtotal": body["subtotal"].as_f64().unwrap_or(0.0),
        "taxTotal": body["taxTotal"].as_f64().unwrap_or(0.0),
        "discount": body["discount"].as_f64().unwrap_or(0.0),
        "total": body["total"].as_f64().unwrap_or(0.0),
        "paymentMethod": body["paymentMethod"].as_str().unwrap_or(""),
        "customerName": body["customerName"].as_str().unwrap_or(""),
        "generatedBy": claims.id,
    });

    let res = ctx.conn.execute(
        "INSERT INTO bill_queue (id, store_id, order_id, bill_data, status) VALUES (?1,?2,?3,?4,'pending')",
        rusqlite::params![
            queue_id,
            target,
            body["orderId"].as_str().unwrap_or(""),
            bill_data.to_string(),
        ],
    );
    match res {
        Ok(_) => created(json!({
            "success": true,
            "message": "Bill generation request queued successfully",
            "queueId": queue_id,
            "storeId": target,
            "orderId": body["orderId"].as_str().unwrap_or(""),
        })),
        Err(e) => err(500, e.to_string()),
    }
}

/// GET /api/bills/queue?storeId= — atomically pop up to 20 pending items
/// (mirrors the Redis LPOP semantics of the Go backend).
pub fn get_bill_queue(ctx: &mut Ctx, store_id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let tx = match ctx.conn.transaction() {
        Ok(t) => t,
        Err(e) => return err(500, e.to_string()),
    };

    let items: Vec<Value> = {
        let mut stmt = match tx.prepare(
            "SELECT id, store_id, order_id, bill_data, status, COALESCE(error_message, ''), created_at, updated_at
             FROM bill_queue WHERE store_id = ?1 AND status = 'pending'
             ORDER BY created_at ASC LIMIT 20",
        ) {
            Ok(s) => s,
            Err(e) => return err(500, e.to_string()),
        };
        let mapped = match stmt.query_map([&target], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "storeId": r.get::<_, String>(1)?,
                "orderId": r.get::<_, String>(2)?,
                "billData": r.get::<_, String>(3)?,
                "status": r.get::<_, String>(4)?,
                "errorMessage": r.get::<_, String>(5)?,
                "createdAt": r.get::<_, Option<String>>(6)?.unwrap_or_default(),
                "updatedAt": r.get::<_, Option<String>>(7)?.unwrap_or_default(),
            }))
        }) {
            Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
            Err(e) => return err(500, e.to_string()),
        };
        mapped
    };

    // Mark fetched items as 'processing' so they aren't returned twice —
    // equivalent to the destructive LPOP on the Redis queue.
    for item in &items {
        if let Some(id) = item["id"].as_str() {
            let _ = tx.execute(
                "UPDATE bill_queue SET status = 'processing', updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now_ts(), id],
            );
        }
    }

    if let Err(e) = tx.commit() {
        return err(500, e.to_string());
    }

    ok(json!(items))
}
