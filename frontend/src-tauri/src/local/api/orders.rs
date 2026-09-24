use serde_json::{json, Value};

use super::rows::{self, ItemsKind};
use super::{
    broadcast_table_status, created, err, now_ts, ok, target_store, entity_id, ApiResponse, Ctx,
};

/// Shared insert used by create/parcel/e-bill — mirrors OrderRepository.Create.
fn insert_order(
    tx: &rusqlite::Transaction,
    store_id: &str,
    order_id: &str,
    body: &Value,
    order_type: &str,
    created_by: &str,
) -> Result<(), rusqlite::Error> {
    let table_id: Option<String> = body["tableId"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let pay_method: Option<String> = body["paymentMethod"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let otype: Option<String> = if order_type.is_empty() {
        body["orderType"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(String::from)
    } else {
        Some(order_type.to_string())
    };
    let customer: Option<String> = body["customerName"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let mobile: Option<String> = body["customerMobile"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);

    tx.execute(
        "INSERT INTO orders (id, store_id, table_id, table_number, status, order_type, customer_name, customer_mobile, total_amount, tax_amount, discount_amount, payment_method, created_by)
         VALUES (?1,?2,?3,?4,'active',?5,?6,?7,?8,?9,?10,?11,?12)",
        rusqlite::params![
            order_id,
            store_id,
            table_id,
            body["tableNumber"].as_i64().unwrap_or(0),
            otype,
            customer,
            mobile,
            body["totalAmount"].as_f64().unwrap_or(0.0),
            body["taxAmount"].as_f64().unwrap_or(0.0),
            body["discountAmount"].as_f64().unwrap_or(0.0),
            pay_method,
            created_by,
        ],
    )?;

    if let Some(items) = body["items"].as_array() {
        for item in items {
            let notes: Option<String> = item["notes"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(String::from);
            // Go uses the nested item price/tax on create.
            let price = item["item"]["price"].as_f64().unwrap_or_else(|| {
                item["unitPrice"].as_f64().unwrap_or(0.0)
            });
            let tax = item["item"]["taxPercent"]
                .as_f64()
                .unwrap_or_else(|| item["taxPercent"].as_f64().unwrap_or(0.0));
            tx.execute(
                "INSERT INTO order_items (order_id, item_id, quantity, unit_price, tax_percent, notes)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                rusqlite::params![
                    order_id,
                    item["itemId"].as_str().unwrap_or(""),
                    item["quantity"].as_i64().unwrap_or(0),
                    price,
                    tax,
                    notes,
                ],
            )?;
        }
    }
    Ok(())
}

fn complete_order_tx(conn: &rusqlite::Connection, id: &str, payment_method: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE orders SET status = 'completed', payment_status = 'paid', payment_method = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![payment_method, now_ts(), id],
    )?;
    Ok(())
}

fn create_bill_tx(
    tx: &rusqlite::Transaction,
    store_id: &str,
    order_id: &str,
    invoice_no: &str,
    body: &Value,
    generated_by: &str,
    subtotal: f64,
    tax_total: f64,
    discount: f64,
    total: f64,
    payment_method: &str,
    table_number: i64,
) -> Result<String, rusqlite::Error> {
    let bill_id = format!("{}-bill", order_id);
    let pay: Option<String> = if payment_method.is_empty() {
        None
    } else {
        Some(payment_method.to_string())
    };
    let cust: Option<String> = body["customerName"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let mobile: Option<String> = body["customerMobile"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    tx.execute(
        "INSERT INTO bills (id, store_id, order_id, table_number, invoice_no, subtotal, tax_total, discount, total, payment_method, customer_name, customer_mobile, generated_by)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        rusqlite::params![
            bill_id, store_id, order_id, table_number, invoice_no,
            subtotal, tax_total, discount, total, pay, cust, mobile, generated_by,
        ],
    )?;
    Ok(bill_id)
}

/// GET /api/orders?storeId=&status=
pub fn get_orders(ctx: &mut Ctx, store_id: &str, status: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let mut sql = format!(
        "SELECT {} FROM orders o WHERE o.store_id = ?1",
        rows::ORDER_COLS
    );
    let mut args: Vec<String> = vec![target];
    if !status.is_empty() {
        sql += " AND o.status = ?2";
        args.push(status.to_string());
    }
    sql += " ORDER BY o.created_at DESC";

    let mut stmt = match ctx.conn.prepare(&sql) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let mut orders: Vec<(String, Value)> = match stmt
        .query_map(rusqlite::params_from_iter(args.iter()), |r| {
            Ok((r.get::<_, String>(0)?, rows::order_json(r, vec![])))
        }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    drop(stmt);

    let ids: Vec<String> = orders.iter().map(|(id, _)| id.clone()).collect();
    let mut items_map = rows::order_items_map(&ctx.conn, &ids, ItemsKind::OrderList);
    for (id, o) in orders.iter_mut() {
        o["items"] = json!(items_map.remove(id).unwrap_or_default());
    }

    ok(json!(orders.into_iter().map(|(_, o)| o).collect::<Vec<_>>()))
}

/// POST /api/orders
pub fn create_order(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let order_id = entity_id(&body);
    {
        let tx = match ctx.conn.transaction() {
            Ok(t) => t,
            Err(e) => return err(500, e.to_string()),
        };
        if let Err(e) = insert_order(&tx, &target, &order_id, &body, "", &claims.id) {
            return err(500, e.to_string());
        }
        if let Err(e) = tx.commit() {
            return err(500, e.to_string());
        }
    }

    match rows::get_order(&ctx.conn, &order_id) {
        Ok(Some(order)) => {
            broadcast_table_status(ctx, &target, "order_created");
            created(order)
        }
        _ => {
            broadcast_table_status(ctx, &target, "order_created");
            let mut resp = body.clone();
            resp["id"] = json!(order_id);
            resp["storeId"] = json!(target);
            resp["status"] = json!("active");
            resp["createdBy"] = json!(claims.id);
            created(resp)
        }
    }
}

/// PUT /api/orders/:id
pub fn update_order(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    // Dynamic field updates mirroring the Go handler.
    let mut fields: Vec<(&str, Value)> = Vec::new();
    for (json_key, col) in [
        ("totalAmount", "total_amount"),
        ("taxAmount", "tax_amount"),
        ("discountAmount", "discount_amount"),
        ("tableId", "table_id"),
        ("tableNumber", "table_number"),
    ] {
        if let Some(v) = body.get(json_key) {
            fields.push((col, v.clone()));
        }
    }
    let has_items = body["items"].is_array();
    let items = body["items"].as_array().cloned().unwrap_or_default();

    {
        let tx = match ctx.conn.transaction() {
            Ok(t) => t,
            Err(e) => return err(500, e.to_string()),
        };

        if has_items {
            if let Err(e) = tx.execute("DELETE FROM order_items WHERE order_id = ?1", [id]) {
                return err(500, e.to_string());
            }
            for item in &items {
                let notes: Option<String> = item["notes"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .map(String::from);
                let mut price = item["unitPrice"].as_f64().unwrap_or(0.0);
                if price == 0.0 {
                    price = item["item"]["price"].as_f64().unwrap_or(0.0);
                }
                if let Err(e) = tx.execute(
                    "INSERT INTO order_items (order_id, item_id, quantity, unit_price, tax_percent, notes)
                     VALUES (?1,?2,?3,?4,?5,?6)",
                    rusqlite::params![
                        id,
                        item["itemId"].as_str().unwrap_or(""),
                        item["quantity"].as_i64().unwrap_or(0),
                        price,
                        item["taxPercent"].as_f64().unwrap_or(0.0),
                        notes,
                    ],
                ) {
                    return err(500, e.to_string());
                }
            }
        }

        if !fields.is_empty() {
            let mut sets: Vec<String> = Vec::new();
            let mut args: Vec<rusqlite::types::Value> = Vec::new();
            for (i, (col, v)) in fields.iter().enumerate() {
                sets.push(format!("{} = ?{}", col, i + 1));
                args.push(super::json_to_sql(v));
            }
            let sql = format!(
                "UPDATE orders SET {}, updated_at = ?{} WHERE id = ?{}",
                sets.join(", "),
                fields.len() + 1,
                fields.len() + 2
            );
            args.push(rusqlite::types::Value::Text(now_ts()));
            args.push(rusqlite::types::Value::Text(id.to_string()));
            if let Err(e) = tx.execute(&sql, rusqlite::params_from_iter(args.iter())) {
                return err(500, e.to_string());
            }
        } else {
            if let Err(e) = tx.execute(
                "UPDATE orders SET updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now_ts(), id],
            ) {
                return err(500, e.to_string());
            }
        }

        if let Err(e) = tx.commit() {
            return err(500, e.to_string());
        }
    }

    match rows::get_order(&ctx.conn, id) {
        Ok(Some(order)) => {
            let sid = order["storeId"].as_str().unwrap_or("").to_string();
            broadcast_table_status(ctx, &sid, "order_updated");
            ok(order)
        }
        _ => ok(json!({ "message": "Order updated successfully" })),
    }
}

/// PATCH /api/orders/:id/complete
pub fn complete_order(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let payment_method = body["paymentMethod"].as_str().unwrap_or("");
    if let Err(e) = complete_order_tx(&ctx.conn, id, payment_method) {
        return err(500, e.to_string());
    }
    match rows::get_order(&ctx.conn, id) {
        Ok(Some(order)) => {
            let sid = order["storeId"].as_str().unwrap_or("").to_string();
            broadcast_table_status(ctx, &sid, "order_completed");
            ok(order)
        }
        _ => err(404, "Order not found after update"),
    }
}

/// PATCH /api/orders/:id/cancel
pub fn cancel_order(ctx: &mut Ctx, id: &str) -> ApiResponse {
    let existing = match rows::get_order(&ctx.conn, id) {
        Ok(Some(o)) => o,
        Ok(None) => return err(404, "Order not found"),
        Err(e) => return err(500, e.to_string()),
    };
    if existing["status"].as_str() == Some("cancelled") {
        return err(400, "Order is already cancelled");
    }

    let tx = match ctx.conn.transaction() {
        Ok(t) => t,
        Err(e) => return err(500, e.to_string()),
    };
    let now = now_ts();
    if let Err(e) = tx.execute(
        "UPDATE orders SET status = 'cancelled', cancelled_at = ?1, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    ) {
        return err(500, e.to_string());
    }
    if let Err(e) = tx.execute(
        "UPDATE bills SET status = 'cancelled' WHERE order_id = ?1 AND (status IS NULL OR status = 'active')",
        [id],
    ) {
        return err(500, e.to_string());
    }
    if let Err(e) = tx.commit() {
        return err(500, e.to_string());
    }

    match rows::get_order(&ctx.conn, id) {
        Ok(Some(order)) => {
            let sid = order["storeId"].as_str().unwrap_or("").to_string();
            broadcast_table_status(ctx, &sid, "order_cancelled");
            ok(order)
        }
        _ => err(404, "Order not found after update"),
    }
}

/// POST /api/orders/save-ebill — create + complete order and create bill atomically.
pub fn save_ebill(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let order_id = entity_id(&body);
    let invoice_no = format!("INV-{}", chrono::Utc::now().timestamp());
    let payment_method = {
        let p = body["paymentMethod"].as_str().unwrap_or("");
        if p.is_empty() { "upi".to_string() } else { p.to_string() }
    };
    let subtotal = body["totalAmount"].as_f64().unwrap_or(0.0);
    let tax = body["taxAmount"].as_f64().unwrap_or(0.0);
    let discount = body["discountAmount"].as_f64().unwrap_or(0.0);
    let table_number = body["tableNumber"].as_i64().unwrap_or(0);

    {
        let tx = match ctx.conn.transaction() {
            Ok(t) => t,
            Err(e) => return err(500, e.to_string()),
        };
        if let Err(e) = insert_order(&tx, &target, &order_id, &body, "dine_in", &claims.id) {
            return err(500, e.to_string());
        }
        if let Err(e) = tx.execute(
            "UPDATE orders SET status = 'completed', payment_status = 'paid', payment_method = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![payment_method, now_ts(), order_id],
        ) {
            return err(500, e.to_string());
        }
        if let Err(e) = create_bill_tx(
            &tx, &target, &order_id, &invoice_no, &body, &claims.id,
            subtotal, tax, discount, subtotal + tax - discount,
            &payment_method, table_number,
        ) {
            return err(500, e.to_string());
        }
        if let Err(e) = tx.commit() {
            return err(500, e.to_string());
        }
    }

    match rows::get_order(&ctx.conn, &order_id) {
        Ok(Some(order)) => {
            broadcast_table_status(ctx, &target, "order_completed");
            created(order)
        }
        _ => {
            let mut resp = body.clone();
            resp["id"] = json!(order_id);
            created(resp)
        }
    }
}

/// POST /api/orders/:id/save-print — create bill for existing order + complete it.
pub fn save_print(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let order = match rows::get_order(&ctx.conn, id) {
        Ok(Some(o)) => o,
        Ok(None) => return err(404, "Order not found"),
        Err(e) => return err(500, e.to_string()),
    };

    let invoice_no = {
        let v = body["invoiceNo"].as_str().unwrap_or("");
        if v.is_empty() {
            format!("INV-{}", chrono::Utc::now().timestamp())
        } else {
            v.to_string()
        }
    };
    let payment_method = {
        let p = body["paymentMethod"].as_str().unwrap_or("");
        if p.is_empty() { "upi".to_string() } else { p.to_string() }
    };

    {
        let tx = match ctx.conn.transaction() {
            Ok(t) => t,
            Err(e) => return err(500, e.to_string()),
        };
        if let Err(e) = create_bill_tx(
            &tx, &target, id, &invoice_no, &body, &claims.id,
            body["subtotal"].as_f64().unwrap_or(0.0),
            body["taxTotal"].as_f64().unwrap_or(0.0),
            body["discount"].as_f64().unwrap_or(0.0),
            body["total"].as_f64().unwrap_or(0.0),
            &payment_method,
            body["tableNumber"].as_i64().unwrap_or(0),
        ) {
            return err(500, e.to_string());
        }
        if let Err(e) = tx.execute(
            "UPDATE orders SET status = 'completed', payment_status = 'paid', payment_method = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![payment_method, now_ts(), id],
        ) {
            return err(500, e.to_string());
        }
        if let Err(e) = tx.commit() {
            return err(500, e.to_string());
        }
    }
    let _ = order;

    match rows::get_order(&ctx.conn, id) {
        Ok(Some(order)) => {
            broadcast_table_status(ctx, &target, "order_completed");
            ok(order)
        }
        _ => err(404, "Order not found after update"),
    }
}

/// POST /api/orders/parcel — completed order + bill in one shot.
pub fn create_parcel_order(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let order_id = entity_id(&body);
    let invoice_no = format!("INV-{}", chrono::Utc::now().timestamp());
    let payment_method = body["paymentMethod"].as_str().unwrap_or("").to_string();
    let subtotal = body["totalAmount"].as_f64().unwrap_or(0.0);
    let tax = body["taxAmount"].as_f64().unwrap_or(0.0);
    let discount = body["discountAmount"].as_f64().unwrap_or(0.0);

    {
        let tx = match ctx.conn.transaction() {
            Ok(t) => t,
            Err(e) => return err(500, e.to_string()),
        };
        if let Err(e) = insert_order(&tx, &target, &order_id, &body, "parcel", &claims.id) {
            return err(500, e.to_string());
        }
        if let Err(e) = tx.execute(
            "UPDATE orders SET status = 'completed', payment_status = 'paid', payment_method = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![payment_method, now_ts(), order_id],
        ) {
            return err(500, e.to_string());
        }
        if let Err(e) = create_bill_tx(
            &tx, &target, &order_id, &invoice_no, &body, &claims.id,
            subtotal, tax, discount, subtotal + tax - discount,
            &payment_method, 0,
        ) {
            return err(500, e.to_string());
        }
        if let Err(e) = tx.commit() {
            return err(500, e.to_string());
        }
    }

    match rows::get_order(&ctx.conn, &order_id) {
        Ok(Some(order)) => created(order),
        _ => {
            let mut resp = body.clone();
            resp["id"] = json!(order_id);
            created(resp)
        }
    }
}
