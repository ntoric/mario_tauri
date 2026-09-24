use rusqlite::OptionalExtension;
use serde_json::{json, Value};

use super::rows::{self, ItemsKind};
use super::{created, err, now_ts, ok, entity_id, ApiResponse, Ctx};

// ==========================================
// EXPENSE CATEGORIES
// ==========================================

/// GET /api/expense-categories?storeId=
pub fn get_expense_categories(ctx: &mut Ctx, store_id: &str) -> ApiResponse {
    if store_id.is_empty() {
        return err(400, "Store ID is required");
    }
    let mut stmt = match ctx.conn.prepare(
        "SELECT id, store_id, name, COALESCE(description, ''), is_active
         FROM expense_categories WHERE store_id = ?1 AND is_active = 1 ORDER BY name",
    ) {
        Ok(s) => s,
        Err(_) => return err(500, "Failed to fetch expense categories"),
    };
    let cats: Vec<Value> = match stmt.query_map([store_id], |r| {
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "storeId": r.get::<_, String>(1)?,
            "name": r.get::<_, String>(2)?,
            "description": r.get::<_, String>(3)?,
            "isActive": r.get::<_, i64>(4).map(|v| v != 0)?,
        }))
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    ok(json!(cats))
}

/// POST /api/expense-categories
pub fn create_expense_category(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let store_id = body["storeId"].as_str().unwrap_or("");
    let name = body["name"].as_str().unwrap_or("");
    if store_id.is_empty() || name.is_empty() {
        return err(400, "Store ID and name are required");
    }
    let id = entity_id(&body);
    let res = ctx.conn.execute(
        "INSERT INTO expense_categories (id, store_id, name, description) VALUES (?1,?2,?3,?4)",
        rusqlite::params![id, store_id, name, body["description"].as_str().unwrap_or("")],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            resp["isActive"] = json!(true);
            resp["createdAt"] = json!(now_ts());
            created(resp)
        }
        Err(_) => err(500, "Failed to create expense category"),
    }
}

/// PUT /api/expense-categories/:id
pub fn update_expense_category(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let res = ctx.conn.execute(
        "UPDATE expense_categories SET name = ?1, description = ?2 WHERE id = ?3",
        rusqlite::params![
            body["name"].as_str().unwrap_or(""),
            body["description"].as_str().unwrap_or(""),
            id,
        ],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            ok(resp)
        }
        Err(_) => err(500, "Failed to update expense category"),
    }
}

/// DELETE /api/expense-categories/:id
pub fn delete_expense_category(ctx: &mut Ctx, id: &str) -> ApiResponse {
    match ctx
        .conn
        .execute("UPDATE expense_categories SET is_active = 0 WHERE id = ?1", [id])
    {
        Ok(_) => ok(json!({ "message": "Expense category deleted successfully" })),
        Err(_) => err(500, "Failed to delete expense category"),
    }
}

// ==========================================
// EXPENSES
// ==========================================

fn expense_json(r: &rusqlite::Row) -> Result<Value, rusqlite::Error> {
    let attachments_raw: String = r.get::<_, Option<String>>(11)?.unwrap_or_default();
    let attachments: Value = serde_json::from_str(&attachments_raw).unwrap_or(json!([]));
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "storeId": r.get::<_, String>(1)?,
        "categoryId": r.get::<_, Option<String>>(2)?.unwrap_or_default(),
        "categoryName": r.get::<_, Option<String>>(3)?.unwrap_or_default(),
        "title": r.get::<_, String>(4)?,
        "description": r.get::<_, Option<String>>(5)?.unwrap_or_default(),
        "amount": r.get::<_, f64>(6)?,
        "expenseDate": r.get::<_, String>(7)?,
        "paymentMethod": r.get::<_, Option<String>>(8)?.unwrap_or_default(),
        "receiptNumber": r.get::<_, Option<String>>(9)?.unwrap_or_default(),
        "vendor": r.get::<_, Option<String>>(10)?.unwrap_or_default(),
        "attachments": attachments,
        "isActive": r.get::<_, i64>(12).map(|v| v != 0)?,
        "createdAt": r.get::<_, Option<String>>(13)?.unwrap_or_default(),
        "updatedAt": r.get::<_, Option<String>>(14)?.unwrap_or_default(),
        "createdBy": r.get::<_, Option<String>>(15)?.unwrap_or_default(),
    }))
}

const EXPENSE_COLS: &str =
    "e.id, e.store_id, e.category_id, ec.name as category_name, e.title, e.description, \
     e.amount, e.expense_date, e.payment_method, e.receipt_number, e.vendor, \
     e.attachments, e.is_active, e.created_at, e.updated_at, e.created_by";

/// GET /api/expenses?storeId=&startDate=&endDate=
pub fn get_expenses(ctx: &mut Ctx, store_id: &str, start: &str, end: &str) -> ApiResponse {
    if store_id.is_empty() {
        return err(400, "Store ID is required");
    }
    let mut sql = format!(
        "SELECT {} FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.store_id = ?1 AND e.is_active = 1",
        EXPENSE_COLS
    );
    let mut args: Vec<String> = vec![store_id.to_string()];
    let mut idx = 2;
    if !start.is_empty() {
        sql += &format!(" AND e.expense_date >= ?{}", idx);
        args.push(start.to_string());
        idx += 1;
    }
    if !end.is_empty() {
        sql += &format!(" AND e.expense_date <= ?{}", idx);
        args.push(end.to_string());
    }
    sql += " ORDER BY e.expense_date DESC";

    let mut stmt = match ctx.conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return err(500, "Failed to fetch expenses"),
    };
    let expenses: Vec<Value> =
        match stmt.query_map(rusqlite::params_from_iter(args.iter()), expense_json) {
            Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
            Err(e) => return err(500, e.to_string()),
        };
    ok(json!(expenses))
}

/// GET /api/expenses/:id
pub fn get_expense(ctx: &mut Ctx, id: &str) -> ApiResponse {
    let sql = format!(
        "SELECT {} FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.id = ?1",
        EXPENSE_COLS
    );
    match ctx
        .conn
        .query_row(&sql, [id], |r| expense_json(r))
        .optional()
    {
        Ok(Some(e)) => ok(e),
        Ok(None) => err(404, "Expense not found"),
        Err(_) => err(500, "Failed to fetch expense"),
    }
}

/// POST /api/expenses
pub fn create_expense(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let store_id = body["storeId"].as_str().unwrap_or("");
    let title = body["title"].as_str().unwrap_or("");
    let amount = body["amount"].as_f64().unwrap_or(0.0);
    if store_id.is_empty() || title.is_empty() || amount == 0.0 {
        return err(400, "Store ID, title, and amount are required");
    }

    let expense_date = {
        let d = body["expenseDate"].as_str().unwrap_or("");
        if d.is_empty() { now_ts() } else { d.to_string() }
    };
    let id = entity_id(&body);
    let attachments = if body["attachments"].is_array() {
        body["attachments"].to_string()
    } else {
        "[]".to_string()
    };
    let category: Option<String> = body["categoryId"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let pay: Option<String> = body["paymentMethod"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let receipt: Option<String> = body["receiptNumber"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let vendor: Option<String> = body["vendor"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let created_by = body["createdBy"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| claims.id.clone());

    let res = ctx.conn.execute(
        "INSERT INTO expenses (id, store_id, category_id, title, description, amount, expense_date, payment_method, receipt_number, vendor, attachments, created_by)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        rusqlite::params![
            id, store_id, category, title,
            body["description"].as_str().unwrap_or(""),
            amount, expense_date, pay, receipt, vendor, attachments, created_by,
        ],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            resp["isActive"] = json!(true);
            let now = now_ts();
            resp["createdAt"] = json!(now);
            resp["updatedAt"] = json!(now);
            resp["expenseDate"] = json!(expense_date);
            resp["createdBy"] = json!(created_by);
            created(resp)
        }
        Err(_) => err(500, "Failed to create expense"),
    }
}

/// PUT /api/expenses/:id
pub fn update_expense(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let attachments = if body["attachments"].is_array() {
        body["attachments"].to_string()
    } else {
        "[]".to_string()
    };
    let category: Option<String> = body["categoryId"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let pay: Option<String> = body["paymentMethod"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let receipt: Option<String> = body["receiptNumber"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let vendor: Option<String> = body["vendor"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);

    let res = ctx.conn.execute(
        "UPDATE expenses SET category_id = ?1, title = ?2, description = ?3, amount = ?4,
         expense_date = ?5, payment_method = ?6, receipt_number = ?7, vendor = ?8,
         attachments = ?9, updated_at = ?10 WHERE id = ?11",
        rusqlite::params![
            category,
            body["title"].as_str().unwrap_or(""),
            body["description"].as_str().unwrap_or(""),
            body["amount"].as_f64().unwrap_or(0.0),
            body["expenseDate"].as_str().unwrap_or(""),
            pay, receipt, vendor, attachments, now_ts(), id,
        ],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            resp["updatedAt"] = json!(now_ts());
            ok(resp)
        }
        Err(_) => err(500, "Failed to update expense"),
    }
}

/// DELETE /api/expenses/:id
pub fn delete_expense(ctx: &mut Ctx, id: &str) -> ApiResponse {
    match ctx
        .conn
        .execute("UPDATE expenses SET is_active = 0 WHERE id = ?1", [id])
    {
        Ok(_) => ok(json!({ "message": "Expense deleted successfully" })),
        Err(_) => err(500, "Failed to delete expense"),
    }
}

// ==========================================
// REPORTS
// ==========================================

/// GET /api/expenses/report/by-category
pub fn report_by_category(ctx: &mut Ctx, store_id: &str, start: &str, end: &str) -> ApiResponse {
    if store_id.is_empty() {
        return err(400, "Store ID is required");
    }
    let mut sql = String::from(
        "SELECT ec.id, ec.name,
                COALESCE(SUM(e.amount), 0), COUNT(e.id)
         FROM expense_categories ec
         LEFT JOIN expenses e ON ec.id = e.category_id AND e.store_id = ?1 AND e.is_active = 1",
    );
    let mut args: Vec<String> = vec![store_id.to_string()];
    let mut idx = 2;
    if !start.is_empty() {
        // In Go the date filter sits inside the LEFT JOIN ON clause — replicate
        // with a filtered LEFT JOIN via a subquery-friendly predicate.
        sql = String::from(
            "SELECT ec.id, ec.name,
                    COALESCE(SUM(e.amount), 0), COUNT(e.id)
             FROM expense_categories ec
             LEFT JOIN expenses e ON ec.id = e.category_id AND e.store_id = ?1 AND e.is_active = 1
                AND (e.expense_date IS NULL OR e.expense_date >= ?2)",
        );
        args.push(start.to_string());
        idx += 1;
    }
    if !end.is_empty() {
        if start.is_empty() {
            sql = String::from(
                "SELECT ec.id, ec.name,
                        COALESCE(SUM(e.amount), 0), COUNT(e.id)
                 FROM expense_categories ec
                 LEFT JOIN expenses e ON ec.id = e.category_id AND e.store_id = ?1 AND e.is_active = 1
                    AND (e.expense_date IS NULL OR e.expense_date <= ?2)",
            );
        } else {
            sql += &format!(" AND (e.expense_date IS NULL OR e.expense_date <= ?{})", idx);
        }
        args.push(end.to_string());
    }
    sql += " WHERE ec.store_id = ?1 AND ec.is_active = 1 GROUP BY ec.id, ec.name ORDER BY 3 DESC";

    let mut stmt = match ctx.conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return err(500, "Failed to fetch expense report"),
    };
    let reports: Vec<Value> = match stmt
        .query_map(rusqlite::params_from_iter(args.iter()), |r| {
            Ok(json!({
                "categoryId": r.get::<_, String>(0)?,
                "categoryName": r.get::<_, String>(1)?,
                "totalAmount": r.get::<_, f64>(2)?,
                "expenseCount": r.get::<_, i64>(3)?,
            }))
        }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    ok(json!(reports))
}

/// GET /api/expenses/report/by-date
pub fn summary_by_date(ctx: &mut Ctx, store_id: &str, start: &str, end: &str) -> ApiResponse {
    if store_id.is_empty() {
        return err(400, "Store ID is required");
    }
    let mut sql = String::from(
        "SELECT substr(e.expense_date, 1, 10) as date,
                COALESCE(SUM(e.amount), 0), COUNT(e.id)
         FROM expenses e
         WHERE e.store_id = ?1 AND e.is_active = 1",
    );
    let mut args: Vec<String> = vec![store_id.to_string()];
    let mut idx = 2;
    if !start.is_empty() {
        sql += &format!(" AND e.expense_date >= ?{}", idx);
        args.push(start.to_string());
        idx += 1;
    }
    if !end.is_empty() {
        sql += &format!(" AND e.expense_date <= ?{}", idx);
        args.push(end.to_string());
    }
    sql += " GROUP BY substr(e.expense_date, 1, 10) ORDER BY date DESC";

    let mut stmt = match ctx.conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return err(500, "Failed to fetch expense summary"),
    };
    let summaries: Vec<Value> = match stmt
        .query_map(rusqlite::params_from_iter(args.iter()), |r| {
            Ok(json!({
                "date": r.get::<_, String>(0)?,
                "totalAmount": r.get::<_, f64>(1)?,
                "expenseCount": r.get::<_, i64>(2)?,
            }))
        }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    ok(json!(summaries))
}

/// GET /api/reports/revenue
pub fn revenue_report(ctx: &mut Ctx, store_id: &str, start: &str, end: &str) -> ApiResponse {
    if store_id.is_empty() {
        return err(400, "Store ID is required");
    }
    let conn = &ctx.conn;

    // Date filters for bills (generated_at) and orders (created_at) use
    // substr(...,1,10) in place of DATE().
    let bill_filter = |col: &str| -> (String, Vec<String>) {
        let mut f = String::new();
        let mut args = Vec::new();
        let mut idx = 2;
        if !start.is_empty() {
            f += &format!(" AND substr({}, 1, 10) >= ?{}", col, idx);
            args.push(start.to_string());
            idx += 1;
        }
        if !end.is_empty() {
            f += &format!(" AND substr({}, 1, 10) <= ?{}", col, idx);
            args.push(end.to_string());
        }
        (f, args)
    };

    // Total revenue + bill count
    let (bf, mut bargs) = bill_filter("b.generated_at");
    let rev_sql = format!(
        "SELECT COALESCE(SUM(b.total), 0), COUNT(b.id) FROM bills b
         WHERE b.store_id = ?1 AND (b.status IS NULL OR b.status = 'active'){}",
        bf
    );
    let mut all_args: Vec<String> = vec![store_id.to_string()];
    all_args.append(&mut bargs);
    let (total_revenue, total_bills): (f64, i64) = match conn.query_row(
        &rev_sql,
        rusqlite::params_from_iter(all_args.iter()),
        |r| Ok((r.get(0)?, r.get(1)?)),
    ) {
        Ok(v) => v,
        Err(e) => return err(500, e.to_string()),
    };

    // Total expenses
    let (ef, mut eargs) = bill_filter("e.expense_date");
    let exp_sql = format!(
        "SELECT COALESCE(SUM(e.amount), 0), COUNT(e.id) FROM expenses e
         WHERE e.store_id = ?1 AND e.is_active = 1{}",
        ef
    );
    let mut exp_args: Vec<String> = vec![store_id.to_string()];
    exp_args.append(&mut eargs);
    let (total_expenses, total_expense_count): (f64, i64) = match conn.query_row(
        &exp_sql,
        rusqlite::params_from_iter(exp_args.iter()),
        |r| Ok((r.get(0)?, r.get(1)?)),
    ) {
        Ok(v) => v,
        Err(e) => return err(500, e.to_string()),
    };

    // Completed orders count
    let (of, mut oargs) = bill_filter("o.created_at");
    let ord_sql = format!(
        "SELECT COUNT(o.id) FROM orders o WHERE o.store_id = ?1 AND o.status = 'completed'{}",
        of
    );
    let mut ord_args: Vec<String> = vec![store_id.to_string()];
    ord_args.append(&mut oargs);
    let total_orders: i64 = conn
        .query_row(&ord_sql, rusqlite::params_from_iter(ord_args.iter()), |r| {
            r.get(0)
        })
        .unwrap_or(0);

    let net_profit = total_revenue - total_expenses;
    let avg_order_value = if total_orders > 0 {
        total_revenue / total_orders as f64
    } else {
        0.0
    };

    // Bills list (no status column in this query — mirrors Go).
    let (lbf, mut lbargs) = bill_filter("b.generated_at");
    let bills_sql = format!(
        "SELECT {} FROM bills b WHERE b.store_id = ?1 AND (b.status IS NULL OR b.status = 'active'){}
         ORDER BY b.generated_at DESC",
        rows::BILL_COLS_NO_STATUS, lbf
    );
    let mut bill_args: Vec<String> = vec![store_id.to_string()];
    bill_args.append(&mut lbargs);
    let mut stmt = match conn.prepare(&bills_sql) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let mut bills: Vec<Value> = match stmt
        .query_map(rusqlite::params_from_iter(bill_args.iter()), |r| {
            Ok(rows::bill_json(r, vec![], false))
        }) {
        Ok(rs) => rs.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    drop(stmt);
    attach_bill_items(conn, &mut bills);

    // Expenses list
    let (lef, mut leargs) = bill_filter("e.expense_date");
    let exp_list_sql = format!(
        "SELECT {} FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.store_id = ?1 AND e.is_active = 1{} ORDER BY e.expense_date DESC",
        EXPENSE_COLS, lef
    );
    let mut exp_list_args: Vec<String> = vec![store_id.to_string()];
    exp_list_args.append(&mut leargs);
    let mut stmt = match conn.prepare(&exp_list_sql) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let expenses: Vec<Value> = match stmt
        .query_map(rusqlite::params_from_iter(exp_list_args.iter()), expense_json)
    {
        Ok(rs) => rs.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };

    ok(json!({
        "periodStart": start,
        "periodEnd": end,
        "totalRevenue": total_revenue,
        "totalExpenses": total_expenses,
        "netProfit": net_profit,
        "totalOrders": total_orders,
        "totalBills": total_bills,
        "totalExpenseCount": total_expense_count,
        "averageOrderValue": avg_order_value,
        "bills": bills,
        "expenses": expenses,
    }))
}

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
