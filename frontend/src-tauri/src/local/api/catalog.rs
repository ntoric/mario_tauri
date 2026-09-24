use serde_json::{json, Value};

use super::{created, err, ok, target_store, entity_id, ApiResponse, Ctx};

// ==========================================
// CATEGORIES
// ==========================================

/// GET /api/categories?storeId=
pub fn get_categories(ctx: &mut Ctx, store_id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let mut stmt = match ctx.conn.prepare(
        "SELECT id, store_id, name, description, is_active, enabled, is_favourite
         FROM categories WHERE store_id = ?1 AND is_active = 1
         ORDER BY is_favourite DESC, name",
    ) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let cats: Vec<Value> = match stmt.query_map([&target], |r| {
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "storeId": r.get::<_, String>(1)?,
            "name": r.get::<_, String>(2)?,
            "description": r.get::<_, Option<String>>(3)?.unwrap_or_default(),
            "isActive": r.get::<_, i64>(4).map(|v| v != 0)?,
            "enabled": r.get::<_, i64>(5).map(|v| v != 0)?,
            "isFavourite": r.get::<_, i64>(6).map(|v| v != 0)?,
        }))
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };

    ok(json!(cats))
}

/// POST /api/categories
pub fn create_category(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let id = entity_id(&body);
    let enabled = if body.get("enabled").is_some() {
        body["enabled"].as_bool().unwrap_or(true)
    } else {
        true
    };
    let res = ctx.conn.execute(
        "INSERT INTO categories (id, store_id, name, description, enabled, is_favourite) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![
            id,
            target,
            body["name"].as_str().unwrap_or(""),
            body["description"].as_str().unwrap_or(""),
            enabled as i64,
            body["isFavourite"].as_bool().unwrap_or(false) as i64,
        ],
    );
    match res {
        Ok(_) => created(json!({
            "id": id,
            "storeId": target,
            "name": body["name"].as_str().unwrap_or(""),
            "description": body["description"].as_str().unwrap_or(""),
            "isActive": true,
            "enabled": enabled,
            "isFavourite": body["isFavourite"].as_bool().unwrap_or(false),
        })),
        Err(e) => err(500, e.to_string()),
    }
}

/// PUT /api/categories/:id
pub fn update_category(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let res = ctx.conn.execute(
        "UPDATE categories SET name = ?1, description = ?2, enabled = ?3, is_favourite = ?4 WHERE id = ?5",
        rusqlite::params![
            body["name"].as_str().unwrap_or(""),
            body["description"].as_str().unwrap_or(""),
            body["enabled"].as_bool().unwrap_or(true) as i64,
            body["isFavourite"].as_bool().unwrap_or(false) as i64,
            id,
        ],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            ok(resp)
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// DELETE /api/categories/:id (soft delete)
pub fn delete_category(ctx: &mut Ctx, id: &str) -> ApiResponse {
    match ctx
        .conn
        .execute("UPDATE categories SET is_active = 0 WHERE id = ?1", [id])
    {
        Ok(_) => ok(json!({ "message": "Category deleted" })),
        Err(e) => err(500, e.to_string()),
    }
}

// ==========================================
// ITEMS
// ==========================================

fn compute_profit(price: f64, total_cost: f64) -> (f64, f64) {
    let profit = price - total_cost;
    let pct = if price > 0.0 { (profit / price) * 100.0 } else { 0.0 };
    (profit, pct)
}

/// GET /api/items?storeId=&includeProfit=
pub fn get_items(ctx: &mut Ctx, store_id: &str, include_profit: bool) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let sql = if include_profit {
        "SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active, i.enabled, i.is_favourite,
                COALESCE(c.name, '') as category_name,
                COALESCE((SELECT SUM(ie.amount) FROM item_expenses ie WHERE ie.item_id = i.id AND ie.is_active = 1), 0) as total_cost
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.store_id = ?1 AND i.is_active = 1
         ORDER BY i.is_favourite DESC, i.name"
    } else {
        "SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active, i.enabled, i.is_favourite,
                COALESCE(c.name, '') as category_name,
                0 as total_cost
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.store_id = ?1 AND i.is_active = 1
         ORDER BY i.is_favourite DESC, i.name"
    };

    let mut stmt = match ctx.conn.prepare(sql) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let items: Vec<Value> = match stmt.query_map([&target], |r| {
        let price: f64 = r.get(5)?;
        let total_cost: f64 = r.get(12)?;
        let mut item = json!({
            "id": r.get::<_, String>(0)?,
            "storeId": r.get::<_, String>(1)?,
            "categoryId": r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            "categoryName": r.get::<_, String>(11)?,
            "name": r.get::<_, String>(3)?,
            "description": r.get::<_, Option<String>>(4)?.unwrap_or_default(),
            "price": price,
            "hsnCode": r.get::<_, Option<String>>(6)?.unwrap_or_default(),
            "taxPercent": r.get::<_, f64>(7)?,
            "isActive": r.get::<_, i64>(8).map(|v| v != 0)?,
            "enabled": r.get::<_, i64>(9).map(|v| v != 0)?,
            "isFavourite": r.get::<_, i64>(10).map(|v| v != 0)?,
        });
        if include_profit && total_cost > 0.0 {
            let (profit, pct) = compute_profit(price, total_cost);
            item["totalCost"] = json!(total_cost);
            item["profit"] = json!(profit);
            item["profitPercent"] = json!(pct);
        }
        Ok(item)
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };

    ok(json!(items))
}

/// POST /api/items
pub fn create_item(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let id = entity_id(&body);
    let enabled = if body.get("enabled").is_some() {
        body["enabled"].as_bool().unwrap_or(true)
    } else {
        true
    };
    let category: Option<String> = {
        let c = body["categoryId"].as_str().unwrap_or("").to_string();
        if c.is_empty() { None } else { Some(c) }
    };
    let res = ctx.conn.execute(
        "INSERT INTO items (id, store_id, category_id, name, description, price, hsn_code, tax_percent, enabled, is_favourite)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        rusqlite::params![
            id,
            target,
            category,
            body["name"].as_str().unwrap_or(""),
            body["description"].as_str().unwrap_or(""),
            body["price"].as_f64().unwrap_or(0.0),
            body["hsnCode"].as_str().unwrap_or(""),
            body["taxPercent"].as_f64().unwrap_or(0.0),
            enabled as i64,
            body["isFavourite"].as_bool().unwrap_or(false) as i64,
        ],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            resp["storeId"] = json!(target);
            resp["isActive"] = json!(true);
            resp["enabled"] = json!(enabled);
            created(resp)
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// PUT /api/items/:id
pub fn update_item(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let category: Option<String> = {
        let c = body["categoryId"].as_str().unwrap_or("").to_string();
        if c.is_empty() { None } else { Some(c) }
    };
    let res = ctx.conn.execute(
        "UPDATE items SET category_id = ?1, name = ?2, description = ?3, price = ?4, hsn_code = ?5, tax_percent = ?6, enabled = ?7, is_favourite = ?8 WHERE id = ?9",
        rusqlite::params![
            category,
            body["name"].as_str().unwrap_or(""),
            body["description"].as_str().unwrap_or(""),
            body["price"].as_f64().unwrap_or(0.0),
            body["hsnCode"].as_str().unwrap_or(""),
            body["taxPercent"].as_f64().unwrap_or(0.0),
            body["enabled"].as_bool().unwrap_or(true) as i64,
            body["isFavourite"].as_bool().unwrap_or(false) as i64,
            id,
        ],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            ok(resp)
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// DELETE /api/items/:id (soft delete)
pub fn delete_item(ctx: &mut Ctx, id: &str) -> ApiResponse {
    match ctx
        .conn
        .execute("UPDATE items SET is_active = 0 WHERE id = ?1", [id])
    {
        Ok(_) => ok(json!({ "message": "Item deleted" })),
        Err(e) => err(500, e.to_string()),
    }
}

// ==========================================
// ITEM EXPENSES
// ==========================================

fn item_expense_json(r: &rusqlite::Row) -> Result<Value, rusqlite::Error> {
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "storeId": r.get::<_, String>(1)?,
        "itemId": r.get::<_, String>(2)?,
        "name": r.get::<_, String>(3)?,
        "description": r.get::<_, Option<String>>(4)?.unwrap_or_default(),
        "amount": r.get::<_, f64>(5)?,
        "isActive": r.get::<_, i64>(6).map(|v| v != 0)?,
        "createdAt": r.get::<_, Option<String>>(7)?.unwrap_or_default(),
    }))
}

/// GET /api/items/:itemId/expenses
pub fn get_item_expenses(ctx: &mut Ctx, item_id: &str) -> ApiResponse {
    let mut stmt = match ctx.conn.prepare(
        "SELECT id, store_id, item_id, name, description, amount, is_active, created_at
         FROM item_expenses WHERE item_id = ?1 AND is_active = 1 ORDER BY name",
    ) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let expenses: Vec<Value> = match stmt.query_map([item_id], item_expense_json) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    ok(json!(expenses))
}

/// POST /api/items/:itemId/expenses
pub fn create_item_expense(ctx: &mut Ctx, item_id: &str, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let name = body["name"].as_str().unwrap_or("");
    let amount = body["amount"].as_f64().unwrap_or(-1.0);
    if name.is_empty() || amount < 0.0 {
        return err(400, "Name and valid amount are required");
    }
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let id = entity_id(&body);
    let res = ctx.conn.execute(
        "INSERT INTO item_expenses (id, store_id, item_id, name, description, amount) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![
            id,
            target,
            item_id,
            name,
            body["description"].as_str().unwrap_or(""),
            amount,
        ],
    );
    match res {
        Ok(_) => created(json!({
            "id": id,
            "storeId": target,
            "itemId": item_id,
            "name": name,
            "description": body["description"].as_str().unwrap_or(""),
            "amount": amount,
            "isActive": true,
        })),
        Err(e) => err(500, e.to_string()),
    }
}

/// PUT /api/item-expenses/:id
pub fn update_item_expense(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let name = body["name"].as_str().unwrap_or("");
    let amount = body["amount"].as_f64().unwrap_or(-1.0);
    if name.is_empty() || amount < 0.0 {
        return err(400, "Name and valid amount are required");
    }

    let res = ctx.conn.execute(
        "UPDATE item_expenses SET name = ?1, description = ?2, amount = ?3 WHERE id = ?4",
        rusqlite::params![
            name,
            body["description"].as_str().unwrap_or(""),
            amount,
            id,
        ],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            if resp["storeId"].as_str().unwrap_or("").is_empty() {
                resp["storeId"] = json!(claims.store_id);
            }
            ok(resp)
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// DELETE /api/item-expenses/:id
pub fn delete_item_expense(ctx: &mut Ctx, id: &str, _store_id: &str) -> ApiResponse {
    match ctx
        .conn
        .execute("UPDATE item_expenses SET is_active = 0 WHERE id = ?1", [id])
    {
        Ok(_) => ok(json!({ "message": "Item expense deleted" })),
        Err(e) => err(500, e.to_string()),
    }
}

/// GET /api/reports/item-profit?storeId=
pub fn item_profit_report(ctx: &mut Ctx, store_id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let mut stmt = match ctx.conn.prepare(
        "SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active,
                COALESCE(c.name, '') as category_name,
                COALESCE((SELECT SUM(ie.amount) FROM item_expenses ie WHERE ie.item_id = i.id AND ie.is_active = 1), 0) as total_cost
         FROM items i
         LEFT JOIN categories c ON i.category_id = c.id
         WHERE i.store_id = ?1 AND i.is_active = 1
         ORDER BY i.name",
    ) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };

    struct ItemRow {
        item: Value,
        item_id: String,
        price: f64,
        total_cost: f64,
    }

    let items: Vec<ItemRow> = match stmt.query_map([&target], |r| {
        let price: f64 = r.get(5)?;
        let total_cost: f64 = r.get(10)?;
        let item = json!({
            "id": r.get::<_, String>(0)?,
            "storeId": r.get::<_, String>(1)?,
            "categoryId": r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            "categoryName": r.get::<_, String>(9)?,
            "name": r.get::<_, String>(3)?,
            "description": r.get::<_, Option<String>>(4)?.unwrap_or_default(),
            "price": price,
            "hsnCode": r.get::<_, Option<String>>(6)?.unwrap_or_default(),
            "taxPercent": r.get::<_, f64>(7)?,
            "isActive": r.get::<_, i64>(8).map(|v| v != 0)?,
        });
        Ok(ItemRow {
            item_id: r.get::<_, String>(0)?,
            item,
            price,
            total_cost,
        })
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    drop(stmt);

    let mut entries: Vec<Value> = Vec::new();
    let mut total_selling = 0.0;
    let mut total_cost_sum = 0.0;
    let mut total_profit = 0.0;
    let mut with_cost = 0i64;
    let mut pct_sum = 0.0;

    let mut exp_stmt = match ctx.conn.prepare(
        "SELECT id, store_id, item_id, name, description, amount, is_active, created_at
         FROM item_expenses WHERE item_id = ?1 AND is_active = 1 ORDER BY name",
    ) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };

    for row in items {
        let expenses: Vec<Value> = exp_stmt
            .query_map([&row.item_id], item_expense_json)
            .map(|rs| rs.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();

        let (profit, pct) = if row.total_cost > 0.0 {
            compute_profit(row.price, row.total_cost)
        } else {
            (0.0, 0.0)
        };

        let mut item = row.item.clone();
        if row.total_cost > 0.0 {
            item["totalCost"] = json!(row.total_cost);
            item["profit"] = json!(profit);
            item["profitPercent"] = json!(pct);
        }

        entries.push(json!({
            "item": item,
            "expenses": expenses,
            "totalCost": row.total_cost,
            "profit": profit,
            "profitPercent": pct,
        }));

        total_selling += row.price;
        total_cost_sum += row.total_cost;
        total_profit += profit;
        if row.total_cost > 0.0 {
            with_cost += 1;
            pct_sum += pct;
        }
    }

    let avg_pct = if with_cost > 0 { pct_sum / with_cost as f64 } else { 0.0 };

    ok(json!({
        "storeId": target,
        "items": entries,
        "totalSellingValue": total_selling,
        "totalCost": total_cost_sum,
        "totalProfit": total_profit,
        "averageProfitPercent": avg_pct,
        "itemsWithCostCount": with_cost,
    }))
}
