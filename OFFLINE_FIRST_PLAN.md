# Offline-First with Cloud Sync — Tauri as Local Server for Flutter Mobile

The Tauri desktop app becomes a local API server + sync bridge: it caches all POS data in SQLite, serves the Flutter mobile app over LAN, and syncs with the cloud backend when internet is available. Core POS workflows (orders, tables, bills, KOT printing) work fully offline.

---

## Architecture Overview

```
┌─────────────────┐       LAN / WiFi        ┌──────────────────────┐      Internet       ┌──────────────────┐
│  Flutter Mobile │  ◄───────────────────►  │  Tauri Desktop       │  ◄────────────────► │  Cloud Backend   │
│  App (mario_app)│    Local HTTP API       │  (Local API +        │    Sync API         │  (Go + Postgres) │
│                 │                         │   SQLite + Sync)     │                     │                  │
└─────────────────┘                         └──────────────────────┘                     └──────────────────┘
```

**Key principle:** The Flutter app never talks to the cloud. It only knows the Tauri desktop's LAN address. Tauri is the source of truth locally, and syncs to cloud when internet is up. Conflict resolution: last-write-wins based on `updated_at` timestamps.

---

## Current State Summary

### Tauri Desktop (`frontend/`)
- React + Tauri v2, Zustand state management
- All API calls go to cloud (`frontend/src/services/api.ts:3-5` → `https://mario-v2-backend.ntoric.com/api`)
- In-memory cache only (`frontend/src/utils/cache.ts`) — cleared on startup
- WebSocket for table status updates (`frontend/src/services/realtime.ts`)
- Printer integration via Rust (`frontend/src-tauri/src/lib.rs`)

### Flutter Mobile (`mario_app/`)
- Flutter with Provider state management (`mario_app/lib/providers/`)
- `ApiService` singleton with configurable `_baseUrl` (`mario_app/lib/services/api_service.dart:18`)
- Already has `connectToBackend(baseUrl)` flow (`mario_app/lib/backend/backend_service.dart:23-26`)
- Already has `connectivity_plus` dependency (`mario_app/pubspec.yaml:31`)
- Already saves/loads API URL from SharedPreferences (`mario_app/lib/services/api_service.dart:25-39`)
- `silentUpdateTablesAndOrders` polls for changes (`mario_app/lib/providers/data_provider.dart:336-376`)

### Cloud Backend (`backend/`)
- Go + Chi router + Postgres + Redis
- REST API with JWT auth (`backend/cmd/server/main.go`)
- WebSocket hub for realtime table status (`backend/internal/realtime/hub.go`)
- No sync endpoint exists yet
- No indexes on `orders.store_id`, `orders.status`, `order_items.order_id`

---

## Phase 1: Tauri Local SQLite Database

**Goal:** Embed SQLite in the Tauri desktop app to cache all POS data locally.

### 1.1 Add SQLite dependency
- **File:** `frontend/src-tauri/Cargo.toml`
- Add `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`
- Add `tokio = { version = "1", features = ["full"] }` (for local API server later)

### 1.2 Register SQL plugin
- **File:** `frontend/src-tauri/src/lib.rs`
- Add `.plugin(tauri_plugin_sql::Builder::default().build())` to the Tauri builder
- DB file path: `{app_data_dir}/mario_local.db`

### 1.3 Local SQLite schema
- **New file:** `frontend/src-tauri/migrations/local_schema.sql`
- Tables mirroring cloud entities with `updated_at` columns:

```sql
-- Sync metadata (tracks last pull timestamp per entity per store)
CREATE TABLE IF NOT EXISTS sync_meta (
  entity TEXT PRIMARY KEY,
  last_sync_at TEXT NOT NULL
);

-- Outbox for queued mutations (push to cloud)
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,          -- 'order', 'bill'
  operation TEXT NOT NULL,       -- 'create', 'update', 'complete', 'cancel', 'save_ebill', 'save_print'
  payload TEXT NOT NULL,         -- JSON
  status TEXT DEFAULT 'pending', -- 'pending', 'synced', 'failed'
  created_at TEXT NOT NULL,
  synced_at TEXT,
  retries INTEGER DEFAULT 0,
  error TEXT
);

-- Read-only entities (synced from cloud, not modified locally)
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY, name TEXT, branch TEXT, location TEXT,
  gstin TEXT, fssai_no TEXT, phone TEXT, printer_name TEXT,
  printer_vendor_id TEXT, printer_product_id TEXT, invoice_size TEXT,
  kot_print_enabled INTEGER, remote_billing_enabled INTEGER,
  logo_url TEXT, theme_color TEXT, is_active INTEGER, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, store_id TEXT, name TEXT, description TEXT,
  is_active INTEGER, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, store_id TEXT, category_id TEXT, name TEXT,
  description TEXT, price REAL, hsn_code TEXT, tax_percent REAL,
  is_active INTEGER, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY, store_id TEXT, number INTEGER, seats INTEGER,
  position_x INTEGER, position_y INTEGER, is_active INTEGER, updated_at TEXT
);

-- Read-write entities (created/modified locally, synced to cloud)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, store_id TEXT, table_id TEXT, table_number INTEGER,
  status TEXT, order_type TEXT, customer_name TEXT, customer_mobile TEXT,
  total_amount REAL, tax_amount REAL, discount_amount REAL,
  payment_method TEXT, payment_status TEXT, created_by TEXT,
  created_at TEXT, updated_at TEXT,
  is_local INTEGER DEFAULT 0,       -- 1 if created locally and not yet synced
  sync_status TEXT DEFAULT 'synced' -- 'synced', 'pending', 'conflict'
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT,
  item_id TEXT, quantity INTEGER, unit_price REAL, tax_percent REAL,
  notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY, store_id TEXT, order_id TEXT, table_number INTEGER,
  invoice_no TEXT, subtotal REAL, tax_total REAL, discount REAL, total REAL,
  payment_method TEXT, customer_name TEXT, customer_mobile TEXT,
  is_printed INTEGER, generated_at TEXT, generated_by TEXT,
  is_local INTEGER DEFAULT 0, sync_status TEXT DEFAULT 'synced'
);
```

### 1.4 TypeScript SQLite wrapper
- **New file:** `frontend/src/services/localDb.ts`
- Uses `@tauri-apps/plugin-sql` (npm package)
- Methods per entity:
  - `getStores()`, `upsertStores(stores[])`
  - `getCategories(storeId)`, `upsertCategories(categories[])`
  - `getItems(storeId)`, `upsertItems(items[])`
  - `getTables(storeId)`, `upsertTables(tables[])`
  - `getOrders(storeId, status?)`, `upsertOrders(orders[])`, `insertOrder(order)`, `updateOrderLocal(id, data)`
  - `getBills(storeId)`, `upsertBills(bills[])`, `insertBill(bill)`
  - `getOutboxPending()`, `addToOutbox(item)`, `markOutboxSynced(id)`, `markOutboxFailed(id, error)`
  - `getSyncMeta(entity)`, `setSyncMeta(entity, timestamp)`
  - `init()` — creates tables if not exist
- All upserts use `INSERT OR REPLACE`

### 1.5 Install npm package
- **File:** `frontend/package.json`
- Add `@tauri-apps/plugin-sql`

---

## Phase 2: Tauri Embedded Local API Server

**Goal:** Tauri runs a lightweight HTTP server on LAN that the Flutter app connects to. This server reads/writes from the local SQLite database.

### 2.1 Add HTTP server dependency
- **File:** `frontend/src-tauri/Cargo.toml`
- Add `axum = "0.7"`, `tower-http = { version = "0.5", features = ["cors"] }`
- (tokio already added in Phase 1)

### 2.2 Implement local API server in Rust
- **New file:** `frontend/src-tauri/src/local_server/mod.rs` — module declaration, server startup
- **New file:** `frontend/src-tauri/src/local_server/routes.rs` — route handlers
- **New file:** `frontend/src-tauri/src/local_server/auth.rs` — local JWT auth
- **New file:** `frontend/src-tauri/src/local_server/db.rs` — SQLite query helpers

**Endpoints (mirroring cloud API for core POS):**

| Method | Path | Source |
|--------|------|--------|
| POST | `/api/auth/login` | Validate against local `users` table (synced from cloud) |
| GET | `/api/auth/me` | Return cached user from SQLite |
| GET | `/api/stores` | Local SQLite |
| GET | `/api/categories?storeId=X` | Local SQLite |
| GET | `/api/items?storeId=X` | Local SQLite |
| GET | `/api/tables?storeId=X` | Local SQLite |
| GET | `/api/orders?storeId=X&status=Y` | Local SQLite (with order_items JOIN) |
| POST | `/api/orders` | Insert to local SQLite + add to outbox |
| PUT | `/api/orders/:id` | Update local SQLite + add to outbox |
| PATCH | `/api/orders/:id/complete` | Update local SQLite + add to outbox |
| PATCH | `/api/orders/:id/cancel` | Update local SQLite + add to outbox |
| POST | `/api/orders/save-ebill` | Create order + bill in local SQLite + outbox |
| POST | `/api/orders/:id/save-print` | Create bill + complete order in local SQLite + outbox |
| POST | `/api/orders/parcel` | Insert parcel order in local SQLite + outbox |
| GET | `/api/bills?storeId=X` | Local SQLite |
| GET | `/api/bills/next-invoice-no?storeId=X` | Generate locally (see Phase 5) |
| GET | `/api/health` | Health check + sync status |
| GET | `/api/sync/status` | Outbox pending count, last sync time |

**Auth:** Local JWT signed with a Tauri-side secret. Flutter app stores and sends Bearer token same as cloud API. Users table is synced from cloud during sync cycles.

### 2.3 Start local server on Tauri launch
- **File:** `frontend/src-tauri/src/lib.rs`
- Add `mod local_server;`
- Spawn Axum server in a tokio task on app startup
- Bind to `0.0.0.0:8188` (configurable, different from cloud's 8088)
- Expose Tauri command `get_lan_ip()` to show the IP in the UI

### 2.4 Local server settings UI
- **New file:** `frontend/src/components/LocalServerSettings.tsx`
- Shows: LAN IP address, port, server status (running/stopped), last sync time, pending outbox count
- Settings: enable/disable local server, change port
- QR code for easy Flutter app pairing (scan to configure base URL)
- Manual sync trigger button

---

## Phase 3: Cloud Sync Engine (Tauri ↔ Cloud Backend)

**Goal:** Tauri syncs local SQLite data with the cloud backend bidirectionally. Runs in background.

### 3.1 Backend: Add sync pull endpoint
- **New file:** `backend/internal/handler/sync.go`
- **New route in** `backend/cmd/server/main.go`: `r.Get("/api/sync", h.SyncPull)`
- Query params: `since` (ISO timestamp), `storeId`
- Returns all entities changed since the given timestamp:

```json
{
  "stores": [...],
  "categories": [...],
  "items": [...],
  "tables": [...],
  "orders": [...],
  "bills": [...],
  "users": [...],
  "syncTimestamp": "2026-06-27T12:00:00Z"
}
```

- **File:** `backend/internal/repository/repository.go`
- Add `GetChangesSince(ctx, storeID, since) → (stores, categories, items, tables, orders, bills, error)`
- Each query: `SELECT ... WHERE store_id = $1 AND updated_at > $2 ORDER BY updated_at`

### 3.2 Backend: Add sync push endpoint
- **New route:** `r.Post("/api/sync/push", h.SyncPush)`
- Accepts array of outbox items:

```json
{
  "items": [
    { "entity": "order", "operation": "create", "payload": {...}, "clientId": "uuid" },
    { "entity": "order", "operation": "complete", "payload": {"id": "X"}, "clientId": "uuid" }
  ]
}
```

- Processes each item using existing handler logic (CreateOrder, UpdateOrder, etc.)
- Returns per-item result:

```json
{
  "results": [
    { "clientId": "uuid", "success": true, "entity": "order", "serverId": "X", "updatedAt": "..." },
    { "clientId": "uuid", "success": false, "error": "Order not found" }
  ]
}
```

- **Last-write-wins:** For update/complete/cancel, server compares `updated_at` from payload with current DB `updated_at`. If client's is older, server wins and returns current data.

### 3.3 Backend: Add database indexes
- **File:** `backend/internal/db/db.go`
- Add to migration queries:

```sql
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_status ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_store_id ON items(store_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id);
CREATE INDEX IF NOT EXISTS idx_tables_store_id ON tables(store_id);
CREATE INDEX IF NOT EXISTS idx_bills_store_id ON bills(store_id);
CREATE INDEX IF NOT EXISTS idx_bills_updated_at ON bills(updated_at);
```

### 3.4 Tauri: Sync engine service
- **New file:** `frontend/src/services/syncEngine.ts`
- Background sync loop running on interval (30s) + on connectivity change + on manual trigger

**Pull sync:**
1. Read `sync_meta.last_sync_at` from SQLite
2. Call `GET /api/sync?since={lastSyncAt}&storeId={storeId}`
3. Upsert all returned entities into local SQLite
4. Update `sync_meta.last_sync_at` to response `syncTimestamp`

**Push sync:**
1. Read pending outbox items from SQLite
2. Call `POST /api/sync/push` with batch
3. For each successful result: mark outbox item as `synced`, update local entity's `sync_status` to `synced`
4. For failures: increment retries, store error, mark as `failed` after 5 retries

**Triggers:**
- On app startup (after initial load)
- Every 30 seconds (configurable)
- On network reconnect (listen to `online` event)
- After any local mutation (immediate push attempt)
- Manual button in settings UI

### 3.5 Tauri: Modify dataStore for local-first reads
- **File:** `frontend/src/stores/dataStore.ts`
- Each `fetch*` method changes to:
  1. Read from local SQLite immediately → set Zustand state (instant)
  2. If online, trigger background sync pull → update SQLite → refresh Zustand state
- Each mutation method (createOrder, updateOrder, etc.) changes to:
  1. Write to local SQLite + add to outbox (instant)
  2. Update Zustand state from local SQLite (instant)
  3. Trigger push sync attempt (async, non-blocking)

Example for `fetchOrders`:
```typescript
fetchOrders: async () => {
  const currentStoreId = useAuthStore.getState().currentStoreId;
  if (!currentStoreId) return;
  // 1. Read from local SQLite (instant)
  const localOrders = await localDb.getOrders(currentStoreId);
  set({ orders: localOrders });
  // 2. Background sync (non-blocking)
  syncEngine.pullOrders(currentStoreId).then(async () => {
    set({ orders: await localDb.getOrders(currentStoreId) });
  }).catch(() => {});
}
```

Example for `createOrder`:
```typescript
createOrder: async (order) => {
  const orderId = crypto.randomUUID();
  const newOrder = { ...order, id: orderId, status: 'active',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await localDb.insertOrder(newOrder);
  await localDb.addToOutbox({ entity: 'order', operation: 'create', payload: newOrder });
  set({ orders: await localDb.getOrders(currentStoreId) });
  syncEngine.tryPush(); // non-blocking
  return newOrder;
}
```

### 3.6 Tauri: Network status awareness
- **New file:** `frontend/src/services/networkStatus.ts`
- Listen to `window.addEventListener('online', ...)` and `'offline'`
- Expose `isOnline()` and `onStatusChange(callback)`
- Sync engine subscribes to trigger immediate sync on reconnect
- UI shows online/offline indicator

---

## Phase 4: Flutter Mobile App Changes

**Goal:** Flutter app connects to Tauri desktop over LAN instead of cloud. No codebase restructuring needed — the app already has configurable base URL.

### 4.1 Update API base URL configuration
- **File:** `mario_app/lib/services/api_service.dart`
- Change default `_baseUrl` from `https://mario-v2-backend.ntoric.com/api` to empty or local default
- The `setBaseUrl()` and `saveBaseUrl()` methods already exist (lines 21-39)
- The `connectToBackend()` flow in `backend_service.dart:23-26` already checks health

### 4.2 Update login/settings screen
- **File:** `mario_app/lib/screens/login_screen.dart`
- Add a "Server Address" input field for configuring the Tauri desktop LAN IP
- Show connection status (connected/disconnected)
- Save to SharedPreferences (already supported)
- Optional: QR code scanner to scan QR from Tauri desktop settings screen

### 4.3 Add local server discovery (optional)
- **File:** `mario_app/lib/services/api_service.dart`
- Add `discoverLocalServer()` method that tries common LAN IPs on port 8188
- Or use `nsd` (Network Service Discovery) / Bonjour to auto-discover
- Falls back to manual IP entry

### 4.4 Add offline indicator + retry
- **File:** `mario_app/lib/providers/data_provider.dart`
- The `connectivity_plus` package is already in `pubspec.yaml:31`
- Add connectivity state tracking
- Show banner when Tauri desktop is unreachable
- Auto-retry failed requests with exponential backoff
- Queue failed mutations locally (using SharedPreferences or a local Hive/SQLite cache) until Tauri is reachable

### 4.5 Add local caching for Flutter app (optional, for when Tauri is down)
- **File:** `mario_app/pubspec.yaml`
- Add `sqflite` or `hive` for local caching
- Cache last-known state of tables, orders, items
- Serve from cache when Tauri desktop is temporarily unreachable
- This is a secondary cache — Tauri is the primary local source of truth

### 4.6 Remove cloud-specific features when in local mode
- **File:** `mario_app/lib/screens/settings_screen.dart`
- Hide cloud-only features (app update management, system stats) when connected to local server
- Detect mode via `/api/health` response (include `mode: 'local'` or `mode: 'cloud'`)

---

## Phase 5: Invoice Number Generation (Offline)

**Problem:** Invoice numbers are currently generated server-side (`backend/internal/handler/order_bill.go`). When offline, the Tauri local server must generate them.

### 5.1 Local invoice counter in SQLite
- Add table:

```sql
CREATE TABLE IF NOT EXISTS invoice_counter (
  store_id TEXT PRIMARY KEY,
  last_number INTEGER DEFAULT 0,
  prefix TEXT,
  fiscal_year TEXT
);
```

### 5.2 Local invoice generation logic
- **File:** `frontend/src-tauri/src/local_server/routes.rs`
- On `GET /api/bills/next-invoice-no`:
  1. Read `last_number` from `invoice_counter` for this store
  2. Increment atomically (SQLite transaction)
  3. Format: `{prefix}/{fiscal_year}/{number:04d}`
  4. Return formatted invoice number

### 5.3 Cloud reconciliation
- During push sync, if a bill with a locally-generated invoice number is pushed to cloud:
  - Cloud accepts the invoice number as-is (idempotent)
  - Cloud's `invoice_counter` is updated to `max(current, pushed_number)`
- If conflict (cloud already used that number for a different bill):
  - Cloud assigns a new invoice number, returns it in push response
  - Tauri updates local SQLite with the corrected number
  - This is rare — only happens if bills were created on cloud directly while Tauri was offline

---

## Phase 6: WebSocket / Realtime Updates

### 6.1 Tauri → Flutter realtime (LAN)
- **File:** `frontend/src-tauri/src/local_server/mod.rs`
- Add WebSocket endpoint: `GET /api/ws/tables-status`
- Tauri broadcasts table status changes to connected Flutter clients
- Triggered when: local order created/updated/completed/cancelled, or sync pull updates tables/orders

### 6.2 Flutter app WebSocket support
- **File:** `mario_app/lib/providers/data_provider.dart`
- Replace `silentUpdateTablesAndOrders` polling with WebSocket connection to Tauri
- Fallback to polling (every 5s) if WebSocket fails
- On WS message: reload tables + orders from Tauri local API

### 6.3 Cloud → Tauri realtime (optional)
- Tauri maintains its existing WebSocket to cloud for realtime updates
- On receiving cloud WS message, Tauri updates local SQLite and broadcasts to Flutter clients
- This keeps multiple Tauri desktops in sync (e.g., if cafe has 2 POS terminals)

---

## Implementation Order & Timeline

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| 1 | Tauri local SQLite database | 2-3 days | None |
| 2 | Tauri embedded local API server | 3-4 days | Phase 1 |
| 3 | Cloud sync engine (backend + Tauri) | 3-4 days | Phase 1 |
| 4 | Flutter mobile app changes | 2-3 days | Phase 2 |
| 5 | Offline invoice numbers | 1 day | Phase 2 |
| 6 | WebSocket realtime | 1-2 days | Phase 2, 4 |

**Total: ~12-17 days**

### Recommended implementation sequence:
1. **Phase 1** — SQLite in Tauri (foundation)
2. **Phase 3.3** — DB indexes on backend (quick win, needed for sync)
3. **Phase 3.1-3.2** — Backend sync endpoints
4. **Phase 3.4-3.5** — Tauri sync engine + dataStore changes
5. **Phase 2** — Tauri local API server
6. **Phase 4** — Flutter app changes
7. **Phase 5** — Invoice numbers
8. **Phase 6** — WebSocket realtime

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `frontend/src-tauri/migrations/local_schema.sql` | SQLite schema |
| `frontend/src/services/localDb.ts` | TypeScript SQLite wrapper |
| `frontend/src/services/syncEngine.ts` | Background sync engine |
| `frontend/src/services/networkStatus.ts` | Online/offline detection |
| `frontend/src/components/LocalServerSettings.tsx` | LAN server config UI |
| `frontend/src-tauri/src/local_server/mod.rs` | Axum server module |
| `frontend/src-tauri/src/local_server/routes.rs` | API route handlers |
| `frontend/src-tauri/src/local_server/auth.rs` | Local JWT auth |
| `frontend/src-tauri/src/local_server/db.rs` | SQLite query helpers |
| `backend/internal/handler/sync.go` | Sync pull/push handlers |

### Modified Files
| File | Changes |
|------|---------|
| `frontend/src-tauri/Cargo.toml` | Add tauri-plugin-sql, axum, tokio, tower-http |
| `frontend/src-tauri/src/lib.rs` | Register SQL plugin, start local server, add `mod local_server` |
| `frontend/package.json` | Add `@tauri-apps/plugin-sql` |
| `frontend/src/stores/dataStore.ts` | Local-first reads, outbox writes, sync triggers |
| `frontend/src/services/api.ts` | Add sync endpoints, remove console.logs |
| `backend/cmd/server/main.go` | Add `/api/sync` and `/api/sync/push` routes |
| `backend/internal/db/db.go` | Add database indexes |
| `backend/internal/repository/repository.go` | Add `GetChangesSince` methods |
| `mario_app/lib/services/api_service.dart` | Default URL to local, add discovery |
| `mario_app/lib/screens/login_screen.dart` | Server address input field |
| `mario_app/lib/providers/data_provider.dart` | WebSocket support, offline retry |
| `mario_app/lib/screens/settings_screen.dart` | Hide cloud-only features in local mode |

---

## Edge Cases & Risks

- **Invoice number conflicts:** Rare but possible if cloud and local both generate bills. Mitigated by cloud accepting local numbers and updating its counter.
- **Multi-terminal sync:** If cafe has 2+ Tauri desktops, each syncs independently with cloud. Last-write-wins on order updates. Low risk for POS (typically one waiter per table).
- **User management offline:** Creating/editing users requires cloud sync. Local server can authenticate existing users but cannot create new ones while offline.
- **Menu changes offline:** Phase 1 caches items/categories as read-only. Editing menu items requires cloud connection. This is acceptable for core POS workflow.
- **Data size:** SQLite local DB will grow with order history. Add periodic cleanup (e.g., keep last 90 days of completed orders locally).
- **Tauri desktop offline + Flutter needs to connect:** If Tauri desktop is off, Flutter app cannot function. This is a design constraint — Tauri desktop is the local server.
