use serde_json::{json, Value};

use super::{entity_id, err, ok, now_ts, ApiResponse, Ctx};
use crate::local::auth::Claims;
use crate::local::LocalBackend;

const GEMINI_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL: &str = "gemini-2.0-flash";

const MENU_PARSE_PROMPT: &str = r#"You are a menu parser. Analyze the provided menu image or PDF and extract every category, item and price exactly as printed.

Return ONLY a JSON object with this exact structure and nothing else (no markdown, no code fences, no commentary):
{
  "categories": [
    {
      "name": "<category name as printed, or 'Uncategorized' if none>",
      "description": "<short category description if present, otherwise empty string>",
      "items": [
        {
          "name": "<item name as printed>",
          "description": "<item description/subtitle if present, otherwise empty string>",
          "price": <numeric price as a number, 0 if not priced>,
          "hsnCode": "<HSN/SAC code if present, otherwise empty string>",
          "taxPercent": <tax percent as a number if present, otherwise 0>
        }
      ]
    }
  ]
}

Rules:
- Always include the "categories" array even if there is only one category.
- If the menu has no explicit categories, put all items under a single category named "Uncategorized".
- Prices must be numbers (e.g. 120, 99.5), never strings. Strip currency symbols.
- Group items under the category they belong to. Do not duplicate items.
- Preserve original spelling and casing of names.
- Do not invent data that is not in the menu."#;

fn superadmin_ctx(ctx: &mut Ctx) -> Result<(), ApiResponse> {
    let claims = ctx.claims()?;
    if claims.role != "superadmin" {
        return Err(err(403, "Access denied. Superadmin role required."));
    }
    Ok(())
}

fn superadmin_claims(claims: &Option<Claims>) -> Result<(), ApiResponse> {
    match claims {
        Some(c) if c.role == "superadmin" => Ok(()),
        Some(_) => Err(err(403, "Access denied. Superadmin role required.")),
        None => Err(err(401, "Unauthorized")),
    }
}

fn gemini_get(conn: &rusqlite::Connection) -> (String, String) {
    let mut api_key = String::new();
    let mut model = String::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT key, value FROM global_settings WHERE key IN ('gemini_api_key', 'gemini_model')",
    ) {
        if let Ok(rows) = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        }) {
            for (k, v) in rows.flatten() {
                match k.as_str() {
                    "gemini_api_key" => api_key = v,
                    "gemini_model" => model = v,
                    _ => {}
                }
            }
        }
    }
    (api_key, model)
}

/// GET /api/system/gemini-config (superadmin)
pub fn get_gemini_config(ctx: &mut Ctx) -> ApiResponse {
    if let Err(r) = superadmin_ctx(ctx) {
        return r;
    }
    let (api_key, mut model) = gemini_get(&ctx.conn);
    if model.is_empty() {
        model = DEFAULT_GEMINI_MODEL.to_string();
    }
    ok(json!({ "apiKey": api_key, "model": model }))
}

/// POST /api/system/gemini-config (superadmin)
pub fn update_gemini_config(ctx: &mut Ctx, body: Value) -> ApiResponse {
    if let Err(r) = superadmin_ctx(ctx) {
        return r;
    }
    let api_key = body["apiKey"].as_str().unwrap_or("").trim().to_string();
    let mut model = body["model"].as_str().unwrap_or("").trim().to_string();
    if let Some(stripped) = model.strip_prefix("models/") {
        model = stripped.to_string();
    }
    if model.is_empty() {
        model = DEFAULT_GEMINI_MODEL.to_string();
    }

    for (k, v) in [("gemini_api_key", &api_key), ("gemini_model", &model)] {
        if let Err(e) = ctx.conn.execute(
            "INSERT INTO global_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ?3",
            rusqlite::params![k, v, now_ts()],
        ) {
            return err(500, e.to_string());
        }
    }

    ok(json!({
        "message": "Gemini configuration saved successfully",
        "config": { "apiKey": api_key, "model": model },
    }))
}

/// GET /api/system/gemini-models (superadmin) — network call to Gemini.
pub async fn list_gemini_models(
    state: &LocalBackend,
    claims: Option<Claims>,
) -> ApiResponse {
    if let Err(r) = superadmin_claims(&claims) {
        return r;
    }
    let api_key = {
        let conn = state.conn.lock().unwrap();
        gemini_get(&conn).0
    };
    if api_key.is_empty() {
        return err(400, "Gemini API key is not configured. Save an API key first.");
    }

    let url = format!("{}/models?key={}", GEMINI_BASE_URL, api_key);
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
    {
        Ok(c) => c,
        Err(e) => return err(502, format!("Failed to contact Gemini API: {}", e)),
    };
    let resp = match client.get(&url).header("Accept", "application/json").send().await {
        Ok(r) => r,
        Err(e) => return err(502, format!("Failed to contact Gemini API: {}", e)),
    };
    if resp.status().as_u16() != 200 {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let trimmed: String = body.chars().take(4096).collect();
        return err(502, format!("Gemini API returned {}: {}", status, trimmed.trim()));
    }

    let parsed: Value = match resp.json().await {
        Ok(v) => v,
        Err(_) => return err(500, "Failed to parse Gemini models response"),
    };

    // Keep only models that support generateContent.
    let filtered: Vec<Value> = parsed["models"]
        .as_array()
        .map(|models| {
            models
                .iter()
                .filter(|m| {
                    m["supportedGenerationMethods"]
                        .as_array()
                        .map(|ms| ms.iter().any(|x| x.as_str() == Some("generateContent")))
                        .unwrap_or(false)
                })
                .cloned()
                .collect()
        })
        .unwrap_or_default();

    ok(json!({ "models": filtered }))
}

/// Strip an optional data:<mime>;base64, prefix; default mime to image/jpeg.
fn normalize_image_data(raw: &str, mime_type: &str) -> (String, String) {
    let mut mt = mime_type.trim().to_string();
    let mut data = raw.to_string();
    if data.starts_with("data:") {
        if let Some(idx) = data.find(";base64,") {
            if mt.is_empty() {
                mt = data["data:".len()..idx].to_string();
            }
            data = data[idx + ";base64,".len()..].to_string();
        }
    }
    if mt.is_empty() {
        mt = "image/jpeg".to_string();
    }
    (mt, data)
}

/// POST /api/menu/parse (superadmin) — forwards images to Gemini.
pub async fn parse_menu(
    state: &LocalBackend,
    claims: Option<Claims>,
    body: Value,
) -> ApiResponse {
    if let Err(r) = superadmin_claims(&claims) {
        return r;
    }
    if body["storeId"].as_str().unwrap_or("").trim().is_empty() {
        return err(400, "storeId is required");
    }

    // Collect images: Images array takes precedence, then legacy single fields.
    let mut images: Vec<(String, String)> = Vec::new();
    if let Some(arr) = body["images"].as_array() {
        for img in arr {
            let (mt, data) = normalize_image_data(
                img["imageBase64"].as_str().unwrap_or(""),
                img["mimeType"].as_str().unwrap_or(""),
            );
            if !data.is_empty() {
                images.push((mt, data));
            }
        }
    }
    if images.is_empty() && body["imageBase64"].as_str().unwrap_or("") != "" {
        let (mt, data) = normalize_image_data(
            body["imageBase64"].as_str().unwrap_or(""),
            body["mimeType"].as_str().unwrap_or(""),
        );
        if !data.is_empty() {
            images.push((mt, data));
        }
    }
    if images.is_empty() {
        return err(400, "at least one imageBase64/images entry is required");
    }

    let (api_key, mut model) = {
        let conn = state.conn.lock().unwrap();
        gemini_get(&conn)
    };
    if api_key.is_empty() {
        return err(400, "Gemini API key is not configured. Set it in Developer Settings first.");
    }
    if model.is_empty() {
        model = DEFAULT_GEMINI_MODEL.to_string();
    }
    if let Some(stripped) = model.strip_prefix("models/") {
        model = stripped.to_string();
    }

    // Build the generateContent payload.
    let mut parts: Vec<Value> = vec![json!({ "text": MENU_PARSE_PROMPT })];
    for (mt, data) in &images {
        parts.push(json!({
            "inline_data": { "mime_type": mt, "data": data }
        }));
    }
    let payload = json!({
        "contents": [{ "parts": parts }],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0,
        },
    });

    let url = format!(
        "{}/models/{}:generateContent?key={}",
        GEMINI_BASE_URL, model, api_key
    );
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
    {
        Ok(c) => c,
        Err(e) => return err(502, format!("Gemini request failed: {}", e)),
    };
    let resp = match client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => return err(502, format!("Gemini request failed: {}", e)),
    };

    let status = resp.status().as_u16();
    let resp_text = resp.text().await.unwrap_or_default();
    if status != 200 {
        let trimmed: String = resp_text.chars().take(4096).collect();
        return err(502, format!("Gemini returned {}: {}", status, trimmed.trim()));
    }

    // Extract text from candidates[0].content.parts[*].text
    let parsed_resp: Value = serde_json::from_str(&resp_text).unwrap_or(Value::Null);
    let raw = if parsed_resp.is_null() {
        resp_text.clone()
    } else {
        let candidates = parsed_resp["candidates"].as_array();
        match candidates {
            Some(c) if !c.is_empty() => {
                let texts: Vec<String> = c[0]["content"]["parts"]
                    .as_array()
                    .map(|parts| {
                        parts
                            .iter()
                            .filter_map(|p| p["text"].as_str().map(String::from))
                            .filter(|t| !t.is_empty())
                            .collect()
                    })
                    .unwrap_or_default();
                texts.join("\n")
            }
            _ => {
                let block = parsed_resp["promptFeedback"]["blockReason"]
                    .as_str()
                    .unwrap_or("");
                if !block.is_empty() {
                    return err(502, format!("request blocked by Gemini: {}", block));
                }
                return err(502, "Gemini returned no candidates");
            }
        }
    };
    if raw.trim().is_empty() {
        return err(502, "Gemini returned an empty response");
    }

    // Parse the standardized menu JSON, tolerating markdown fences.
    match parse_menu_from_text(&raw) {
        Some(menu) => ok(json!({
            "menu": menu,
            "rawResponse": raw,
            "model": model,
        })),
        None => ok(json!({
            "menu": { "categories": [] },
            "rawResponse": raw,
            "model": model,
        })),
    }
}

/// Extract the first balanced { ... } JSON object, stripping markdown fences.
fn extract_json_object(s: &str) -> Option<String> {
    let mut s = s.trim().to_string();
    if s.starts_with("```") {
        if let Some(idx) = s.find('\n') {
            s = s[idx + 1..].trim().to_string();
        }
        if let Some(stripped) = s.strip_suffix("```") {
            s = stripped.trim().to_string();
        }
    }
    let bytes = s.as_bytes();
    let start = s.find('{')?;
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    for i in start..bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            if escape {
                escape = false;
                continue;
            }
            if c == '\\' {
                escape = true;
                continue;
            }
            if c == '"' {
                in_str = false;
            }
            continue;
        }
        match c {
            '"' => in_str = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(s[start..=i].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_menu_from_text(raw: &str) -> Option<Value> {
    let cleaned = extract_json_object(raw)?;
    let mut menu: Value = serde_json::from_str(&cleaned).ok()?;
    if !menu["categories"].is_array() {
        menu["categories"] = json!([]);
    }
    if let Some(cats) = menu["categories"].as_array_mut() {
        for cat in cats.iter_mut() {
            if !cat["items"].is_array() {
                cat["items"] = json!([]);
            }
        }
    }
    Some(menu)
}

fn norm_name(s: &str) -> String {
    s.trim().to_lowercase()
}

/// POST /api/menu/bulk (superadmin) — add / replace / merge import modes.
pub fn bulk_create_menu(ctx: &mut Ctx, body: Value) -> ApiResponse {
    if let Err(r) = superadmin_ctx(ctx) {
        return r;
    }
    let store_id = body["storeId"].as_str().unwrap_or("").trim().to_string();
    if store_id.is_empty() {
        return err(400, "storeId is required");
    }
    let categories = body["categories"].as_array().cloned().unwrap_or_default();

    let mut mode = body["mode"].as_str().unwrap_or("").to_string();
    if mode.is_empty() {
        mode = if body["replaceExisting"].as_bool().unwrap_or(false) {
            "replace".to_string()
        } else {
            "add".to_string()
        };
    }

    let resp = match mode.as_str() {
        "merge" => {
            let (cats_added, cats_reused, items_added, items_updated) =
                match bulk_merge(ctx, &store_id, &categories) {
                    Ok(v) => v,
                    Err(r) => return r,
                };
            ok(json!({
                "message": "Menu merged successfully",
                "categoriesAdded": cats_added,
                "categoriesReused": cats_reused,
                "itemsAdded": items_added,
                "itemsUpdated": items_updated,
            }))
        }
        "replace" => match bulk_create(ctx, &store_id, true, &categories) {
            Ok((cats_added, items_added)) => ok(json!({
                "message": "Menu replaced successfully",
                "categoriesAdded": cats_added,
                "itemsAdded": items_added,
            })),
            Err(r) => r,
        },
        _ => match bulk_create(ctx, &store_id, false, &categories) {
            Ok((cats_added, items_added)) => ok(json!({
                "message": "Menu imported successfully",
                "categoriesAdded": cats_added,
                "itemsAdded": items_added,
            })),
            Err(r) => r,
        },
    };
    // menu/bulk queues per-entity sync events itself — kick the worker.
    if resp.status < 300 && !ctx.suppress_outbox {
        if let Some(kick) = ctx.outbox_kick {
            kick();
        }
    }
    resp
}

fn bulk_create(
    ctx: &mut Ctx,
    store_id: &str,
    replace_existing: bool,
    categories: &[Value],
) -> Result<(i64, i64), ApiResponse> {
    let suppress = ctx.suppress_outbox;
    let tx = ctx.conn.transaction().map_err(|e| err(500, e.to_string()))?;

    let mut cats_added = 0i64;
    let mut items_added = 0i64;

    let res = (|| -> Result<(), rusqlite::Error> {
        if replace_existing {
            tx.execute("UPDATE items SET is_active = 0 WHERE store_id = ?1", [store_id])?;
            tx.execute("UPDATE categories SET is_active = 0 WHERE store_id = ?1", [store_id])?;
            // Reproduce the wipe on the cloud before the creates replay.
            if !suppress {
                super::queue_sync_event(
                    &tx,
                    "POST",
                    "/menu/bulk",
                    &json!({"storeId": store_id, "mode": "replace", "categories": []}),
                    store_id,
                );
            }
        }
        for cat in categories {
            let mut cat_name = cat["name"].as_str().unwrap_or("").trim().to_string();
            if cat_name.is_empty() {
                cat_name = "Uncategorized".to_string();
            }
            let cat_id = entity_id(cat);
            tx.execute(
                "INSERT INTO categories (id, store_id, name, description) VALUES (?1,?2,?3,?4)",
                rusqlite::params![cat_id, store_id, cat_name, cat["description"].as_str().unwrap_or("")],
            )?;
            cats_added += 1;
            if !suppress {
                super::queue_sync_event(
                    &tx,
                    "POST",
                    "/categories",
                    &json!({
                        "id": cat_id, "storeId": store_id, "name": cat_name,
                        "description": cat["description"].as_str().unwrap_or(""),
                    }),
                    store_id,
                );
            }

            if let Some(items) = cat["items"].as_array() {
                for item in items {
                    let item_name = item["name"].as_str().unwrap_or("").trim().to_string();
                    if item_name.is_empty() {
                        continue;
                    }
                    let item_id = entity_id(item);
                    tx.execute(
                        "INSERT INTO items (id, store_id, category_id, name, description, price, hsn_code, tax_percent)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                        rusqlite::params![
                            item_id, store_id, cat_id, item_name,
                            item["description"].as_str().unwrap_or(""),
                            item["price"].as_f64().unwrap_or(0.0),
                            item["hsnCode"].as_str().unwrap_or(""),
                            item["taxPercent"].as_f64().unwrap_or(0.0),
                        ],
                    )?;
                    items_added += 1;
                    if !suppress {
                        super::queue_sync_event(
                            &tx,
                            "POST",
                            "/items",
                            &json!({
                                "id": item_id, "storeId": store_id, "categoryId": cat_id,
                                "name": item_name,
                                "description": item["description"].as_str().unwrap_or(""),
                                "price": item["price"].as_f64().unwrap_or(0.0),
                                "hsnCode": item["hsnCode"].as_str().unwrap_or(""),
                                "taxPercent": item["taxPercent"].as_f64().unwrap_or(0.0),
                            }),
                            store_id,
                        );
                    }
                }
            }
        }
        Ok(())
    })();

    match res {
        Ok(_) => {
            tx.commit().map_err(|e| err(500, e.to_string()))?;
            Ok((cats_added, items_added))
        }
        Err(e) => Err(err(500, e.to_string())),
    }
}

fn bulk_merge(
    ctx: &mut Ctx,
    store_id: &str,
    categories: &[Value],
) -> Result<(i64, i64, i64, i64), ApiResponse> {
    let suppress = ctx.suppress_outbox;
    let tx = ctx.conn.transaction().map_err(|e| err(500, e.to_string()))?;

    let mut cats_added = 0i64;
    let mut cats_reused = 0i64;
    let mut items_added = 0i64;
    let mut items_updated = 0i64;

    let res = (|| -> Result<(), rusqlite::Error> {
        // Existing active categories by normalized name.
        let mut cat_by_name: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        {
            let mut stmt = tx.prepare(
                "SELECT id, name FROM categories WHERE store_id = ?1 AND is_active = 1",
            )?;
            let rows = stmt.query_map([store_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?;
            for row in rows.flatten() {
                cat_by_name.insert(norm_name(&row.1), row.0);
            }
        }

        for cat in categories {
            let mut cat_name = cat["name"].as_str().unwrap_or("").trim().to_string();
            if cat_name.is_empty() {
                cat_name = "Uncategorized".to_string();
            }

            let mut cat_id = cat["matchedCategoryId"].as_str().unwrap_or("").trim().to_string();
            if !cat_id.is_empty() {
                let active: bool = tx
                    .query_row(
                        "SELECT is_active FROM categories WHERE id = ?1 AND store_id = ?2",
                        rusqlite::params![cat_id, store_id],
                        |r| r.get::<_, i64>(0).map(|v| v != 0),
                    )
                    .unwrap_or(false);
                if !active {
                    cat_id = String::new();
                } else {
                    tx.execute(
                        "UPDATE categories SET name = ?1, description = ?2 WHERE id = ?3",
                        rusqlite::params![
                            cat_name,
                            cat["description"].as_str().unwrap_or(""),
                            cat_id
                        ],
                    )?;
                    cats_reused += 1;
                    if !suppress {
                        // POST creates it if the cloud doesn't have this id yet;
                        // PUT applies the update. Either way the cloud converges.
                        super::queue_sync_event(
                            &tx, "POST", "/categories",
                            &json!({"id": cat_id, "storeId": store_id, "name": cat_name,
                                    "description": cat["description"].as_str().unwrap_or("")}),
                            store_id,
                        );
                        super::queue_sync_event(
                            &tx, "PUT", &format!("/categories/{}", cat_id),
                            &json!({"name": cat_name,
                                    "description": cat["description"].as_str().unwrap_or("")}),
                            store_id,
                        );
                    }
                }
            }
            if cat_id.is_empty() {
                if let Some(existing) = cat_by_name.get(&norm_name(&cat_name)) {
                    cat_id = existing.clone();
                    cats_reused += 1;
                    if !suppress {
                        super::queue_sync_event(
                            &tx, "POST", "/categories",
                            &json!({"id": cat_id, "storeId": store_id, "name": cat_name,
                                    "description": cat["description"].as_str().unwrap_or("")}),
                            store_id,
                        );
                    }
                } else {
                    cat_id = entity_id(cat);
                    tx.execute(
                        "INSERT INTO categories (id, store_id, name, description) VALUES (?1,?2,?3,?4)",
                        rusqlite::params![
                            cat_id, store_id, cat_name,
                            cat["description"].as_str().unwrap_or("")
                        ],
                    )?;
                    cats_added += 1;
                    cat_by_name.insert(norm_name(&cat_name), cat_id.clone());
                    if !suppress {
                        super::queue_sync_event(
                            &tx, "POST", "/categories",
                            &json!({"id": cat_id, "storeId": store_id, "name": cat_name,
                                    "description": cat["description"].as_str().unwrap_or("")}),
                            store_id,
                        );
                    }
                }
            }

            if let Some(items) = cat["items"].as_array() {
                for item in items {
                    let item_name = item["name"].as_str().unwrap_or("").trim().to_string();
                    if item_name.is_empty() {
                        continue;
                    }
                    let matched_id = item["matchedItemId"].as_str().unwrap_or("").trim().to_string();
                    let mut updated = false;
                    if !matched_id.is_empty() {
                        let active: bool = tx
                            .query_row(
                                "SELECT is_active FROM items WHERE id = ?1 AND store_id = ?2",
                                rusqlite::params![matched_id, store_id],
                                |r| r.get::<_, i64>(0).map(|v| v != 0),
                            )
                            .unwrap_or(false);
                        if active {
                            tx.execute(
                                "UPDATE items SET category_id = ?1, name = ?2, description = ?3, price = ?4, hsn_code = ?5, tax_percent = ?6 WHERE id = ?7",
                                rusqlite::params![
                                    cat_id, item_name,
                                    item["description"].as_str().unwrap_or(""),
                                    item["price"].as_f64().unwrap_or(0.0),
                                    item["hsnCode"].as_str().unwrap_or(""),
                                    item["taxPercent"].as_f64().unwrap_or(0.0),
                                    matched_id,
                                ],
                            )?;
                            items_updated += 1;
                            updated = true;
                            if !suppress {
                                super::queue_sync_event(
                                    &tx, "POST", "/items",
                                    &json!({"id": matched_id, "storeId": store_id,
                                            "categoryId": cat_id, "name": item_name,
                                            "description": item["description"].as_str().unwrap_or(""),
                                            "price": item["price"].as_f64().unwrap_or(0.0),
                                            "hsnCode": item["hsnCode"].as_str().unwrap_or(""),
                                            "taxPercent": item["taxPercent"].as_f64().unwrap_or(0.0)}),
                                    store_id,
                                );
                                super::queue_sync_event(
                                    &tx, "PUT", &format!("/items/{}", matched_id),
                                    &json!({"categoryId": cat_id, "name": item_name,
                                            "description": item["description"].as_str().unwrap_or(""),
                                            "price": item["price"].as_f64().unwrap_or(0.0),
                                            "hsnCode": item["hsnCode"].as_str().unwrap_or(""),
                                            "taxPercent": item["taxPercent"].as_f64().unwrap_or(0.0)}),
                                    store_id,
                                );
                            }
                        }
                    }
                    if !updated {
                        let item_id = entity_id(item);
                        tx.execute(
                            "INSERT INTO items (id, store_id, category_id, name, description, price, hsn_code, tax_percent)
                             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                            rusqlite::params![
                                item_id, store_id, cat_id, item_name,
                                item["description"].as_str().unwrap_or(""),
                                item["price"].as_f64().unwrap_or(0.0),
                                item["hsnCode"].as_str().unwrap_or(""),
                                item["taxPercent"].as_f64().unwrap_or(0.0),
                            ],
                        )?;
                        items_added += 1;
                        if !suppress {
                            super::queue_sync_event(
                                &tx, "POST", "/items",
                                &json!({"id": item_id, "storeId": store_id,
                                        "categoryId": cat_id, "name": item_name,
                                        "description": item["description"].as_str().unwrap_or(""),
                                        "price": item["price"].as_f64().unwrap_or(0.0),
                                        "hsnCode": item["hsnCode"].as_str().unwrap_or(""),
                                        "taxPercent": item["taxPercent"].as_f64().unwrap_or(0.0)}),
                                store_id,
                            );
                        }
                    }
                }
            }
        }
        Ok(())
    })();

    match res {
        Ok(_) => {
            tx.commit().map_err(|e| err(500, e.to_string()))?;
            Ok((cats_added, cats_reused, items_added, items_updated))
        }
        Err(e) => Err(err(500, e.to_string())),
    }
}
