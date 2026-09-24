use rusqlite::{params, Connection, OptionalExtension, Row};
use serde_json::{json, Value};

fn s(row: &Row, i: usize) -> String {
    row.get::<_, Option<String>>(i).ok().flatten().unwrap_or_default()
}

fn sreq(row: &Row, i: usize) -> String {
    row.get::<_, String>(i).unwrap_or_default()
}

fn f(row: &Row, i: usize) -> f64 {
    row.get::<_, f64>(i).unwrap_or(0.0)
}

fn i64v(row: &Row, i: usize) -> i64 {
    row.get::<_, i64>(i).unwrap_or(0)
}

fn b(row: &Row, i: usize) -> bool {
    row.get::<_, i64>(i).map(|v| v != 0).unwrap_or(false)
}

const STORE_COLS: &str = "id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, created_at";

pub fn store_json(row: &Row) -> Value {
    json!({
        "id": sreq(row, 0),
        "name": sreq(row, 1),
        "branch": s(row, 2),
        "location": s(row, 3),
        "gstin": s(row, 4),
        "fssaiNo": s(row, 5),
        "phone": s(row, 6),
        "printerName": s(row, 7),
        "printerVendorId": s(row, 8),
        "printerProductId": s(row, 9),
        "invoiceSize": s(row, 10),
        "kotPrintEnabled": b(row, 11),
        "remoteBillingEnabled": b(row, 12),
        "logoUrl": s(row, 13),
        "themeColor": s(row, 14),
        "taxEnabled": b(row, 15),
        "defaultTaxPercent": f(row, 16),
        "isActive": b(row, 17),
        "createdAt": s(row, 18),
    })
}

/// Fetch a store row as JSON. Returns None when not found.
pub fn get_store(conn: &Connection, id: &str) -> Result<Option<Value>, rusqlite::Error> {
    let sql = format!("SELECT {} FROM stores WHERE id = ?1", STORE_COLS);
    conn.query_row(&sql, [id], |r| Ok(store_json(r))).optional()
}

/// Stores visible to the user for GET /api/stores.
pub fn stores_for_role(
    conn: &Connection,
    role: &str,
    user_id: &str,
    store_id: &str,
) -> Result<Vec<Value>, rusqlite::Error> {
    let (sql, args): (String, Vec<String>) = match role {
        "superadmin" => (
            format!("SELECT {} FROM stores ORDER BY name", STORE_COLS),
            vec![],
        ),
        "business_owner" => (
            format!(
                "SELECT {} FROM stores WHERE id IN (SELECT store_id FROM user_stores WHERE user_id = ?1) ORDER BY name",
                STORE_COLS
            ),
            vec![user_id.to_string()],
        ),
        _ => (
            format!("SELECT {} FROM stores WHERE id = ?1 ORDER BY name", STORE_COLS),
            vec![store_id.to_string()],
        ),
    };
    let mut stmt = conn.prepare(&sql)?;
    let params = rusqlite::params_from_iter(args.iter());
    let rows = stmt.query_map(params, |r| Ok(store_json(r)))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Stores the user can access on login/me (lightweight shape for owners).
pub fn user_stores(conn: &Connection, user_id: &str) -> Result<Vec<Value>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.branch FROM stores s
         JOIN user_stores us ON s.id = us.store_id
         WHERE us.user_id = ?1 AND s.is_active = 1",
    )?;
    let rows = stmt.query_map([user_id], |r| {
        Ok(json!({
            "id": sreq(r, 0),
            "name": sreq(r, 1),
            "branch": s(r, 2),
        }))
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Full user row as JSON including storeIds array.
/// Expected columns: id, username, password, name, email, role, store_id,
/// is_active, created_at, store_name.
pub fn user_json(conn: &Connection, row: &Row) -> Value {
    let id = sreq(row, 0);
    let mut store_ids: Vec<String> = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT store_id FROM user_stores WHERE user_id = ?1") {
        if let Ok(rows) = stmt.query_map([&id], |r| r.get::<_, String>(0)) {
            store_ids = rows.filter_map(|r| r.ok()).collect();
        }
    }
    json!({
        "id": id,
        "username": sreq(row, 1),
        "name": sreq(row, 3),
        "email": s(row, 4),
        "role": sreq(row, 5),
        "storeId": s(row, 6),
        "storeName": s(row, 9),
        "storeIds": store_ids,
        "isActive": b(row, 7),
        "createdAt": s(row, 8),
    })
}

/// Which item JSON shape to emit — mirrors the three json_build_object variants
/// in the Go repository.
#[derive(Clone, Copy)]
pub enum ItemsKind {
    /// GET /api/orders — nested item includes categoryId/categoryName.
    OrderList,
    /// GET order by id — nested item has no category fields.
    OrderDetail,
    /// Bills — flat entries without taxPercent/notes; nested item has
    /// categoryId/categoryName but no description.
    Bill,
}

/// Load order items for a set of order IDs (with nested item data), preserving
/// insertion order.
pub fn order_items_map(
    conn: &Connection,
    order_ids: &[String],
    kind: ItemsKind,
) -> std::collections::HashMap<String, Vec<Value>> {
    let mut map: std::collections::HashMap<String, Vec<Value>> = std::collections::HashMap::new();
    if order_ids.is_empty() {
        return map;
    }
    let placeholders = order_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT oi.order_id, oi.item_id, oi.quantity, oi.unit_price, oi.tax_percent, COALESCE(oi.notes, ''),
                i.id, i.name, i.price, COALESCE(i.description, ''), i.category_id, COALESCE(c.name, 'Uncategorised'), i.tax_percent
         FROM order_items oi
         LEFT JOIN items i ON oi.item_id = i.id
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE oi.order_id IN ({})
         ORDER BY oi.id",
        placeholders
    );
    if let Ok(mut stmt) = conn.prepare(&sql) {
        let params = rusqlite::params_from_iter(order_ids.iter());
        if let Ok(rows) = stmt.query_map(params, |r| {
            let order_id = sreq(r, 0);
            let entry = match kind {
                ItemsKind::OrderList => json!({
                    "itemId": s(r, 1),
                    "quantity": i64v(r, 2),
                    "unitPrice": f(r, 3),
                    "taxPercent": f(r, 4),
                    "notes": s(r, 5),
                    "item": {
                        "id": s(r, 6),
                        "name": s(r, 7),
                        "price": f(r, 8),
                        "description": s(r, 9),
                        "categoryId": s(r, 10),
                        "categoryName": s(r, 11),
                    },
                }),
                ItemsKind::OrderDetail => json!({
                    "itemId": s(r, 1),
                    "quantity": i64v(r, 2),
                    "unitPrice": f(r, 3),
                    "taxPercent": f(r, 4),
                    "notes": s(r, 5),
                    "item": {
                        "id": s(r, 6),
                        "name": s(r, 7),
                        "price": f(r, 8),
                        "description": s(r, 9),
                    },
                }),
                ItemsKind::Bill => json!({
                    "itemId": s(r, 1),
                    "quantity": i64v(r, 2),
                    "unitPrice": f(r, 3),
                    "item": {
                        "id": s(r, 6),
                        "name": s(r, 7),
                        "price": f(r, 8),
                        "categoryId": s(r, 10),
                        "categoryName": s(r, 11),
                    },
                }),
            };
            Ok((order_id, entry))
        }) {
            for row in rows.flatten() {
                map.entry(row.0).or_default().push(row.1);
            }
        }
    }
    map
}

/// Order row → JSON. items are attached by the caller.
/// Columns must match ORDER_COLS.
pub fn order_json(row: &Row, items: Vec<Value>) -> Value {
    let cancelled: Option<String> = row.get::<_, Option<String>>(16).ok().flatten();
    let mut o = json!({
        "id": sreq(row, 0),
        "storeId": sreq(row, 1),
        "tableId": s(row, 2),
        "tableNumber": i64v(row, 3),
        "status": sreq(row, 4),
        "orderType": s(row, 5),
        "customerName": s(row, 6),
        "customerMobile": s(row, 7),
        "totalAmount": f(row, 8),
        "taxAmount": f(row, 9),
        "discountAmount": f(row, 10),
        "paymentMethod": s(row, 11),
        "paymentStatus": s(row, 12),
        "createdBy": s(row, 13),
        "createdAt": s(row, 14),
        "updatedAt": s(row, 15),
        "items": items,
    });
    if let Some(c) = cancelled {
        o["cancelledAt"] = json!(c);
    }
    o
}

pub const ORDER_COLS: &str =
    "o.id, o.store_id, o.table_id, o.table_number, o.status, o.order_type, o.customer_name, o.customer_mobile, \
     o.total_amount, o.tax_amount, o.discount_amount, o.payment_method, o.payment_status, o.created_by, \
     o.created_at, o.updated_at, o.cancelled_at";

/// Bill row → JSON. items attached by caller. Columns must match BILL_COLS.
pub fn bill_json(row: &Row, items: Vec<Value>, include_status: bool) -> Value {
    let status = if include_status {
        let st = s(row, 13);
        if st.is_empty() { "active".to_string() } else { st }
    } else {
        "active".to_string()
    };
    json!({
        "id": sreq(row, 0),
        "storeId": sreq(row, 1),
        "orderId": sreq(row, 2),
        "tableNumber": i64v(row, 3),
        "invoiceNo": s(row, 4),
        "subtotal": f(row, 5),
        "taxTotal": f(row, 6),
        "discount": f(row, 7),
        "total": f(row, 8),
        "paymentMethod": s(row, 9),
        "customerName": s(row, 10),
        "customerMobile": s(row, 11),
        "isPrinted": b(row, 12),
        "status": status,
        "generatedAt": s(row, 14),
        "generatedBy": s(row, 15),
        "items": items,
    })
}

pub const BILL_COLS: &str =
    "b.id, b.store_id, b.order_id, b.table_number, b.invoice_no, b.subtotal, b.tax_total, b.discount, b.total, \
     b.payment_method, b.customer_name, b.customer_mobile, b.is_printed, b.status, b.generated_at, b.generated_by";

/// Variant of BILL_COLS without the status column (used by the revenue report,
/// which omits b.status in its SELECT).
pub const BILL_COLS_NO_STATUS: &str =
    "b.id, b.store_id, b.order_id, b.table_number, b.invoice_no, b.subtotal, b.tax_total, b.discount, b.total, \
     b.payment_method, b.customer_name, b.customer_mobile, b.is_printed, b.generated_at, b.generated_by";

/// Fetch a single order by id as JSON.
pub fn get_order(conn: &Connection, id: &str) -> Result<Option<Value>, rusqlite::Error> {
    let sql = format!("SELECT {} FROM orders o WHERE o.id = ?1", ORDER_COLS);
    let order = conn
        .query_row(&sql, params![id], |r| Ok(order_json(r, vec![])))
        .optional()?;
    match order {
        Some(mut o) => {
            let items = order_items_map(conn, &[id.to_string()], ItemsKind::OrderDetail)
                .remove(id)
                .unwrap_or_default();
            o["items"] = json!(items);
            Ok(Some(o))
        }
        None => Ok(None),
    }
}
