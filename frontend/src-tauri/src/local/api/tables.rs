use rusqlite::OptionalExtension;
use serde_json::{json, Value};

use super::{broadcast_table_status, created, err, ok, target_store, entity_id, ApiResponse, Ctx};

fn table_json(r: &rusqlite::Row) -> Result<Value, rusqlite::Error> {
    let mut t = json!({
        "id": r.get::<_, String>(0)?,
        "storeId": r.get::<_, String>(1)?,
        "number": r.get::<_, i64>(2)?,
        "seats": r.get::<_, i64>(3)?,
        "position": {
            "x": r.get::<_, i64>(4)?,
            "y": r.get::<_, i64>(5)?,
        },
        "isActive": r.get::<_, i64>(6).map(|v| v != 0)?,
    });
    if let Some(section) = r.get::<_, Option<String>>(7)? {
        t["section"] = json!(section);
    }
    Ok(t)
}

const TABLE_COLS: &str = "id, store_id, number, seats, position_x, position_y, is_active, section";

/// GET /api/tables?storeId=
pub fn get_tables(ctx: &mut Ctx, store_id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let mut stmt = match ctx.conn.prepare(&format!(
        "SELECT {} FROM tables WHERE store_id = ?1 AND is_active = 1 ORDER BY number",
        TABLE_COLS
    )) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let tables: Vec<Value> = match stmt.query_map([&target], table_json) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    ok(json!(tables))
}

/// POST /api/tables
pub fn create_table(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let id = entity_id(&body);
    let section: Option<String> = body["section"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let res = ctx.conn.execute(
        "INSERT INTO tables (id, store_id, number, seats, position_x, position_y, section)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        rusqlite::params![
            id,
            target,
            body["number"].as_i64().unwrap_or(0),
            body["seats"].as_i64().unwrap_or(0),
            body["position"]["x"].as_i64().unwrap_or(0),
            body["position"]["y"].as_i64().unwrap_or(0),
            section,
        ],
    );
    match res {
        Ok(_) => {
            // Mirror Go: returns the request object with server-assigned fields.
            let mut resp = body.clone();
            resp["id"] = json!(id);
            resp["storeId"] = json!(target);
            resp["isActive"] = json!(true);
            broadcast_table_status(ctx, &target, "table_created");
            created(resp)
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// PUT /api/tables/:id
pub fn update_table(ctx: &mut Ctx, id: &str, body: Value) -> ApiResponse {
    let section: Option<String> = body["section"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from);
    let res = ctx.conn.execute(
        "UPDATE tables SET number = ?1, seats = ?2, position_x = ?3, position_y = ?4, section = ?5 WHERE id = ?6",
        rusqlite::params![
            body["number"].as_i64().unwrap_or(0),
            body["seats"].as_i64().unwrap_or(0),
            body["position"]["x"].as_i64().unwrap_or(0),
            body["position"]["y"].as_i64().unwrap_or(0),
            section,
            id,
        ],
    );
    match res {
        Ok(_) => {
            let mut resp = body.clone();
            resp["id"] = json!(id);
            let store_id = body["storeId"].as_str().unwrap_or("").to_string();
            broadcast_table_status(ctx, &store_id, "table_updated");
            ok(resp)
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// DELETE /api/tables/:id (hard delete, as in Go)
pub fn delete_table(ctx: &mut Ctx, id: &str) -> ApiResponse {
    let store_id: Option<String> = ctx
        .conn
        .query_row("SELECT store_id FROM tables WHERE id = ?1", [id], |r| r.get(0))
        .optional()
        .ok()
        .flatten();

    match ctx.conn.execute("DELETE FROM tables WHERE id = ?1", [id]) {
        Ok(_) => {
            if let Some(sid) = store_id {
                broadcast_table_status(ctx, &sid, "table_deleted");
            }
            ok(json!({ "message": "Table deleted" }))
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// GET /api/tables/sections?storeId=
pub fn get_sections(ctx: &mut Ctx, store_id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let mut stmt = match ctx.conn.prepare(
        "SELECT id, store_id, name, created_at FROM table_sections WHERE store_id = ?1 ORDER BY name",
    ) {
        Ok(s) => s,
        Err(e) => return err(500, e.to_string()),
    };
    let sections: Vec<Value> = match stmt.query_map([&target], |r| {
        Ok(json!({
            "id": r.get::<_, String>(0)?,
            "storeId": r.get::<_, String>(1)?,
            "name": r.get::<_, String>(2)?,
            "createdAt": r.get::<_, Option<String>>(3)?.unwrap_or_default(),
        }))
    }) {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(e) => return err(500, e.to_string()),
    };
    ok(json!(sections))
}

/// POST /api/tables/sections
pub fn create_section(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let name = body["name"].as_str().unwrap_or("");
    if name.is_empty() {
        return err(400, "Section name is required");
    }
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let res = ctx.conn.execute(
        "INSERT INTO table_sections (id, store_id, name) VALUES (?1, ?2, ?3)
         ON CONFLICT (store_id, name) DO NOTHING",
        rusqlite::params![entity_id(&body), target, name],
    );
    match res {
        Ok(_) => {
            broadcast_table_status(ctx, &target, "table_updated");
            created(json!({ "message": "Section created", "name": name }))
        }
        Err(e) => err(500, e.to_string()),
    }
}

/// PUT /api/tables/sections/rename
pub fn rename_section(ctx: &mut Ctx, body: Value) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    let new_name = body["newName"].as_str().unwrap_or("");
    if new_name.is_empty() {
        return err(400, "New section name is required");
    }
    let old_name = body["oldName"].as_str().unwrap_or("");
    let target = match target_store(&claims, body["storeId"].as_str().unwrap_or("")) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let tx = match ctx.conn.transaction() {
        Ok(t) => t,
        Err(e) => return err(500, e.to_string()),
    };
    if let Err(e) = tx.execute(
        "UPDATE tables SET section = ?1 WHERE store_id = ?2 AND COALESCE(section, '') = COALESCE(?3, '')",
        rusqlite::params![new_name, target, old_name],
    ) {
        return err(500, e.to_string());
    }
    if !old_name.is_empty() {
        if let Err(e) = tx.execute(
            "UPDATE table_sections SET name = ?1 WHERE store_id = ?2 AND name = ?3",
            rusqlite::params![new_name, target, old_name],
        ) {
            return err(500, e.to_string());
        }
    }
    if let Err(e) = tx.commit() {
        return err(500, e.to_string());
    }

    broadcast_table_status(ctx, &target, "table_updated");
    ok(json!({ "message": "Section renamed" }))
}

/// DELETE /api/tables/sections/:name?storeId=
pub fn delete_section(ctx: &mut Ctx, name: &str, store_id: &str) -> ApiResponse {
    let claims = match ctx.claims() {
        Ok(c) => c.clone(),
        Err(r) => return r,
    };
    if name.is_empty() {
        return err(400, "Section name required");
    }
    let target = match target_store(&claims, store_id) {
        Ok(t) => t,
        Err(r) => return r,
    };

    let tx = match ctx.conn.transaction() {
        Ok(t) => t,
        Err(e) => return err(500, e.to_string()),
    };
    if let Err(e) = tx.execute(
        "UPDATE tables SET section = NULL WHERE store_id = ?1 AND COALESCE(section, '') = COALESCE(?2, '')",
        rusqlite::params![target, name],
    ) {
        return err(500, e.to_string());
    }
    if let Err(e) = tx.execute(
        "DELETE FROM table_sections WHERE store_id = ?1 AND name = ?2",
        rusqlite::params![target, name],
    ) {
        return err(500, e.to_string());
    }
    if let Err(e) = tx.commit() {
        return err(500, e.to_string());
    }

    broadcast_table_status(ctx, &target, "table_updated");
    ok(json!({ "message": "Section deleted" }))
}
