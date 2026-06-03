# Cafe Backend - Go Implementation

A premium, highly-scalable, and maintainable **Go** version of the Node.js Cafe Backend. 

This implementation replicates 100% of the Node.js business logic, API contracts, database structures, and subprocess printer execution rules while elevating performance, type-safety, and database transactional integrity.

---

## 🏛️ Architecture & Casing Conventions

This project is built using **Clean Layered Architecture** to enforce separation of concerns, strict decoupling, and high testability:

```
backend/
├── cmd/
│   └── server/
│       └── main.go         # Application entry point, router mounting, signal handling
├── internal/
│   ├── config/             # Config loader from environment variables (.env)
│   ├── db/                 # DB connection and transactional migrations/DDL executor
│   ├── middleware/         # Auth (Bearer JWT) and CORS interception
│   ├── models/             # Type-safe SQL and request/response DTO JSON structs
│   ├── repository/         # Central data access layer (PostgreSQL SQL executor)
│   ├── handler/            # HTTP controller mappings translating requests/responses
│   └── printer/            # Safe OS subprocess manager for local printer service
├── go.mod                  # Go module definition
└── README.md               # Extensive developer guide & API reference
```

### Decoupled Layers
1. **Handler Layer (`internal/handler`)**: Responsible solely for reading and writing JSON payloads, validating route permissions based on context claims, and calling the Repository layer.
2. **Repository Layer (`internal/repository`)**: Encapsulates all raw SQL queries, data parsing (including high-performance `json_agg` array scans directly into Go slices), and transactional updates.
3. **Subprocess Printer Layer (`internal/printer`)**: A dedicated subsystem using standard library `os/exec` that manages the lifecycle of the compiled `mario-printer` binary.

### Key Enhancements Over Express Version
* **Robust DB Transactions**: The Node.js implementation ran sequential `BEGIN` and `COMMIT` queries over independent connections from the pool, breaking transactional ACID guarantees. This Go version implements proper Go transactions (`*sql.Tx`) ensuring atomic, sequential operations on a single connection.
* **Secured Auth Route `/api/auth/me`**: The Node version accessed `req.user` inside `/me` but left the endpoint completely unprotected by its JWT middleware. This Go version correctly secures `/me` behind the JWT authenticator.
* **Casing Safety**: All request/response keys map exactly to the frontend expectation using precise `json` struct tags enforcing camelCase (e.g. `storeId`, `fssaiNo`, `kotPrintEnabled`).

---

## ⚙️ Environment Configuration

Configurations are loaded from `.env` files (searching both the current workspace directory and its parent folders).

| Key | Description | Default Value |
| :--- | :--- | :--- |
| `PORT` | HTTP Server port | `8088` |
| `DB_HOST` | Database Host address | `localhost` |
| `DB_PORT` | Database Port | `5432` |
| `DB_NAME` | Database Name | `postgres` |
| `DB_USER` | Database User | `postgres` |
| `DB_PASSWORD` | Database Password | `postgres` |
| `JWT_SECRET` | Signing secret key for Auth | `your-secret-key...` |
| `SUPERADMIN_USERNAME` | Seed Username for Superadmin | `superadmin` |
| `SUPERADMIN_PASSWORD` | Seed Password for Superadmin | `superadmin123` |
| `SUPERADMIN_NAME` | Full Name for Superadmin | `Super Administrator` |
| `PRINTER_SERVICE_URL` | Microservice address for thermal printing | `http://localhost:8085` |
| `DISABLE_PRINTER_SERVICE` | Skip starting thermal printing subprocess | `false` |

---

## 🗄️ Database Schemas & Migrations

Upon startup, the server pings the PostgreSQL instance and runs sequential `CREATE TABLE IF NOT EXISTS` migration commands:

1. **`stores`**: ID, branch, location, GSTIN, FSSAI number, custom printer vendor/product ids, layout parameters, and logo base64 URLs.
2. **`users`**: User credentials, assigned roles (`superadmin`, `business_owner`, `business_admin`, `staff`), store context, and status flag.
3. **`user_stores`**: Many-to-many relationship mapping business owners to multiple stores they own.
4. **`categories`**: Store menu category organization.
5. **`items`**: Menu items with pricing, HSN codes, and specific tax percentages.
6. **`tables`**: Dining floor seating layouts with 2D positions (`position_x`, `position_y`).
7. **`orders`**: Active/completed/cancelled dine-in order registries.
8. **`order_items`**: Order line-items detailing requested quantities, unit price at purchase, specific tax rates, and cooking comments.
9. **`bills`**: Finalized store invoices with subtotal, tax calculations, discounts, payment mode, printed flag, and auditing details.
10. **`settings`**: Flexible store configuration parameters.

### Database Seeding
After creating the tables, the migrations automatically seed:
* **Default Store '1'** (Main Cafe) if no stores exist.
* **Superadmin User** with hashed credentials parsed from the environment.
* **Sample Business Owner** named `owner` with password `password`, automatically mapped to store '1'.

---

## 🖨️ Thermal Printer Subprocess Management

A critical responsibility of this backend is spawning and managing the local thermal `mario-printer` binary process:

1. **Path Resolution**: The manager dynamically detects the host's operating system (`GOOS`) and CPU architecture (`GOARCH`) to locate the appropriate pre-compiled binary:
   * First searches absolute developer folders under `/Users/apple/Projects/test/cmd/mario-printer/build/`.
   * Falls back to root project directories `../mario-printer/` relative to execution path.
2. **Execution**: Spawns the subprocess with decoupled standard input/outputs, capturing lines of logs and routing them directly to the main Go logger under tags `[Printer Service]` and `[Printer Service Error]`.
3. **PGID Separation**: The subprocess is launched under a distinct **Process Group ID (PGID)** using `syscall.SysProcAttr`. This guarantees that terminating the parent server cleanly signals and cleans up the child subprocess without leaving orphan background binaries.
4. **Graceful Shutdown**: Listens for SIGINT/SIGTERM terminal signals. When triggered, the server stops listening to new HTTP connections, gracefully drains current pools, kills the subprocess group, and shuts down safely.

---

## 🚀 How to Build & Run

Ensure you have **Go 1.20+** installed.

### 1. Fetch Dependencies & Clean
Initialize and synchronize Go dependencies:
```bash
go mod tidy
```

### 2. Run in Development Mode
To start the server locally with auto-loading environment variables:
```bash
go run ./cmd/server/main.go
```

### 3. Build Production Binary
Compile the server into an optimized static binary:
```bash
go build -o build/server ./cmd/server
```

### 4. Run Compiled Binary
```bash
./build/server
```

---

## 📖 API Reference

### 🔐 Authentication
#### `POST /api/auth/login` (Public)
Authenticates a user and returns a Bearer token along with details and accessible store contexts.
* **Request Body**: `{"username": "superadmin", "password": "superadmin123"}`
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "...",
      "username": "superadmin",
      "name": "Super Administrator",
      "email": "admin@cafe.com",
      "role": "superadmin",
      "storeId": "",
      "stores": [
        { "id": "1", "name": "Main Cafe", "branch": "Main Branch" }
      ],
      "isActive": true
    }
  }
  ```

#### `GET /api/auth/me` (Protected)
Retrieves current authenticated user claims.
* **Headers**: `Authorization: Bearer <token>`
* **Response Status**: `200 OK`
* **Response Body**: `UserSummary` object.

---

### 🏪 Store Management
#### `GET /api/stores/default` (Public)
Returns public info of the default store for frontend logos and headers.
* **Response Body**: `{"id":"1","name":"Main Cafe","branch":"Main Branch","logoUrl":"..."}`

#### `GET /api/stores` (Protected)
Gets all active stores accessible to the user context.
* **Permissions**: `superadmin` (all), `business_owner` (owned), others (assigned only).

#### `GET /api/stores/{id}` (Protected)
Gets a single store by its ID.

#### `POST /api/stores` (Protected)
Creates a new store context.
* **Permissions**: `superadmin`, `business_owner`.
* **Request Body**: `Store` model.

#### `PUT /api/stores/{id}` (Protected)
Updates store settings (e.g. name, branch, fssaiNo, printer config).
* **Permissions**: `superadmin`, `business_owner` (if owned), `business_admin`/`staff` (if assigned).

#### `DELETE /api/stores/{id}` (Protected)
Deletes a store context permanently.
* **Permissions**: `superadmin` only.

#### `POST /api/stores/switch` (Protected)
Verifies and switches active context to a target store.
* **Request Body**: `{"storeId": "1"}`

#### `POST /api/stores/{id}/logo` (Protected)
Uploads base64 image logo to a store.
* **Request Body**: `{"logoBase64": "data:image/png;base64,..."}`

#### `DELETE /api/stores/{id}/logo` (Protected)
Removes the logo URL from a store.

---

### 👥 User Management
#### `GET /api/users` (Protected)
Gets lists of registered employees.
* **Permissions**: `superadmin` (all), `business_owner` (owned store employees), `business_admin` (assigned store employees).

#### `POST /api/users` (Protected)
Creates a new store staff or admin.
* **Request Body**:
  ```json
  {
    "username": "cashier1",
    "password": "password",
    "name": "Jane Cashier",
    "email": "jane@cafe.com",
    "role": "staff",
    "storeId": "1"
  }
  ```

#### `PUT /api/users/{id}` (Protected)
Updates user details, status, or assigned role.

#### `DELETE /api/users/{id}` (Protected)
Removes an employee. Cannot delete self or superadmin.

#### `POST /api/users/change-password` (Protected)
Allows logged-in users to update their own credentials.
* **Request Body**: `{"currentPassword": "...", "newPassword": "..."}`

#### `POST /api/users/{id}/reset-password` (Protected)
Allows administrators to override credentials for employees.
* **Permissions**: `superadmin`, `business_owner`.
* **Request Body**: `{"password": "..."}`

---

### 📂 Menu Organization & Items
#### `GET /api/categories` (Protected)
Gets store menu categories.

#### `POST /api/categories` (Protected)
Creates a new menu category.

#### `PUT /api/categories/{id}` (Protected)
Updates a category's name or description.

#### `DELETE /api/categories/{id}` (Protected)
Soft deletes a category.

#### `GET /api/items` (Protected)
Gets menu items along with their category names.

#### `POST /api/items` (Protected)
Creates a new menu item.
* **Request Body**: `Item` model containing price, HSN, and tax rate.

#### `PUT /api/items/{id}` (Protected)
Updates a menu item.

#### `DELETE /api/items/{id}` (Protected)
Soft deletes a menu item.

---

### 🪑 Floor Layout
#### `GET /api/tables` (Protected)
Gets restaurant dining table structures.

#### `POST /api/tables` (Protected)
Creates a new table. Requires seat count and 2D coordinates.

#### `PUT /api/tables/{id}` (Protected)
Updates a table's seats or grid coordinates.

#### `DELETE /api/tables/{id}` (Protected)
Soft deletes a table.

---

### 🛒 Orders & Bills
#### `GET /api/orders` (Protected)
Gets active orders. Supports filtering by `status` query param.

#### `POST /api/orders` (Protected)
Initiates a new transactional dine-in order.
* **Request Body**: `Order` model with items slice. Runs inside a secure database transaction.

#### `PUT /api/orders/{id}` (Protected)
Updates active order quantities or comments.

#### `PATCH /api/orders/{id}/complete` (Protected)
Completes an order. Marks payment as paid.
* **Request Body**: `{"paymentMethod": "cash"}`

#### `PATCH /api/orders/{id}/cancel` (Protected)
Cancels an active order.

#### `GET /api/bills` (Protected)
Gets generated invoices.

#### `POST /api/bills` (Protected)
Saves a finalized invoice bill registry.

#### `GET /api/bills/next-invoice-no` (Protected)
Calculates and returns the sequential invoice number (e.g. `INV-000045`).

#### `POST /api/bills/{id}/print` (Protected)
Audits that a bill was printed.

---

### 🖨️ Thermal Printing proxy
#### `POST /api/print/invoice` (Protected)
Assembles a complete structured receipt containing totals, tax breakdowns, discount and UPI QR codes, and posts it to the local `mario-printer` endpoint `/print`.
* **Request Body**: `PrintInvoiceRequest` DTO.

#### `POST /api/print/kot` (Protected)
Assembles a Kitchen Order Ticket (KOT) listing item quantities and chef instructions and posts it to the `mario-printer` endpoint `/print`.

#### `GET /api/print/printers` (Protected)
Fetches and lists available USB/Network thermal printers detected by the local printing service.

---

### 🛠️ System Administration
#### `POST /api/system/reset` (Protected)
Resets selected entities in the system. Truncates tables cascadingly.
* **Permissions**: `superadmin` only.
* **Request Body**: `{"users": false, "stores": false, "orders": true, "bills": true}`

#### `GET /api/system/stats` (Protected)
Gets the row count metrics of all registers in the system.
* **Permissions**: `superadmin` only.
