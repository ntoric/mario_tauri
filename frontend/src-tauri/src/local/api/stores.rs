use rusqlite::OptionalExtension;
use serde_json::{json, Value};

use super::rows;
use super::{created, err, json_to_sql, ok, now_ts, entity_id, ApiResponse, Ctx};

/// GET /api/stores/default (public)
pub fn get_default_store(ctx: &mut Ctx) -> ApiResponse {
    let store = ctx
        .conn
        .query_row(
            "SELECT id, name, branch, location, logo_url FROM stores WHERE is_active = 1 ORDER BY created_at LIMIT 1",
            [],
            |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "name": r.get::<_, String>(1)?,
                    "branch": r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    "logoUrl": r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                }))
            },
        )
        .optional();

    match store {
        Ok(Some(s)) => ok(s),
        Ok(None) => err(404, "No stores found"),
        Err(e) => err(500, e.to_string()),
    }
}

/// GET /api/stores
pub fn get_stores(ctx: &mut Ctx) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    match rows::stores_for_role(&ctx.conn, &claims.role, &claims.id, &claims.store_id) {
        Ok(stores) => ok(json!(stores)),
        Err(e) => err(500, e.to_string()),
    }
}

/// GET /api/stores/:id
pub fn get_store(ctx: &mut Ctx, id: &str) -> ApiResponse {
    match rows::get_store(&ctx.conn, id) {
        Ok(Some(s)) => ok(s),
        Ok(None) => err(404, "Store not found"),
        Err(e) => err(500, e.to_string()),
    }
}

/// POST /api/stores
pub fn create_store(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    if claims.role != "superadmin" && claims.role != "business_owner" {
        return err(403, "Not authorized");
    }

    let id = entity_id(&body);
    let g = |k: &str| body[k].as_str().unwrap_or("").to_string();
    // taxEnabled defaults to true unless explicitly provided (mirrors Go).
    let tax_enabled = if body.get("taxEnabled").is_some() {
        body["taxEnabled"].as_bool().unwrap_or(true)
    } else {
        true
    };
    let invoice_size = {
        let v = g("invoiceSize");
        if v.is_empty() { "3inch".to_string() } else { v }
    };

    let res = ctx.conn.execute(
        "INSERT INTO stores (id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, tax_enabled, default_tax_percent, is_active)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,1)",
        rusqlite::params![
            id,
            g("name"),
            g("branch"),
            g("location"),
            g("gstin"),
            g("fssaiNo"),
            g("phone"),
            g("printerName"),
            g("printerVendorId"),
            g("printerProductId"),
            invoice_size,
            body["kotPrintEnabled"].as_bool().unwrap_or(true) as i64,
            body["remoteBillingEnabled"].as_bool().unwrap_or(false) as i64,
            tax_enabled as i64,
            body["defaultTaxPercent"].as_f64().unwrap_or(0.0),
        ],
    );
    if let Err(e) = res {
        return err(500, e.to_string());
    }

    // Auto-assign the new store to a business owner.
    if claims.role == "business_owner" {
        let assign = ctx.conn.execute(
            "DELETE FROM user_stores WHERE user_id = ?1",
            [&claims.id],
        );
        if let Err(e) = assign {
            return created(json!({
                "id": id,
                "name": g("name"),
                "warning": format!("Failed to auto-assign store to business owner under user_stores: {}", e),
            }));
        }
        if let Err(e) = ctx.conn.execute(
            "INSERT OR IGNORE INTO user_stores (user_id, store_id) VALUES (?1, ?2)",
            [&claims.id, &id],
        ) {
            return created(json!({
                "id": id,
                "name": g("name"),
                "warning": format!("Failed to auto-assign store to business owner under user_stores: {}", e),
            }));
        }
    }

    let mut store = rows::get_store(&ctx.conn, &id).ok().flatten().unwrap_or_else(|| {
        json!({ "id": id, "name": g("name") })
    });
    store["id"] = json!(id);
    created(store)
}

/// PUT /api/stores/:id
pub fn update_store(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };

    // Permission check (mirrors Go).
    match claims.role.as_str() {
        "business_owner" => {
            let owned = rows::user_stores(&ctx.conn, &claims.id)
                .map(|stores| stores.iter().any(|s| s["id"].as_str() == Some(id)))
                .unwrap_or(false);
            if !owned {
                return err(403, "Not authorized");
            }
        }
        "business_admin" | "staff" => {
            if claims.store_id != id {
                return err(403, "Not authorized to update this store");
            }
        }
        "superadmin" => {}
        _ => return err(403, "Not authorized"),
    }

    let key_mapping = [
        ("name", "name"),
        ("branch", "branch"),
        ("location", "location"),
        ("gstin", "gstin"),
        ("fssaiNo", "fssai_no"),
        ("phone", "phone"),
        ("printerName", "printer_name"),
        ("printerVendorId", "printer_vendor_id"),
        ("printerProductId", "printer_product_id"),
        ("invoiceSize", "invoice_size"),
        ("kotPrintEnabled", "kot_print_enabled"),
        ("remoteBillingEnabled", "remote_billing_enabled"),
        ("isActive", "is_active"),
        ("themeColor", "theme_color"),
        ("taxEnabled", "tax_enabled"),
        ("defaultTaxPercent", "default_tax_percent"),
    ];

    let mut sets: Vec<String> = Vec::new();
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    let mut idx = 1;
    for (json_key, col) in key_mapping {
        if let Some(v) = body.get(json_key) {
            if v.is_null() {
                continue;
            }
            sets.push(format!("{} = ?{}", col, idx));
            idx += 1;
            args.push(json_to_sql(v));
        }
    }

    if !sets.is_empty() {
        let sql = format!(
            "UPDATE stores SET {}, updated_at = ?{} WHERE id = ?{}",
            sets.join(", "),
            idx,
            idx + 1
        );
        args.push(rusqlite::types::Value::Text(now_ts()));
        args.push(rusqlite::types::Value::Text(id.to_string()));
        if let Err(e) = ctx
            .conn
            .execute(&sql, rusqlite::params_from_iter(args.iter()))
        {
            return err(500, e.to_string());
        }
    }

    ok(json!({ "message": "Store updated" }))
}

/// DELETE /api/stores/:id
pub fn delete_store(ctx: &mut Ctx, id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    if claims.role != "superadmin" {
        return err(403, "Not authorized");
    }
    match ctx.conn.execute("DELETE FROM stores WHERE id = ?1", [id]) {
        Ok(_) => ok(json!({ "message": "Store deleted" })),
        Err(e) => err(500, e.to_string()),
    }
}

/// POST /api/stores/switch
pub fn switch_store(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let store_id = body["storeId"].as_str().unwrap_or("");

    let has_access = match claims.role.as_str() {
        "superadmin" => true,
        "business_owner" => rows::user_stores(&ctx.conn, &claims.id)
            .map(|stores| stores.iter().any(|s| s["id"].as_str() == Some(store_id)))
            .unwrap_or(false),
        _ => claims.store_id == store_id,
    };

    if !has_access {
        return err(403, "Access denied to this store");
    }

    match rows::get_store(&ctx.conn, store_id) {
        Ok(Some(s)) => ok(json!({ "store": s })),
        Ok(None) => err(404, "Store not found"),
        Err(e) => err(500, e.to_string()),
    }
}

/// POST /api/stores/:id/logo
pub fn upload_logo(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let logo = body["logoBase64"].as_str().unwrap_or("");
    if logo.is_empty() {
        return err(400, "Logo data is required");
    }
    if let Some(r) = check_logo_perm(ctx, &claims, id) {
        return r;
    }

    match ctx.conn.execute(
        "UPDATE stores SET logo_url = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![logo, now_ts(), id],
    ) {
        Ok(_) => ok(json!({ "success": true, "logoUrl": logo })),
        Err(e) => err(500, e.to_string()),
    }
}

/// DELETE /api/stores/:id/logo
pub fn delete_logo(ctx: &mut Ctx, id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    if let Some(r) = check_logo_perm(ctx, &claims, id) {
        return r;
    }
    match ctx.conn.execute(
        "UPDATE stores SET logo_url = NULL, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now_ts(), id],
    ) {
        Ok(_) => ok(json!({ "success": true })),
        Err(e) => err(500, e.to_string()),
    }
}

fn check_logo_perm(
    ctx: &mut Ctx,
    claims: &crate::local::auth::Claims,
    id: &str,
) -> Option<ApiResponse> {
    match claims.role.as_str() {
        "business_owner" => {
            let owned = rows::user_stores(&ctx.conn, &claims.id)
                .map(|stores| stores.iter().any(|s| s["id"].as_str() == Some(id)))
                .unwrap_or(false);
            if !owned {
                return Some(err(403, "Not authorized"));
            }
        }
        "superadmin" | "business_admin" | "staff" => {}
        _ => return Some(err(403, "Not authorized")),
    }
    None
}
