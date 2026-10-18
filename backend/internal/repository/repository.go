package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"cafe-backend/internal/models"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

type CacheItem struct {
	Value      interface{}
	Expiration time.Time
}

type MemoryCache struct {
	mu    sync.RWMutex
	items map[string]CacheItem
}

func NewMemoryCache() *MemoryCache {
	return &MemoryCache{
		items: make(map[string]CacheItem),
	}
}

func (c *MemoryCache) Set(key string, value interface{}, duration time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = CacheItem{
		Value:      value,
		Expiration: time.Now().Add(duration),
	}
}

func (c *MemoryCache) Get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	item, found := c.items[key]
	if !found {
		return nil, false
	}
	if time.Now().After(item.Expiration) {
		return nil, false
	}
	return item.Value, true
}

func (c *MemoryCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, key)
}

func (c *MemoryCache) DeleteAllWithPrefix(prefix string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k := range c.items {
		if len(k) >= len(prefix) && k[:len(prefix)] == prefix {
			delete(c.items, k)
		}
	}
}

type Repository struct {
	Store           *StoreRepository
	User            *UserRepository
	Category        *CategoryRepository
	Item            *ItemRepository
	Table           *TableRepository
	Order           *OrderRepository
	Bill            *BillRepository
	System          *SystemRepository
	AppUpdate       *AppUpdateRepository
	SupportConfig   *SupportConfigRepository
	UpdateRepo      *UpdateRepoRepository
	Gemini          *GeminiConfigRepository
	Menu            *MenuRepository
	ExpenseCategory *ExpenseCategoryRepository
	Expense         *ExpenseRepository
	ItemExpense     *ItemExpenseRepository
	RevenueReport   *RevenueReportRepository
	Report          *ReportRepository
	SupportTicket   *SupportTicketRepository
	Cache           *MemoryCache
	db              *sql.DB
}

func NewRepository(db *sql.DB, redisCache *RedisCache) *Repository {
	cache := NewMemoryCache()
	return &Repository{
		db:              db,
		Store:           &StoreRepository{db: db},
		User:            &UserRepository{db: db},
		Category:        &CategoryRepository{db: db, redis: redisCache},
		Item:            &ItemRepository{db: db, redis: redisCache},
		Table:           &TableRepository{db: db, cache: cache},
		Order:           &OrderRepository{db: db},
		Bill:            &BillRepository{db: db, redis: redisCache},
		System:          &SystemRepository{db: db},
		AppUpdate:       &AppUpdateRepository{db: db},
		SupportConfig:   &SupportConfigRepository{db: db},
		UpdateRepo:      &UpdateRepoRepository{db: db},
		Gemini:          &GeminiConfigRepository{db: db},
		Menu:            &MenuRepository{db: db, redis: redisCache},
		ExpenseCategory: &ExpenseCategoryRepository{db: db, redis: redisCache},
		Expense:         &ExpenseRepository{db: db, redis: redisCache},
		ItemExpense:     &ItemExpenseRepository{db: db, redis: redisCache},
		RevenueReport:   &RevenueReportRepository{db: db},
		Report:          &ReportRepository{db: db},
		SupportTicket:   &SupportTicketRepository{db: db},
		Cache:           cache,
	}
}

// storeScopedTables lists tables that carry a store_id column. The whitelist
// is required because the table name is interpolated into the query.
var storeScopedTables = map[string]bool{
	"orders":             true,
	"categories":         true,
	"items":              true,
	"tables":             true,
	"table_sections":     true,
	"bills":              true,
	"bill_queue":         true,
	"expenses":           true,
	"expense_categories": true,
	"item_expenses":      true,
	"support_tickets":    true,
}

// GetRecordStoreID returns the store_id of a record in a store-scoped table.
// Used to authorize ID-based mutations against the record's owning store.
func (r *Repository) GetRecordStoreID(ctx context.Context, table, id string) (string, error) {
	if !storeScopedTables[table] {
		return "", fmt.Errorf("unsupported table for store lookup: %s", table)
	}
	var storeID sql.NullString
	err := r.db.QueryRowContext(ctx,
		"SELECT store_id FROM "+table+" WHERE id = $1", id).Scan(&storeID)
	if err != nil {
		return "", err
	}
	return storeID.String, nil
}

// CountForeignStoreRecords returns how many of the given record ids belong to
// a store other than storeID. Used to reject cross-store foreign-key
// references (order -> table, item -> category, order item -> item, ...).
// table must be one of the whitelisted store-scoped tables.
func (r *Repository) CountForeignStoreRecords(ctx context.Context, table string, ids []string, storeID string) (int, error) {
	if !storeScopedTables[table] {
		return 0, fmt.Errorf("unsupported table for store lookup: %s", table)
	}
	if len(ids) == 0 {
		return 0, nil
	}
	var count int
	err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM "+table+" WHERE id = ANY($1) AND store_id <> $2",
		pq.Array(ids), storeID).Scan(&count)
	return count, err
}

// ==========================================
// STORE REPOSITORY
// ==========================================

type StoreRepository struct {
	db *sql.DB
}

func (r *StoreRepository) GetAll(ctx context.Context, role, userID, storeID string) ([]models.Store, error) {
	var sqlStr string
	var args []interface{}

	if role == "superadmin" {
		sqlStr = "SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, app_version, app_version_seen_at, created_at FROM stores ORDER BY name"
	} else if role == "business_owner" {
		sqlStr = `SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, app_version, app_version_seen_at, created_at
		          FROM stores WHERE id IN (SELECT store_id FROM user_stores WHERE user_id = $1) ORDER BY name`
		args = append(args, userID)
	} else {
		sqlStr = `SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, app_version, app_version_seen_at, created_at
		          FROM stores WHERE id = $1 ORDER BY name`
		args = append(args, storeID)
	}

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []models.Store
	for rows.Next() {
		var s models.Store
		var branch, location, gstin, fssaiNo, phone, printerName, printerVendor, printerProduct, logoURL, themeColor, appVersion sql.NullString
		var appVersionSeenAt sql.NullTime
		err := rows.Scan(
			&s.ID, &s.Name, &branch, &location, &gstin, &fssaiNo, &phone,
			&printerName, &printerVendor, &printerProduct, &s.InvoiceSize, &s.KOTPrintEnabled, &s.RemoteBillingEnabled,
			&logoURL, &themeColor, &s.TaxEnabled, &s.DefaultTaxPercent, &s.IsActive, &appVersion, &appVersionSeenAt, &s.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		s.Branch = branch.String
		s.Location = location.String
		s.GSTIN = gstin.String
		s.FSSAINo = fssaiNo.String
		s.Phone = phone.String
		s.PrinterName = printerName.String
		s.PrinterVendorID = printerVendor.String
		s.PrinterProductID = printerProduct.String
		s.LogoURL = logoURL.String
		s.ThemeColor = themeColor.String
		s.AppVersion = appVersion.String
		if appVersionSeenAt.Valid {
			s.AppVersionSeenAt = &appVersionSeenAt.Time
		}
		stores = append(stores, s)
	}
	return stores, nil
}

func (r *StoreRepository) GetByID(ctx context.Context, id string) (*models.Store, error) {
	sqlStr := "SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, app_version, app_version_seen_at, created_at FROM stores WHERE id = $1"
	row := r.db.QueryRowContext(ctx, sqlStr, id)

	var s models.Store
	var branch, location, gstin, fssaiNo, phone, printerName, printerVendor, printerProduct, logoURL, themeColor, appVersion sql.NullString
	var appVersionSeenAt sql.NullTime
	err := row.Scan(
		&s.ID, &s.Name, &branch, &location, &gstin, &fssaiNo, &phone,
		&printerName, &printerVendor, &printerProduct, &s.InvoiceSize, &s.KOTPrintEnabled, &s.RemoteBillingEnabled,
		&logoURL, &themeColor, &s.TaxEnabled, &s.DefaultTaxPercent, &s.IsActive, &appVersion, &appVersionSeenAt, &s.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	s.Branch = branch.String
	s.Location = location.String
	s.GSTIN = gstin.String
	s.FSSAINo = fssaiNo.String
	s.Phone = phone.String
	s.PrinterName = printerName.String
	s.PrinterVendorID = printerVendor.String
	s.PrinterProductID = printerProduct.String
	s.LogoURL = logoURL.String
	s.ThemeColor = themeColor.String
	s.AppVersion = appVersion.String
	if appVersionSeenAt.Valid {
		s.AppVersionSeenAt = &appVersionSeenAt.Time
	}
	return &s, nil
}

func (r *StoreRepository) Create(ctx context.Context, s models.Store) error {
	sqlStr := `INSERT INTO stores (id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, tax_enabled, default_tax_percent, is_active)
	           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true)`
	_, err := r.db.ExecContext(ctx, sqlStr,
		s.ID, s.Name, s.Branch, s.Location, s.GSTIN, s.FSSAINo, s.Phone,
		s.PrinterName, s.PrinterVendorID, s.PrinterProductID, s.InvoiceSize, s.KOTPrintEnabled, s.RemoteBillingEnabled,
		s.TaxEnabled, s.DefaultTaxPercent,
	)
	return err
}

func (r *StoreRepository) Update(ctx context.Context, id string, updates map[string]interface{}) error {
	if len(updates) == 0 {
		return nil
	}

	query := "UPDATE stores SET "
	args := []interface{}{}
	idx := 1

	for k, v := range updates {
		query += fmt.Sprintf("%s = $%d, ", k, idx)
		args = append(args, v)
		idx++
	}
	query += fmt.Sprintf("updated_at = CURRENT_TIMESTAMP WHERE id = $%d", idx)
	args = append(args, id)

	_, err := r.db.ExecContext(ctx, query, args...)
	return err
}

func (r *StoreRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM stores WHERE id = $1", id)
	return err
}

func (r *StoreRepository) UpdateLogo(ctx context.Context, id, logoBase64, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE stores SET logo_url = $1, modified_by = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $2", logoBase64, id, modifiedBy)
	return err
}

func (r *StoreRepository) DeleteLogo(ctx context.Context, id, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE stores SET logo_url = NULL, modified_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1", id, modifiedBy)
	return err
}

// UpdateAppVersion records which desktop app version a store is running.
// Telemetry only — intentionally does not touch updated_at.
func (r *StoreRepository) UpdateAppVersion(ctx context.Context, storeID, version, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE stores SET app_version = $1, app_version_seen_at = CURRENT_TIMESTAMP, modified_by = $3 WHERE id = $2",
		version, storeID, modifiedBy)
	return err
}

func (r *StoreRepository) GetDefaultStore(ctx context.Context) (*models.Store, error) {
	sqlStr := "SELECT id, name, branch, location, logo_url FROM stores WHERE is_active = true ORDER BY created_at LIMIT 1"
	row := r.db.QueryRowContext(ctx, sqlStr)

	var s models.Store
	var branch, location, logoURL sql.NullString
	err := row.Scan(&s.ID, &s.Name, &branch, &location, &logoURL)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	s.Branch = branch.String
	s.Location = location.String
	s.LogoURL = logoURL.String
	return &s, nil
}

// ==========================================
// USER REPOSITORY
// ==========================================

type UserRepository struct {
	db *sql.DB
}

func (r *UserRepository) GetAll(ctx context.Context, role, userID, storeID string) ([]models.User, error) {
	sqlStr := `
		SELECT u.id, u.username, u.name, u.email, u.role, u.store_id, u.is_active, u.created_at,
		       s.name as store_name,
		       COALESCE(array_agg(us.store_id) FILTER (WHERE us.store_id IS NOT NULL), '{}') as store_ids
		FROM users u
		LEFT JOIN stores s ON u.store_id = s.id
		LEFT JOIN user_stores us ON u.id = us.user_id
		WHERE 1=1
	`
	var args []interface{}
	idx := 1

	if role == "business_owner" {
		sqlStr += fmt.Sprintf(" AND (u.store_id IN (SELECT store_id FROM user_stores WHERE user_id = $%d) OR u.id = $%d)", idx, idx)
		args = append(args, userID)
		idx++
	} else if role == "business_admin" {
		sqlStr += fmt.Sprintf(" AND u.store_id = $%d", idx)
		args = append(args, storeID)
		idx++
	}

	sqlStr += " GROUP BY u.id, s.name ORDER BY u.created_at DESC"

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var u models.User
		var email, storeIDNull, storeNameNull sql.NullString
		var storeIDs pq.StringArray
		err := rows.Scan(
			&u.ID, &u.Username, &u.Name, &email, &u.Role, &storeIDNull, &u.IsActive, &u.CreatedAt,
			&storeNameNull, &storeIDs,
		)
		if err != nil {
			return nil, err
		}
		u.Email = email.String
		u.StoreID = storeIDNull.String
		u.StoreName = storeNameNull.String
		u.StoreIDs = []string(storeIDs)
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*models.User, error) {
	sqlStr := `
		SELECT u.id, u.username, u.password, u.name, u.email, u.role, u.store_id, u.is_active, u.created_at,
		       s.name as store_name
		FROM users u
		LEFT JOIN stores s ON u.store_id = s.id
		WHERE u.id = $1
	`
	row := r.db.QueryRowContext(ctx, sqlStr, id)

	var u models.User
	var email, storeIDNull, storeNameNull sql.NullString
	err := row.Scan(
		&u.ID, &u.Username, &u.Password, &u.Name, &email, &u.Role, &storeIDNull, &u.IsActive, &u.CreatedAt,
		&storeNameNull,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Email = email.String
	u.StoreID = storeIDNull.String
	u.StoreName = storeNameNull.String
	return &u, nil
}

func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	sqlStr := `
		SELECT u.id, u.username, u.password, u.name, u.email, u.role, u.store_id, u.is_active, u.created_at,
		       s.name as store_name
		FROM users u
		LEFT JOIN stores s ON u.store_id = s.id
		WHERE u.username = $1 AND u.is_active = true
	`
	row := r.db.QueryRowContext(ctx, sqlStr, username)

	var u models.User
	var email, storeIDNull, storeNameNull sql.NullString
	err := row.Scan(
		&u.ID, &u.Username, &u.Password, &u.Name, &email, &u.Role, &storeIDNull, &u.IsActive, &u.CreatedAt,
		&storeNameNull,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Email = email.String
	u.StoreID = storeIDNull.String
	u.StoreName = storeNameNull.String
	return &u, nil
}

func (r *UserRepository) GetUserStores(ctx context.Context, userID string) ([]models.Store, error) {
	sqlStr := `
		SELECT s.id, s.name, s.branch
		FROM stores s
		JOIN user_stores us ON s.id = us.store_id
		WHERE us.user_id = $1 AND s.is_active = true
		ORDER BY s.name, s.id
	`
	rows, err := r.db.QueryContext(ctx, sqlStr, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []models.Store
	for rows.Next() {
		var s models.Store
		var branch sql.NullString
		if err := rows.Scan(&s.ID, &s.Name, &branch); err != nil {
			return nil, err
		}
		s.Branch = branch.String
		stores = append(stores, s)
	}
	return stores, nil
}

func (r *UserRepository) Create(ctx context.Context, u models.User, storeIDs []string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	sqlStr := `INSERT INTO users (id, username, password, name, email, role, store_id, is_active)
	           VALUES ($1, $2, $3, $4, $5, $6, $7, true)`
	var finalStoreID interface{}
	if u.StoreID != "" {
		finalStoreID = u.StoreID
	}

	_, err = tx.ExecContext(ctx, sqlStr, u.ID, u.Username, u.Password, u.Name, u.Email, u.Role, finalStoreID)
	if err != nil {
		return err
	}

	if u.Role == "business_owner" && len(storeIDs) > 0 {
		for _, sid := range storeIDs {
			_, err = tx.ExecContext(ctx, `
				INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
			`, u.ID, sid)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (r *UserRepository) Update(ctx context.Context, id string, updates map[string]interface{}, storeIDs []string, hasStoreIDs bool) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if len(updates) > 0 {
		query := "UPDATE users SET "
		args := []interface{}{}
		idx := 1

		for k, v := range updates {
			query += fmt.Sprintf("%s = $%d, ", k, idx)
			args = append(args, v)
			idx++
		}
		query += fmt.Sprintf("updated_at = CURRENT_TIMESTAMP WHERE id = $%d", idx)
		args = append(args, id)

		_, err = tx.ExecContext(ctx, query, args...)
		if err != nil {
			return err
		}
	}

	if hasStoreIDs {
		// Clean up and re-map
		_, err = tx.ExecContext(ctx, "DELETE FROM user_stores WHERE user_id = $1", id)
		if err != nil {
			return err
		}

		for _, sid := range storeIDs {
			_, err = tx.ExecContext(ctx, `
				INSERT INTO user_stores (user_id, store_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
			`, id, sid)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (r *UserRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM users WHERE id = $1", id)
	return err
}

func (r *UserRepository) UpdatePassword(ctx context.Context, id, hashedPassword, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE users SET password = $1, modified_by = $3 WHERE id = $2", hashedPassword, id, modifiedBy)
	return err
}

// ==========================================
// CATEGORY REPOSITORY
// ==========================================

type CategoryRepository struct {
	db    *sql.DB
	redis *RedisCache
}

func (r *CategoryRepository) GetAll(ctx context.Context, storeID string) ([]models.Category, error) {
	cacheKey := "categories:" + storeID
	if r.redis != nil {
		if raw, ok := r.redis.Get(ctx, cacheKey); ok {
			var cached []models.Category
			if err := json.Unmarshal(raw, &cached); err == nil {
				return cached, nil
			}
		}
	}

	rows, err := r.db.QueryContext(ctx, "SELECT id, store_id, name, description, is_active, enabled, is_favourite, sort_order FROM categories WHERE store_id = $1 AND is_active = true ORDER BY is_favourite DESC, sort_order, name", storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var c models.Category
		var desc sql.NullString
		if err := rows.Scan(&c.ID, &c.StoreID, &c.Name, &desc, &c.IsActive, &c.Enabled, &c.IsFavourite, &c.SortOrder); err != nil {
			return nil, err
		}
		c.Description = desc.String
		categories = append(categories, c)
	}

	if r.redis != nil {
		if raw, err := json.Marshal(categories); err == nil {
			r.redis.Set(ctx, cacheKey, raw, 30*time.Minute)
		}
	}
	return categories, nil
}

func (r *CategoryRepository) Create(ctx context.Context, c models.Category) error {
	// New categories are appended to the end of the manual sort order.
	_, err := r.db.ExecContext(ctx, "INSERT INTO categories (id, store_id, name, description, enabled, is_favourite, sort_order) VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE store_id = $2))",
		c.ID, c.StoreID, c.Name, c.Description, c.Enabled, c.IsFavourite)
	if err == nil && r.redis != nil {
		r.redis.Delete(ctx, "categories:"+c.StoreID)
	}
	return err
}

// Reorder assigns sequential sort_order values (1..N) to the given category
// IDs, in the order provided. IDs that do not belong to the store are ignored.
func (r *CategoryRepository) Reorder(ctx context.Context, storeID string, orderedIDs []string, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, "UPDATE categories SET sort_order = $1, modified_by = $2 WHERE id = $3 AND store_id = $4")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for i, id := range orderedIDs {
		if _, err := stmt.ExecContext(ctx, i+1, modifiedBy, id, storeID); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}
	if r.redis != nil {
		r.redis.Delete(ctx, "categories:"+storeID)
	}
	return nil
}

func (r *CategoryRepository) Update(ctx context.Context, c models.Category) error {
	_, err := r.db.ExecContext(ctx, "UPDATE categories SET name = $1, description = $2, enabled = $3, is_favourite = $4, modified_by = $5 WHERE id = $6",
		c.Name, c.Description, c.Enabled, c.IsFavourite, c.ModifiedBy, c.ID)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, "categories:")
	}
	return err
}

func (r *CategoryRepository) Delete(ctx context.Context, id, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE categories SET is_active = false, modified_by = $2 WHERE id = $1", id, modifiedBy)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, "categories:")
	}
	return err
}

// ==========================================
// ITEM REPOSITORY
// ==========================================

type ItemRepository struct {
	db    *sql.DB
	redis *RedisCache
}

const itemsCacheKeyPrefix = "items:v2:"

func itemsCacheKey(storeID string, includeProfit bool) string {
	if includeProfit {
		return itemsCacheKeyPrefix + "profit:" + storeID
	}
	return itemsCacheKeyPrefix + storeID
}

func itemExpensesTableExists(ctx context.Context, db *sql.DB) bool {
	var exists bool
	err := db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = current_schema() AND table_name = 'item_expenses'
		)
	`).Scan(&exists)
	return err == nil && exists
}

func applyItemProfitFields(i *models.Item) {
	if i.TotalCost <= 0 {
		i.TotalCost = 0
		i.Profit = 0
		i.ProfitPercent = 0
		return
	}
	i.Profit, i.ProfitPercent = computeItemProfit(i.Price, i.TotalCost)
}

func (r *ItemRepository) invalidateCache(ctx context.Context, storeID string) {
	if r.redis == nil {
		return
	}
	r.redis.Delete(ctx, itemsCacheKey(storeID, false))
	r.redis.Delete(ctx, itemsCacheKey(storeID, true))
	r.redis.Delete(ctx, "items:"+storeID)
}

func (r *ItemRepository) GetAll(ctx context.Context, storeID string, includeProfit bool) ([]models.Item, error) {
	cacheKey := itemsCacheKey(storeID, includeProfit)
	if r.redis != nil {
		if raw, ok := r.redis.Get(ctx, cacheKey); ok {
			var cached []models.Item
			if err := json.Unmarshal(raw, &cached); err == nil {
				return cached, nil
			}
		}
	}

	hasItemExpenses := includeProfit && itemExpensesTableExists(ctx, r.db)

	var sqlStr string
	if hasItemExpenses {
		sqlStr = `
			SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active, i.enabled, i.is_favourite,
			       c.name as category_name,
			       COALESCE((SELECT SUM(ie.amount) FROM item_expenses ie WHERE ie.item_id = i.id AND ie.is_active = true), 0) as total_cost
			FROM items i
			LEFT JOIN categories c ON i.category_id = c.id
			WHERE i.store_id = $1 AND i.is_active = true
			ORDER BY i.is_favourite DESC, i.name
		`
	} else {
		// Legacy response shape for clients that do not request profit data
		sqlStr = `
			SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active, i.enabled, i.is_favourite,
			       c.name as category_name
			FROM items i
			LEFT JOIN categories c ON i.category_id = c.id
			WHERE i.store_id = $1 AND i.is_active = true
			ORDER BY i.is_favourite DESC, i.name
		`
	}

	rows, err := r.db.QueryContext(ctx, sqlStr, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.Item
	for rows.Next() {
		var i models.Item
		var desc, hsn, catName sql.NullString
		if hasItemExpenses {
			err = rows.Scan(
				&i.ID, &i.StoreID, &i.CategoryID, &i.Name, &desc, &i.Price, &hsn, &i.TaxPercent, &i.IsActive, &i.Enabled, &i.IsFavourite,
				&catName, &i.TotalCost,
			)
		} else {
			err = rows.Scan(
				&i.ID, &i.StoreID, &i.CategoryID, &i.Name, &desc, &i.Price, &hsn, &i.TaxPercent, &i.IsActive, &i.Enabled, &i.IsFavourite,
				&catName,
			)
		}
		if err != nil {
			return nil, err
		}
		i.Description = desc.String
		i.HSNCode = hsn.String
		i.CategoryName = catName.String
		if includeProfit {
			applyItemProfitFields(&i)
		}
		items = append(items, i)
	}

	if r.redis != nil {
		if raw, err := json.Marshal(items); err == nil {
			r.redis.Set(ctx, cacheKey, raw, 30*time.Minute)
		}
	}
	return items, nil
}

func (r *ItemRepository) Create(ctx context.Context, i models.Item) error {
	sqlStr := "INSERT INTO items (id, store_id, category_id, name, description, price, hsn_code, tax_percent, enabled, is_favourite) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
	_, err := r.db.ExecContext(ctx, sqlStr, i.ID, i.StoreID, i.CategoryID, i.Name, i.Description, i.Price, i.HSNCode, i.TaxPercent, i.Enabled, i.IsFavourite)
	if err == nil && r.redis != nil {
		r.invalidateCache(ctx, i.StoreID)
	}
	return err
}

func (r *ItemRepository) Update(ctx context.Context, i models.Item) error {
	sqlStr := "UPDATE items SET category_id = $1, name = $2, description = $3, price = $4, hsn_code = $5, tax_percent = $6, enabled = $7, is_favourite = $8, modified_by = $9 WHERE id = $10"
	_, err := r.db.ExecContext(ctx, sqlStr, i.CategoryID, i.Name, i.Description, i.Price, i.HSNCode, i.TaxPercent, i.Enabled, i.IsFavourite, i.ModifiedBy, i.ID)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, itemsCacheKeyPrefix)
		r.redis.DeleteByPrefix(ctx, "items:")
	}
	return err
}

func (r *ItemRepository) Delete(ctx context.Context, id, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE items SET is_active = false, modified_by = $2 WHERE id = $1", id, modifiedBy)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, itemsCacheKeyPrefix)
		r.redis.DeleteByPrefix(ctx, "items:")
	}
	return err
}

func computeItemProfit(price, totalCost float64) (profit, profitPercent float64) {
	profit = price - totalCost
	if price > 0 {
		profitPercent = (profit / price) * 100
	}
	return
}

// ==========================================
// ITEM EXPENSE REPOSITORY
// ==========================================

type ItemExpenseRepository struct {
	db    *sql.DB
	redis *RedisCache
}

func (r *ItemExpenseRepository) invalidateItemCache(ctx context.Context, storeID string) {
	if r.redis != nil {
		r.redis.Delete(ctx, itemsCacheKey(storeID, false))
		r.redis.Delete(ctx, itemsCacheKey(storeID, true))
		r.redis.Delete(ctx, "items:"+storeID)
	}
}

func (r *ItemExpenseRepository) tableExists(ctx context.Context) bool {
	return itemExpensesTableExists(ctx, r.db)
}

func (r *ItemExpenseRepository) GetByItemID(ctx context.Context, itemID string) ([]models.ItemExpense, error) {
	if !r.tableExists(ctx) {
		return []models.ItemExpense{}, nil
	}
	sqlStr := `
		SELECT id, store_id, item_id, name, description, amount, is_active, created_at
		FROM item_expenses
		WHERE item_id = $1 AND is_active = true
		ORDER BY name
	`
	rows, err := r.db.QueryContext(ctx, sqlStr, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expenses []models.ItemExpense
	for rows.Next() {
		var e models.ItemExpense
		var desc sql.NullString
		var createdAt sql.NullTime
		if err := rows.Scan(&e.ID, &e.StoreID, &e.ItemID, &e.Name, &desc, &e.Amount, &e.IsActive, &createdAt); err != nil {
			return nil, err
		}
		e.Description = desc.String
		if createdAt.Valid {
			e.CreatedAt = createdAt.Time
		}
		expenses = append(expenses, e)
	}
	if expenses == nil {
		expenses = []models.ItemExpense{}
	}
	return expenses, nil
}

func (r *ItemExpenseRepository) Create(ctx context.Context, e models.ItemExpense) error {
	if !r.tableExists(ctx) {
		return fmt.Errorf("item_expenses table not available; restart the server to apply migrations")
	}
	sqlStr := `INSERT INTO item_expenses (id, store_id, item_id, name, description, amount) VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := r.db.ExecContext(ctx, sqlStr, e.ID, e.StoreID, e.ItemID, e.Name, e.Description, e.Amount)
	if err == nil {
		r.invalidateItemCache(ctx, e.StoreID)
	}
	return err
}

func (r *ItemExpenseRepository) Update(ctx context.Context, e models.ItemExpense) error {
	if !r.tableExists(ctx) {
		return fmt.Errorf("item_expenses table not available; restart the server to apply migrations")
	}
	sqlStr := `UPDATE item_expenses SET name = $1, description = $2, amount = $3, modified_by = $4 WHERE id = $5`
	_, err := r.db.ExecContext(ctx, sqlStr, e.Name, e.Description, e.Amount, e.ModifiedBy, e.ID)
	if err == nil {
		r.invalidateItemCache(ctx, e.StoreID)
	}
	return err
}

func (r *ItemExpenseRepository) Delete(ctx context.Context, id, storeID, modifiedBy string) error {
	if !r.tableExists(ctx) {
		return fmt.Errorf("item_expenses table not available; restart the server to apply migrations")
	}
	_, err := r.db.ExecContext(ctx, "UPDATE item_expenses SET is_active = false, modified_by = $2 WHERE id = $1", id, modifiedBy)
	if err == nil {
		r.invalidateItemCache(ctx, storeID)
	}
	return err
}

func (r *ItemExpenseRepository) GetProfitReport(ctx context.Context, storeID string) (*models.ItemProfitReport, error) {
	hasItemExpenses := r.tableExists(ctx)

	var query string
	if hasItemExpenses {
		query = `
			SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active,
			       c.name as category_name,
			       COALESCE((SELECT SUM(ie.amount) FROM item_expenses ie WHERE ie.item_id = i.id AND ie.is_active = true), 0) as total_cost
			FROM items i
			LEFT JOIN categories c ON i.category_id = c.id
			WHERE i.store_id = $1 AND i.is_active = true
			ORDER BY i.name
		`
	} else {
		query = `
			SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active,
			       c.name as category_name
			FROM items i
			LEFT JOIN categories c ON i.category_id = c.id
			WHERE i.store_id = $1 AND i.is_active = true
			ORDER BY i.name
		`
	}

	items, err := r.db.QueryContext(ctx, query, storeID)
	if err != nil {
		return nil, err
	}
	defer items.Close()

	report := &models.ItemProfitReport{
		StoreID: storeID,
		Items:   []models.ItemProfitEntry{},
	}

	var profitPercents []float64
	for items.Next() {
		var item models.Item
		var desc, hsn, catName sql.NullString
		if hasItemExpenses {
			if err := items.Scan(
				&item.ID, &item.StoreID, &item.CategoryID, &item.Name, &desc, &item.Price, &hsn, &item.TaxPercent, &item.IsActive,
				&catName, &item.TotalCost,
			); err != nil {
				return nil, err
			}
		} else {
			if err := items.Scan(
				&item.ID, &item.StoreID, &item.CategoryID, &item.Name, &desc, &item.Price, &hsn, &item.TaxPercent, &item.IsActive,
				&catName,
			); err != nil {
				return nil, err
			}
		}
		item.Description = desc.String
		item.HSNCode = hsn.String
		item.CategoryName = catName.String
		applyItemProfitFields(&item)

		expenses, err := r.GetByItemID(ctx, item.ID)
		if err != nil {
			return nil, err
		}

		entry := models.ItemProfitEntry{
			Item:          item,
			Expenses:      expenses,
			TotalCost:     item.TotalCost,
			Profit:        item.Profit,
			ProfitPercent: item.ProfitPercent,
		}
		report.Items = append(report.Items, entry)
		report.TotalSellingValue += item.Price
		report.TotalCost += item.TotalCost
		report.TotalProfit += item.Profit
		if item.TotalCost > 0 {
			report.ItemsWithCostCount++
			profitPercents = append(profitPercents, item.ProfitPercent)
		}
	}

	if len(profitPercents) > 0 {
		var sum float64
		for _, p := range profitPercents {
			sum += p
		}
		report.AverageProfitPercent = sum / float64(len(profitPercents))
	}

	return report, nil
}

// ==========================================
// TABLE REPOSITORY
// ==========================================

type TableRepository struct {
	db    *sql.DB
	cache *MemoryCache
}

func (r *TableRepository) GetAll(ctx context.Context, storeID string) ([]models.Table, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT id, store_id, number, name, seats, position_x, position_y, is_active, section FROM tables WHERE store_id = $1 AND is_active = true ORDER BY number", storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []models.Table
	for rows.Next() {
		var t models.Table
		var name sql.NullString
		if err := rows.Scan(&t.ID, &t.StoreID, &t.Number, &name, &t.Seats, &t.Position.X, &t.Position.Y, &t.IsActive, &t.Section); err != nil {
			return nil, err
		}
		if name.Valid && name.String != "" {
			t.Name = &name.String
		}
		tables = append(tables, t)
	}

	return tables, nil
}

func (r *TableRepository) Create(ctx context.Context, t models.Table) error {
	fmt.Printf("TableRepository.Create: id=%s store_id=%s number=%d name=%v seats=%d pos=(%d,%d) section=%v\n",
		t.ID, t.StoreID, t.Number, t.Name, t.Seats, t.Position.X, t.Position.Y, t.Section)
	var name interface{}
	if t.Name != nil && *t.Name != "" {
		name = *t.Name
	}
	_, err := r.db.ExecContext(ctx, "INSERT INTO tables (id, store_id, number, name, seats, position_x, position_y, section) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
		t.ID, t.StoreID, t.Number, name, t.Seats, t.Position.X, t.Position.Y, t.Section)
	if err != nil {
		fmt.Println("TableRepository.Create: exec error -", err)
	}
	return err
}

// NextNumber returns the next free table number within a store+section. Used
// to assign an internal number when a client creates a table with only an
// alphanumeric name. Numbers may repeat across different sections, so the max
// is scoped to the target section (NULL = the default section).
func (r *TableRepository) NextNumber(ctx context.Context, storeID string, section *string) (int, error) {
	var n int
	var sec interface{}
	if section != nil {
		sec = *section
	}
	err := r.db.QueryRowContext(ctx,
		"SELECT COALESCE(MAX(number), 0) + 1 FROM tables WHERE store_id = $1 AND COALESCE(section, '') = COALESCE($2::text, '')",
		storeID, sec).Scan(&n)
	return n, err
}

func (r *TableRepository) GetByID(ctx context.Context, id string) (*models.Table, error) {
	row := r.db.QueryRowContext(ctx, "SELECT id, store_id, number, name, seats, position_x, position_y, is_active, section FROM tables WHERE id = $1", id)
	var t models.Table
	var name sql.NullString
	if err := row.Scan(&t.ID, &t.StoreID, &t.Number, &name, &t.Seats, &t.Position.X, &t.Position.Y, &t.IsActive, &t.Section); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if name.Valid && name.String != "" {
		t.Name = &name.String
	}
	return &t, nil
}

func (r *TableRepository) Update(ctx context.Context, t models.Table) error {
	// name uses COALESCE so a NULL param (field absent in the request JSON)
	// preserves the existing value — old clients can't wipe a name they
	// don't know about.
	_, err := r.db.ExecContext(ctx, "UPDATE tables SET number = $1, seats = $2, position_x = $3, position_y = $4, section = $5, name = COALESCE($6, name), modified_by = $7 WHERE id = $8",
		t.Number, t.Seats, t.Position.X, t.Position.Y, t.Section, t.Name, t.ModifiedBy, t.ID)
	return err
}

func (r *TableRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM tables WHERE id = $1", id)
	return err
}

// RenameSection bulk-renames a section within a store (case-sensitive match).
// If oldName is empty, it targets tables with NULL section (the default).
// It also renames the matching row in table_sections so the catalog stays in sync.
func (r *TableRepository) RenameSection(ctx context.Context, storeID, oldName, newName, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		"UPDATE tables SET section = $1, modified_by = $4 WHERE store_id = $2 AND COALESCE(section, '') = COALESCE($3, '')",
		newName, storeID, oldName, modifiedBy); err != nil {
		return err
	}

	if oldName != "" {
		if _, err := tx.ExecContext(ctx,
			"UPDATE table_sections SET name = $1, modified_by = $4 WHERE store_id = $2 AND name = $3",
			newName, storeID, oldName, modifiedBy); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// DeleteSection clears the section on all tables in the given section,
// effectively moving them back to the default (NULL) section, and removes the
// section from the table_sections catalog.
func (r *TableRepository) DeleteSection(ctx context.Context, storeID, sectionName, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		"UPDATE tables SET section = NULL, modified_by = $3 WHERE store_id = $1 AND COALESCE(section, '') = COALESCE($2, '')",
		storeID, sectionName, modifiedBy); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		"DELETE FROM table_sections WHERE store_id = $1 AND name = $2",
		storeID, sectionName); err != nil {
		return err
	}

	return tx.Commit()
}

// GetSections returns all sections defined for a store from the table_sections catalog.
func (r *TableRepository) GetSections(ctx context.Context, storeID string) ([]models.TableSection, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT id, store_id, name, is_default, created_at FROM table_sections WHERE store_id = $1 ORDER BY name", storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sections []models.TableSection
	for rows.Next() {
		var s models.TableSection
		if err := rows.Scan(&s.ID, &s.StoreID, &s.Name, &s.IsDefault, &s.CreatedAt); err != nil {
			return nil, err
		}
		sections = append(sections, s)
	}
	return sections, nil
}

// CreateSection creates a section in the catalog so it can exist independently
// of any table. Duplicate names for the same store are ignored.
func (r *TableRepository) CreateSection(ctx context.Context, storeID, name string) error {
	_, err := r.db.ExecContext(ctx,
		"INSERT INTO table_sections (id, store_id, name) VALUES ($1, $2, $3) ON CONFLICT (store_id, name) DO NOTHING",
		uuid.New().String(), storeID, name)
	return err
}

// SetDefaultSection marks one catalog section as the store's default and clears
// the flag on every other section. The row is created first if the section is
// only known via tables (or not at all) so the flag always has a home.
func (r *TableRepository) SetDefaultSection(ctx context.Context, storeID, name, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		"INSERT INTO table_sections (id, store_id, name) VALUES ($1, $2, $3) ON CONFLICT (store_id, name) DO NOTHING",
		uuid.New().String(), storeID, name); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		"UPDATE table_sections SET is_default = (name = $2), modified_by = $3 WHERE store_id = $1",
		storeID, name, modifiedBy); err != nil {
		return err
	}

	return tx.Commit()
}

// ==========================================
// ORDER REPOSITORY
// ==========================================

type OrderRepository struct {
	db *sql.DB
}

// OrderFilter bounds the rows returned by GetAll. Empty fields are ignored,
// so a zero-value filter reproduces the previous "everything" behaviour.
type OrderFilter struct {
	Statuses []string
	From     *time.Time
	To       *time.Time
	Limit    int
}

func (r *OrderRepository) GetAll(ctx context.Context, storeID string, f OrderFilter) ([]models.Order, error) {
	sqlStr := `
		SELECT o.id, o.store_id, o.table_id, o.table_number, o.table_name, o.status, o.order_type, o.customer_name, o.customer_mobile,
		       o.total_amount, o.tax_amount, o.discount_amount,
		       o.payment_method, o.payment_status, o.created_by, o.created_at, o.updated_at, o.cancelled_at,
		       COALESCE(
		         json_agg(
		           json_build_object(
		             'itemId', oi.item_id,
		             'quantity', oi.quantity,
		             'unitPrice', oi.unit_price,
		             'taxPercent', oi.tax_percent,
		             'notes', COALESCE(oi.notes, ''),
		             'item', json_build_object(
		               'id', i.id,
		               'name', i.name,
		               'price', i.price,
		               'description', COALESCE(i.description, ''),
		               'categoryId', i.category_id,
		               'categoryName', COALESCE(c.name, 'Uncategorised')
		             )
		           ) ORDER BY oi.id
		         ) FILTER (WHERE oi.id IS NOT NULL),
		         '[]'
		       ) as items
		FROM orders o
		LEFT JOIN order_items oi ON o.id = oi.order_id
		LEFT JOIN items i ON oi.item_id = i.id
		LEFT JOIN categories c ON i.category_id = c.id
		WHERE o.store_id = $1
	`
	var args []interface{}
	args = append(args, storeID)
	idx := 2

	if len(f.Statuses) > 0 {
		sqlStr += fmt.Sprintf(" AND o.status = ANY($%d)", idx)
		args = append(args, pq.Array(f.Statuses))
		idx++
	}
	if f.From != nil {
		sqlStr += fmt.Sprintf(" AND o.created_at >= $%d", idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		sqlStr += fmt.Sprintf(" AND o.created_at <= $%d", idx)
		args = append(args, *f.To)
		idx++
	}

	sqlStr += " GROUP BY o.id ORDER BY o.created_at DESC"

	if f.Limit > 0 {
		sqlStr += fmt.Sprintf(" LIMIT $%d", idx)
		args = append(args, f.Limit)
	}

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var o models.Order
		var tableID, tableName, method, statusPay, createdBy, orderType, customerName, customerMobile sql.NullString
		var cancelledAt sql.NullTime
		var itemsBytes []byte
		err := rows.Scan(
			&o.ID, &o.StoreID, &tableID, &o.TableNumber, &tableName, &o.Status, &orderType, &customerName, &customerMobile,
			&o.TotalAmount, &o.TaxAmount, &o.DiscountAmount,
			&method, &statusPay, &createdBy, &o.CreatedAt, &o.UpdatedAt, &cancelledAt,
			&itemsBytes,
		)
		if err != nil {
			return nil, err
		}
		o.TableID = tableID.String
		o.TableName = tableName.String
		o.PaymentMethod = method.String
		o.PaymentStatus = statusPay.String
		o.CreatedBy = createdBy.String
		o.OrderType = orderType.String
		o.CustomerName = customerName.String
		o.CustomerMobile = customerMobile.String
		if cancelledAt.Valid {
			o.CancelledAt = &cancelledAt.Time
		}

		if len(itemsBytes) > 0 {
			var items []models.OrderItem
			if err := json.Unmarshal(itemsBytes, &items); err == nil {
				o.Items = items
			}
		}
		if o.Items == nil {
			o.Items = []models.OrderItem{}
		}

		orders = append(orders, o)
	}
	return orders, nil
}

func (r *OrderRepository) GetByID(ctx context.Context, orderID string) (*models.Order, error) {
	sqlStr := `
		SELECT o.id, o.store_id, o.table_id, o.table_number, o.table_name, o.status, o.order_type, o.customer_name, o.customer_mobile,
		       o.total_amount, o.tax_amount, o.discount_amount,
		       o.payment_method, o.payment_status, o.created_by, o.created_at, o.updated_at, o.cancelled_at,
		       COALESCE(
		         json_agg(
		           json_build_object(
		             'itemId', oi.item_id,
		             'quantity', oi.quantity,
		             'unitPrice', oi.unit_price,
		             'taxPercent', oi.tax_percent,
		             'notes', COALESCE(oi.notes, ''),
		             'item', json_build_object(
		               'id', i.id,
		               'name', i.name,
		               'price', i.price,
		               'description', COALESCE(i.description, '')
		             )
		           )
		         ) FILTER (WHERE oi.id IS NOT NULL),
		         '[]'
		       ) as items
		FROM orders o
		LEFT JOIN order_items oi ON o.id = oi.order_id
		LEFT JOIN items i ON oi.item_id = i.id
		WHERE o.id = $1
		GROUP BY o.id
	`
	row := r.db.QueryRowContext(ctx, sqlStr, orderID)

	var o models.Order
	var tableID, tableName, method, statusPay, createdBy, orderType, customerName, customerMobile sql.NullString
	var cancelledAt sql.NullTime
	var itemsBytes []byte
	err := row.Scan(
		&o.ID, &o.StoreID, &tableID, &o.TableNumber, &tableName, &o.Status, &orderType, &customerName, &customerMobile,
		&o.TotalAmount, &o.TaxAmount, &o.DiscountAmount,
		&method, &statusPay, &createdBy, &o.CreatedAt, &o.UpdatedAt, &cancelledAt,
		&itemsBytes,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	o.TableID = tableID.String
	o.TableName = tableName.String
	o.PaymentMethod = method.String
	o.PaymentStatus = statusPay.String
	o.CreatedBy = createdBy.String
	o.OrderType = orderType.String
	o.CustomerName = customerName.String
	o.CustomerMobile = customerMobile.String
	if cancelledAt.Valid {
		o.CancelledAt = &cancelledAt.Time
	}

	if len(itemsBytes) > 0 {
		var items []models.OrderItem
		if err := json.Unmarshal(itemsBytes, &items); err == nil {
			o.Items = items
		}
	}
	if o.Items == nil {
		o.Items = []models.OrderItem{}
	}

	return &o, nil
}

func (r *OrderRepository) Create(ctx context.Context, o models.Order) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// table_name falls back to the referenced table's name so clients that
	// only send tableId still get the alphanumeric label snapshotted.
	sqlStr := `INSERT INTO orders (id, store_id, table_id, table_number, table_name, status, order_type, customer_name, customer_mobile, total_amount, tax_amount, discount_amount, payment_method, created_by)
	           VALUES ($1, $2, $3, $4, COALESCE(NULLIF($5, ''), (SELECT t.name FROM tables t WHERE t.id = $3)), 'active', $6, $7, $8, $9, $10, $11, $12, $13)`
	var payMethod, orderType, customerName, customerMobile, tableID, tableName interface{}
	if o.PaymentMethod != "" {
		payMethod = o.PaymentMethod
	}
	if o.OrderType != "" {
		orderType = o.OrderType
	}
	if o.CustomerName != "" {
		customerName = o.CustomerName
	}
	if o.CustomerMobile != "" {
		customerMobile = o.CustomerMobile
	}
	if o.TableID != "" {
		tableID = o.TableID
	}
	if o.TableName != "" {
		tableName = o.TableName
	}

	_, err = tx.ExecContext(ctx, sqlStr,
		o.ID, o.StoreID, tableID, o.TableNumber, tableName, orderType, customerName, customerMobile, o.TotalAmount, o.TaxAmount, o.DiscountAmount, payMethod, o.CreatedBy,
	)
	if err != nil {
		return err
	}

	for _, item := range o.Items {
		var notes interface{}
		if item.Notes != "" {
			notes = item.Notes
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO order_items (order_id, item_id, quantity, unit_price, tax_percent, notes)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, o.ID, item.ItemID, item.Quantity, item.Item.Price, item.Item.TaxPercent, notes)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *OrderRepository) Update(ctx context.Context, id string, updates map[string]interface{}, items []models.OrderItem, hasItems bool, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if hasItems {
		// Clean and insert items
		_, err = tx.ExecContext(ctx, "DELETE FROM order_items WHERE order_id = $1", id)
		if err != nil {
			return err
		}

		for _, item := range items {
			var notes interface{}
			if item.Notes != "" {
				notes = item.Notes
			}

			price := item.UnitPrice
			if price == 0 && item.Item.Price != 0 {
				price = item.Item.Price
			}

			_, err = tx.ExecContext(ctx, `
				INSERT INTO order_items (order_id, item_id, quantity, unit_price, tax_percent, notes, modified_by)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
			`, id, item.ItemID, item.Quantity, price, item.TaxPercent, notes, modifiedBy)
			if err != nil {
				return err
			}
		}
	}

	if len(updates) > 0 {
		query := "UPDATE orders SET "
		args := []interface{}{}
		idx := 1

		for k, v := range updates {
			query += fmt.Sprintf("%s = $%d, ", k, idx)
			args = append(args, v)
			idx++
		}
		query += fmt.Sprintf("updated_at = CURRENT_TIMESTAMP WHERE id = $%d", idx)
		args = append(args, id)

		_, err = tx.ExecContext(ctx, query, args...)
		if err != nil {
			return err
		}
	} else {
		// Update only updated_at timestamp if no fields changed but items did
		_, err = tx.ExecContext(ctx, "UPDATE orders SET updated_at = CURRENT_TIMESTAMP, modified_by = $2 WHERE id = $1", id, modifiedBy)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *OrderRepository) Complete(ctx context.Context, id, paymentMethod, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE orders SET status = 'completed', payment_status = 'paid', payment_method = $1, modified_by = $3, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, paymentMethod, id, modifiedBy)
	return err
}

func (r *OrderRepository) Cancel(ctx context.Context, id, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		UPDATE orders SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, modified_by = $2 WHERE id = $1
	`, id, modifiedBy)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE bills SET status = 'cancelled', modified_by = $2 WHERE order_id = $1 AND (status IS NULL OR status = 'active')
	`, id, modifiedBy)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// ErrOrderNotMergeable is returned by MergeOrders when either order is missing
// or no longer active (e.g. it was completed/cancelled concurrently).
var ErrOrderNotMergeable = errors.New("order is not mergeable")

// MergeOrders folds the secondary order into the primary one: its line items
// are re-pointed at the primary order, its totals are added onto the primary
// totals, and it is marked 'merged' which releases its table. combinedTableName,
// when non-empty, replaces the primary order's table_name snapshot so
// downstream bills reflect every table that fed into the order (e.g. "3 + 5").
func (r *OrderRepository) MergeOrders(ctx context.Context, primaryID, secondaryID, combinedTableName, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Lock both order rows so a concurrent complete/cancel can't race the merge.
	type orderTotals struct {
		status   string
		total    float64
		tax      float64
		discount float64
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT id, COALESCE(status, ''), COALESCE(total_amount, 0), COALESCE(tax_amount, 0), COALESCE(discount_amount, 0)
		FROM orders WHERE id IN ($1, $2) FOR UPDATE
	`, primaryID, secondaryID)
	if err != nil {
		return err
	}

	totals := map[string]orderTotals{}
	for rows.Next() {
		var id string
		var t orderTotals
		if err := rows.Scan(&id, &t.status, &t.total, &t.tax, &t.discount); err != nil {
			rows.Close()
			return err
		}
		totals[id] = t
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	primary, okP := totals[primaryID]
	secondary, okS := totals[secondaryID]
	if !okP || !okS || primary.status != "active" || secondary.status != "active" {
		return ErrOrderNotMergeable
	}

	_, err = tx.ExecContext(ctx,
		"UPDATE order_items SET order_id = $1, modified_by = $3 WHERE order_id = $2",
		primaryID, secondaryID, modifiedBy)
	if err != nil {
		return err
	}

	var tableName interface{}
	if combinedTableName != "" {
		tableName = combinedTableName
	}
	_, err = tx.ExecContext(ctx, `
		UPDATE orders SET
			total_amount = COALESCE(total_amount, 0) + $2,
			tax_amount = COALESCE(tax_amount, 0) + $3,
			discount_amount = COALESCE(discount_amount, 0) + $4,
			table_name = COALESCE($5, table_name),
			updated_at = CURRENT_TIMESTAMP,
			modified_by = $6
		WHERE id = $1
	`, primaryID, secondary.total, secondary.tax, secondary.discount, tableName, modifiedBy)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE orders SET status = 'merged', updated_at = CURRENT_TIMESTAMP, modified_by = $2 WHERE id = $1
	`, secondaryID, modifiedBy)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// ==========================================
// BILL REPOSITORY
// ==========================================

type BillRepository struct {
	db    *sql.DB
	redis *RedisCache
}

// BillFilter bounds the rows returned by GetAll. Empty fields are ignored.
type BillFilter struct {
	From  *time.Time
	To    *time.Time
	Limit int
}

func (r *BillRepository) GetAll(ctx context.Context, storeID string, f BillFilter) ([]models.Bill, error) {
	sqlStr := `
		SELECT b.id, b.store_id, b.order_id, b.table_number, b.table_name, b.invoice_no, b.subtotal, b.tax_total, b.discount, b.total,
		       b.payment_method, b.customer_name, b.customer_mobile, b.is_printed, b.status, b.generated_at, b.generated_by,
		       COALESCE(
		         json_agg(
		           json_build_object(
		             'itemId', oi.item_id,
		             'quantity', oi.quantity,
		             'unitPrice', oi.unit_price,
		             'item', json_build_object(
		               'id', i.id,
		               'name', i.name,
		               'price', i.price,
		               'categoryId', i.category_id,
		               'categoryName', COALESCE(c.name, 'Uncategorised')
		             )
		           )
		         ) FILTER (WHERE oi.id IS NOT NULL),
		         '[]'
		       ) as items
		FROM bills b
		LEFT JOIN order_items oi ON b.order_id = oi.order_id
		LEFT JOIN items i ON oi.item_id = i.id
		LEFT JOIN categories c ON i.category_id = c.id
		WHERE b.store_id = $1
	`
	var args []interface{}
	args = append(args, storeID)
	idx := 2

	if f.From != nil {
		sqlStr += fmt.Sprintf(" AND b.generated_at >= $%d", idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		sqlStr += fmt.Sprintf(" AND b.generated_at <= $%d", idx)
		args = append(args, *f.To)
		idx++
	}

	sqlStr += " GROUP BY b.id ORDER BY b.generated_at DESC"

	if f.Limit > 0 {
		sqlStr += fmt.Sprintf(" LIMIT $%d", idx)
		args = append(args, f.Limit)
	}

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bills []models.Bill
	for rows.Next() {
		var b models.Bill
		var tableName, method, customer, customerMobile, generatedBy, billStatus sql.NullString
		var itemsBytes []byte
		err := rows.Scan(
			&b.ID, &b.StoreID, &b.OrderID, &b.TableNumber, &tableName, &b.InvoiceNo, &b.Subtotal, &b.TaxTotal, &b.Discount, &b.Total,
			&method, &customer, &customerMobile, &b.IsPrinted, &billStatus, &b.GeneratedAt, &generatedBy,
			&itemsBytes,
		)
		if err != nil {
			return nil, err
		}
		b.TableName = tableName.String
		b.PaymentMethod = method.String
		b.CustomerName = customer.String
		b.CustomerMobile = customerMobile.String
		b.GeneratedBy = generatedBy.String
		b.Status = billStatus.String
		if b.Status == "" {
			b.Status = "active"
		}

		if len(itemsBytes) > 0 {
			var items []models.OrderItem
			if err := json.Unmarshal(itemsBytes, &items); err == nil {
				b.Items = items
			}
		}
		if b.Items == nil {
			b.Items = []models.OrderItem{}
		}

		bills = append(bills, b)
	}
	return bills, nil
}

func (r *BillRepository) Create(ctx context.Context, b models.Bill) error {
	// table_name falls back to the order's snapshot when the client doesn't send it.
	sqlStr := `
		INSERT INTO bills (id, store_id, order_id, table_number, table_name, invoice_no, subtotal, tax_total, discount, total, payment_method, customer_name, customer_mobile, generated_by)
		VALUES ($1, $2, $3, $4, COALESCE(NULLIF($5, ''), (SELECT o.table_name FROM orders o WHERE o.id = $3)), $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`
	var payMethod, custName, custMobile interface{}
	if b.PaymentMethod != "" {
		payMethod = b.PaymentMethod
	}
	if b.CustomerName != "" {
		custName = b.CustomerName
	}
	if b.CustomerMobile != "" {
		custMobile = b.CustomerMobile
	}

	_, err := r.db.ExecContext(ctx, sqlStr,
		b.ID, b.StoreID, b.OrderID, b.TableNumber, b.TableName, b.InvoiceNo, b.Subtotal, b.TaxTotal, b.Discount, b.Total, payMethod, custName, custMobile, b.GeneratedBy,
	)
	return err
}

func (r *BillRepository) GetNextInvoiceNo(ctx context.Context, storeID string) (string, error) {
	var count int
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM bills WHERE store_id = $1", storeID).Scan(&count)
	if err != nil {
		return "", err
	}
	nextNumber := count + 1
	return fmt.Sprintf("INV-%06d", nextNumber), nil
}

func (r *BillRepository) MarkAsPrinted(ctx context.Context, id, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE bills SET is_printed = true, modified_by = $2 WHERE id = $1", id, modifiedBy)
	return err
}

func (r *BillRepository) MarkAsPrintedByOrderID(ctx context.Context, orderID string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE bills SET is_printed = true WHERE order_id = $1", orderID)
	return err
}

func (r *BillRepository) QueueBill(ctx context.Context, queueID, storeID, orderID string, billData json.RawMessage) error {
	if r.redis == nil {
		return errors.New("redis unavailable for remote bill queue")
	}

	key := fmt.Sprintf("bill_queue:%s", storeID)
	item := models.BillQueueItem{
		ID:        queueID,
		StoreID:   storeID,
		OrderID:   orderID,
		BillData:  string(billData),
		Status:    "pending",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	raw, err := json.Marshal(item)
	if err != nil {
		return err
	}

	return r.redis.RPush(ctx, key, raw)
}

func (r *BillRepository) GetStoreBillQueue(ctx context.Context, storeID string) ([]models.BillQueueItem, error) {
	if r.redis == nil {
		return nil, errors.New("redis unavailable for remote bill queue")
	}

	items := make([]models.BillQueueItem, 0)
	key := fmt.Sprintf("bill_queue:%s", storeID)
	for i := 0; i < 20; i++ {
		raw, err := r.redis.LPop(ctx, key)
		if err != nil {
			if errors.Is(err, redis.Nil) {
				break
			}
			return nil, err
		}

		var item models.BillQueueItem
		if err := json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}

	return items, nil
}

// ==========================================
// SYSTEM REPOSITORY
// ==========================================

type SystemRepository struct {
	db *sql.DB
}

type ResetParams struct {
	Users      bool
	Stores     bool
	Categories bool
	Items      bool
	Orders     bool
	Tables     bool
	Bills      bool
}

func (r *SystemRepository) Reset(ctx context.Context, p ResetParams) (map[string]interface{}, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	results := make(map[string]interface{})

	// Reset bills first (depends on orders)
	if p.Bills {
		_, err = tx.ExecContext(ctx, "DELETE FROM bills")
		if err != nil {
			return nil, err
		}
		var count int
		_ = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM bills").Scan(&count)
		results["bills"] = map[string]interface{}{"success": true, "remaining": count}
	}

	// Reset orders
	if p.Orders {
		_, err = tx.ExecContext(ctx, "DELETE FROM order_items")
		if err != nil {
			return nil, err
		}
		_, err = tx.ExecContext(ctx, "DELETE FROM orders")
		if err != nil {
			return nil, err
		}
		var count int
		_ = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM orders").Scan(&count)
		results["orders"] = map[string]interface{}{"success": true, "remaining": count}
	}

	// Reset tables
	if p.Tables {
		_, err = tx.ExecContext(ctx, "DELETE FROM tables")
		if err != nil {
			return nil, err
		}
		var count int
		_ = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM tables").Scan(&count)
		results["tables"] = map[string]interface{}{"success": true, "remaining": count}
	}

	// Reset items (item_expenses cascade via FK when table exists)
	if p.Items {
		if itemExpensesTableExists(ctx, r.db) {
			_, _ = tx.ExecContext(ctx, "DELETE FROM item_expenses")
		}
		_, err = tx.ExecContext(ctx, "DELETE FROM items")
		if err != nil {
			return nil, err
		}
		var count int
		_ = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM items").Scan(&count)
		results["items"] = map[string]interface{}{"success": true, "remaining": count}
	}

	// Reset categories
	if p.Categories {
		_, err = tx.ExecContext(ctx, "DELETE FROM categories")
		if err != nil {
			return nil, err
		}
		var count int
		_ = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM categories").Scan(&count)
		results["categories"] = map[string]interface{}{"success": true, "remaining": count}
	}

	// Reset stores
	if p.Stores {
		if !p.Bills {
			_, _ = tx.ExecContext(ctx, "DELETE FROM bills")
		}
		if !p.Orders {
			_, _ = tx.ExecContext(ctx, "DELETE FROM order_items")
			_, _ = tx.ExecContext(ctx, "DELETE FROM orders")
		}
		if !p.Tables {
			_, _ = tx.ExecContext(ctx, "DELETE FROM tables")
		}
		if !p.Items {
			_, _ = tx.ExecContext(ctx, "DELETE FROM items")
		}
		if !p.Categories {
			_, _ = tx.ExecContext(ctx, "DELETE FROM categories")
		}

		// Clear store_id from users to avoid FK issues
		_, err = tx.ExecContext(ctx, "UPDATE users SET store_id = NULL WHERE role IN ('business_admin', 'staff')")
		if err != nil {
			return nil, err
		}

		// Delete user_stores
		_, err = tx.ExecContext(ctx, "DELETE FROM user_stores")
		if err != nil {
			return nil, err
		}

		// Delete stores
		_, err = tx.ExecContext(ctx, "DELETE FROM stores")
		if err != nil {
			return nil, err
		}

		var count int
		_ = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM stores").Scan(&count)
		results["stores"] = map[string]interface{}{"success": true, "remaining": count}
	}

	// Reset users (keep superadmin)
	if p.Users {
		_, err = tx.ExecContext(ctx, "DELETE FROM users WHERE role != 'superadmin'")
		if err != nil {
			return nil, err
		}
		if !p.Stores {
			_, _ = tx.ExecContext(ctx, "DELETE FROM user_stores")
		}
		var count int
		_ = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
		results["users"] = map[string]interface{}{"success": true, "remaining": count}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return results, nil
}

// GetStats returns record counts. When storeIDs is nil the counts are global
// (superadmin); otherwise they are scoped to the given stores so non-superadmin
// callers never see other stores' figures.
func (r *SystemRepository) GetStats(ctx context.Context, storeIDs []string) (map[string]int, error) {
	stats := make(map[string]int)

	if storeIDs == nil {
		tables := []string{"users", "stores", "categories", "items", "orders", "tables", "bills"}
		for _, t := range tables {
			var count int
			err := r.db.QueryRowContext(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %s", t)).Scan(&count)
			if err != nil {
				return nil, err
			}
			stats[t] = count
		}
		return stats, nil
	}

	for _, t := range []string{"categories", "items", "orders", "tables", "bills"} {
		var count int
		err := r.db.QueryRowContext(ctx,
			fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE store_id = ANY($1)", t),
			pq.Array(storeIDs)).Scan(&count)
		if err != nil {
			return nil, err
		}
		stats[t] = count
	}

	stats["stores"] = len(storeIDs)

	var userCount int
	err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(DISTINCT user_id) FROM user_stores WHERE store_id = ANY($1)",
		pq.Array(storeIDs)).Scan(&userCount)
	if err != nil {
		return nil, err
	}
	stats["users"] = userCount

	return stats, nil
}

func (r *SystemRepository) GetConfig(ctx context.Context) (map[string]string, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT key, value FROM global_settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var key, val string
		if err := rows.Scan(&key, &val); err != nil {
			return nil, err
		}
		settings[key] = val
	}
	return settings, nil
}

func (r *SystemRepository) SaveConfig(ctx context.Context, enabled bool, intervalMins int, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	enabledStr := "false"
	if enabled {
		enabledStr = "true"
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value, modified_by) VALUES ('cleanup_enabled', $1, $2)
		ON CONFLICT (key) DO UPDATE SET value = $1, modified_by = $2
	`, enabledStr, modifiedBy)
	if err != nil {
		return err
	}

	intervalStr := fmt.Sprintf("%d", intervalMins)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value, modified_by) VALUES ('cleanup_interval_mins', $1, $2)
		ON CONFLICT (key) DO UPDATE SET value = $1, modified_by = $2
	`, intervalStr, modifiedBy)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// ==========================================
// APP UPDATE REPOSITORY
// ==========================================

type AppUpdateRepository struct {
	db *sql.DB
}

type AppUpdate struct {
	ID           string
	Platform     string
	Enabled      bool
	Version      string
	DownloadURL  string
	ReleaseNotes *string
	CreatedAt    time.Time
	UpdatedAt    *time.Time
	ModifiedBy   string
}

func (r *AppUpdateRepository) Get(ctx context.Context, platform string) (*AppUpdate, error) {
	var update AppUpdate
	err := r.db.QueryRowContext(ctx, `
		SELECT id, platform, enabled, version, download_url, release_notes, created_at, updated_at
		FROM app_updates
		WHERE platform = $1
	`, platform).Scan(&update.ID, &update.Platform, &update.Enabled, &update.Version, &update.DownloadURL, &update.ReleaseNotes, &update.CreatedAt, &update.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &update, nil
}

func (r *AppUpdateRepository) GetAll(ctx context.Context) ([]AppUpdate, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, platform, enabled, version, download_url, release_notes, created_at, updated_at
		FROM app_updates
		ORDER BY platform
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var updates []AppUpdate
	for rows.Next() {
		var update AppUpdate
		if err := rows.Scan(&update.ID, &update.Platform, &update.Enabled, &update.Version, &update.DownloadURL, &update.ReleaseNotes, &update.CreatedAt, &update.UpdatedAt); err != nil {
			return nil, err
		}
		updates = append(updates, update)
	}
	return updates, nil
}

func (r *AppUpdateRepository) CreateOrUpdate(ctx context.Context, update *AppUpdate) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Check if an update already exists for this platform
	var existingID string
	err = tx.QueryRowContext(ctx, "SELECT id FROM app_updates WHERE platform = $1", update.Platform).Scan(&existingID)

	if err == sql.ErrNoRows {
		// Create new
		update.ID = generateUUID()
		_, err = tx.ExecContext(ctx, `
			INSERT INTO app_updates (id, platform, enabled, version, download_url, release_notes)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, update.ID, update.Platform, update.Enabled, update.Version, update.DownloadURL, update.ReleaseNotes)
	} else if err != nil {
		return err
	} else {
		// Update existing
		_, err = tx.ExecContext(ctx, `
			UPDATE app_updates
			SET enabled = $1, version = $2, download_url = $3, release_notes = $4, updated_at = CURRENT_TIMESTAMP, modified_by = $6
			WHERE id = $5
		`, update.Enabled, update.Version, update.DownloadURL, update.ReleaseNotes, existingID, update.ModifiedBy)
		update.ID = existingID
	}

	if err != nil {
		return err
	}
	return tx.Commit()
}

func generateUUID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// ==========================================
// SUPPORT CONFIG REPOSITORY
// ==========================================

type SupportConfigRepository struct {
	db *sql.DB
}

func (r *SupportConfigRepository) Get(ctx context.Context) (*models.SupportConfig, error) {
	sqlStr := `
		SELECT key, value
		FROM global_settings
		WHERE key IN ('support_email', 'support_phone', 'support_whatsapp_link')
	`
	rows, err := r.db.QueryContext(ctx, sqlStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	config := &models.SupportConfig{}
	for rows.Next() {
		var key, val string
		if err := rows.Scan(&key, &val); err != nil {
			return nil, err
		}
		switch key {
		case "support_email":
			config.Email = val
		case "support_phone":
			config.Phone = val
		case "support_whatsapp_link":
			config.WhatsAppLink = val
		}
	}
	return config, nil
}

func (r *SupportConfigRepository) Save(ctx context.Context, req models.SupportConfigRequest, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value, modified_by) VALUES ('support_email', $1, $2)
		ON CONFLICT (key) DO UPDATE SET value = $1, modified_by = $2
	`, req.Email, modifiedBy)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value, modified_by) VALUES ('support_phone', $1, $2)
		ON CONFLICT (key) DO UPDATE SET value = $1, modified_by = $2
	`, req.Phone, modifiedBy)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value, modified_by) VALUES ('support_whatsapp_link', $1, $2)
		ON CONFLICT (key) DO UPDATE SET value = $1, modified_by = $2
	`, req.WhatsAppLink, modifiedBy)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// ==========================================
// UPDATE REPO CONFIG REPOSITORY
// ==========================================

type UpdateRepoRepository struct {
	db *sql.DB
}

// Get returns the configured GitHub repository (owner/repo) used for desktop app updates.
func (r *UpdateRepoRepository) Get(ctx context.Context) (string, error) {
	var repo string
	err := r.db.QueryRowContext(ctx, "SELECT value FROM global_settings WHERE key = 'update_github_repo'").Scan(&repo)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return repo, nil
}

// Save persists the GitHub repository (owner/repo) used for desktop app updates.
func (r *UpdateRepoRepository) Save(ctx context.Context, repo, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO global_settings (key, value, modified_by) VALUES ('update_github_repo', $1, $2)
		ON CONFLICT (key) DO UPDATE SET value = $1, modified_by = $2, updated_at = CURRENT_TIMESTAMP
	`, repo, modifiedBy)
	return err
}

// ==========================================
// GEMINI CONFIG REPOSITORY
// ==========================================

type GeminiConfigRepository struct {
	db *sql.DB
}

// Get returns the stored Gemini API key and model. The API key may be empty.
func (r *GeminiConfigRepository) Get(ctx context.Context) (apiKey, model string, err error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT key, value FROM global_settings
		WHERE key IN ('gemini_api_key', 'gemini_model')
	`)
	if err != nil {
		return "", "", err
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return "", "", err
		}
		switch k {
		case "gemini_api_key":
			apiKey = v
		case "gemini_model":
			model = v
		}
	}
	return apiKey, model, nil
}

// Save persists the Gemini API key and model in global_settings.
func (r *GeminiConfigRepository) Save(ctx context.Context, apiKey, model, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value, modified_by) VALUES ('gemini_api_key', $1, $2)
		ON CONFLICT (key) DO UPDATE SET value = $1, modified_by = $2, updated_at = CURRENT_TIMESTAMP
	`, apiKey, modifiedBy); err != nil {
		return err
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value, modified_by) VALUES ('gemini_model', $1, $2)
		ON CONFLICT (key) DO UPDATE SET value = $1, modified_by = $2, updated_at = CURRENT_TIMESTAMP
	`, model, modifiedBy); err != nil {
		return err
	}

	return tx.Commit()
}

// ==========================================
// MENU BULK REPOSITORY
// ==========================================

// MenuRepository handles transactional bulk import of a parsed menu
// (categories + items) for a store.
type MenuRepository struct {
	db    *sql.DB
	redis *RedisCache
}

// BulkCreate inserts the provided categories and items for a store in a single
// transaction. When replaceExisting is true, all existing categories and items
// for the store are soft-deleted first. Redis caches for the store are
// invalidated on success.
func (r *MenuRepository) BulkCreate(ctx context.Context, storeID string, replaceExisting bool, categories []models.ParsedMenuCategory) (catsAdded, itemsAdded int, err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	if replaceExisting {
		if _, err = tx.ExecContext(ctx, "UPDATE items SET is_active = false WHERE store_id = $1", storeID); err != nil {
			return 0, 0, err
		}
		if _, err = tx.ExecContext(ctx, "UPDATE categories SET is_active = false WHERE store_id = $1", storeID); err != nil {
			return 0, 0, err
		}
	}

	for _, cat := range categories {
		catName := strings.TrimSpace(cat.Name)
		if catName == "" {
			catName = "Uncategorized"
		}
		catID := uuid.New().String()
		if _, err = tx.ExecContext(ctx,
			"INSERT INTO categories (id, store_id, name, description) VALUES ($1, $2, $3, $4)",
			catID, storeID, catName, cat.Description,
		); err != nil {
			return 0, 0, err
		}
		catsAdded++

		for _, item := range cat.Items {
			itemName := strings.TrimSpace(item.Name)
			if itemName == "" {
				continue // skip blank items
			}
			itemID := uuid.New().String()
			if _, err = tx.ExecContext(ctx,
				"INSERT INTO items (id, store_id, category_id, name, description, price, hsn_code, tax_percent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
				itemID, storeID, catID, itemName, item.Description, item.Price, item.HSNCode, item.TaxPercent,
			); err != nil {
				return 0, 0, err
			}
			itemsAdded++
		}
	}

	if err = tx.Commit(); err != nil {
		return 0, 0, err
	}

	// Invalidate caches for this store (mirrors Category/Item repositories).
	if r.redis != nil {
		r.redis.Delete(ctx, "categories:"+storeID)
		r.redis.DeleteByPrefix(ctx, itemsCacheKeyPrefix)
		r.redis.DeleteByPrefix(ctx, "items:")
	}

	return catsAdded, itemsAdded, nil
}

// BulkMerge applies a parsed menu on top of an existing store menu without
// removing items that are absent from the parsed menu. For each category:
//   - if MatchedCategoryID is provided, that existing category is reused;
//   - otherwise an existing active category with the same (normalized) name is
//     reused; if none exists a new category is created.
//
// For each item:
//   - if MatchedItemID is provided, that existing item is updated in place;
//   - otherwise a new item is inserted under the resolved category.
//
// Items that exist in the store but are not part of the parsed menu are left
// untouched. The returned counts report categories added/reused and items
// added/updated.
func (r *MenuRepository) BulkMerge(ctx context.Context, storeID string, categories []models.ParsedMenuCategory) (catsAdded, catsReused, itemsAdded, itemsUpdated int, err error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		}
	}()

	// Load existing active categories for the store so we can reuse them by name.
	existingCats, err := tx.QueryContext(ctx,
		"SELECT id, name FROM categories WHERE store_id = $1 AND is_active = true", storeID)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	catByName := map[string]string{} // normalized name -> category id
	for existingCats.Next() {
		var id, name string
		if err = existingCats.Scan(&id, &name); err != nil {
			existingCats.Close()
			return 0, 0, 0, 0, err
		}
		catByName[normName(name)] = id
	}
	existingCats.Close()
	if err = existingCats.Err(); err != nil {
		return 0, 0, 0, 0, err
	}

	for _, cat := range categories {
		catName := strings.TrimSpace(cat.Name)
		if catName == "" {
			catName = "Uncategorized"
		}

		catID := strings.TrimSpace(cat.MatchedCategoryID)
		if catID != "" {
			// Verify the matched category belongs to this store and is active.
			var active bool
			err = tx.QueryRowContext(ctx,
				"SELECT is_active FROM categories WHERE id = $1 AND store_id = $2", catID, storeID,
			).Scan(&active)
			if err != nil || !active {
				catID = "" // fall back to name lookup / creation
			} else {
				// Update the category name/description to match the parsed menu.
				if _, err = tx.ExecContext(ctx,
					"UPDATE categories SET name = $1, description = $2 WHERE id = $3",
					catName, cat.Description, catID,
				); err != nil {
					return 0, 0, 0, 0, err
				}
				catsReused++
			}
		}
		if catID == "" {
			if existingID, ok := catByName[normName(catName)]; ok {
				catID = existingID
				catsReused++
			} else {
				catID = uuid.New().String()
				if _, err = tx.ExecContext(ctx,
					"INSERT INTO categories (id, store_id, name, description) VALUES ($1, $2, $3, $4)",
					catID, storeID, catName, cat.Description,
				); err != nil {
					return 0, 0, 0, 0, err
				}
				catsAdded++
				catByName[normName(catName)] = catID
			}
		}

		for _, item := range cat.Items {
			itemName := strings.TrimSpace(item.Name)
			if itemName == "" {
				continue
			}
			matchedID := strings.TrimSpace(item.MatchedItemID)
			if matchedID != "" {
				// Verify the matched item belongs to this store and is active.
				var active bool
				err = tx.QueryRowContext(ctx,
					"SELECT is_active FROM items WHERE id = $1 AND store_id = $2", matchedID, storeID,
				).Scan(&active)
				if err == nil && active {
					if _, err = tx.ExecContext(ctx,
						"UPDATE items SET category_id = $1, name = $2, description = $3, price = $4, hsn_code = $5, tax_percent = $6 WHERE id = $7",
						catID, itemName, item.Description, item.Price, item.HSNCode, item.TaxPercent, matchedID,
					); err != nil {
						return 0, 0, 0, 0, err
					}
					itemsUpdated++
					continue
				}
				// matched ID invalid -> create new below
			}
			itemID := uuid.New().String()
			if _, err = tx.ExecContext(ctx,
				"INSERT INTO items (id, store_id, category_id, name, description, price, hsn_code, tax_percent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
				itemID, storeID, catID, itemName, item.Description, item.Price, item.HSNCode, item.TaxPercent,
			); err != nil {
				return 0, 0, 0, 0, err
			}
			itemsAdded++
		}
	}

	if err = tx.Commit(); err != nil {
		return 0, 0, 0, 0, err
	}

	if r.redis != nil {
		r.redis.Delete(ctx, "categories:"+storeID)
		r.redis.DeleteByPrefix(ctx, itemsCacheKeyPrefix)
		r.redis.DeleteByPrefix(ctx, "items:")
	}

	return catsAdded, catsReused, itemsAdded, itemsUpdated, nil
}

// normName normalizes a category/item name for case- and whitespace-insensitive
// matching during merge imports.
func normName(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// ==========================================
// EXPENSE CATEGORY REPOSITORY
// ==========================================

type ExpenseCategoryRepository struct {
	db    *sql.DB
	redis *RedisCache
}

func (r *ExpenseCategoryRepository) GetAll(ctx context.Context, storeID string) ([]models.ExpenseCategory, error) {
	cacheKey := "expense_categories:" + storeID
	if r.redis != nil {
		if raw, ok := r.redis.Get(ctx, cacheKey); ok {
			var cached []models.ExpenseCategory
			if err := json.Unmarshal(raw, &cached); err == nil {
				return cached, nil
			}
		}
	}

	rows, err := r.db.QueryContext(ctx, "SELECT id, store_id, name, description, is_active FROM expense_categories WHERE store_id = $1 AND is_active = true ORDER BY name", storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []models.ExpenseCategory
	for rows.Next() {
		var c models.ExpenseCategory
		var desc sql.NullString
		if err := rows.Scan(&c.ID, &c.StoreID, &c.Name, &desc, &c.IsActive); err != nil {
			return nil, err
		}
		c.Description = desc.String
		categories = append(categories, c)
	}

	if r.redis != nil {
		if raw, err := json.Marshal(categories); err == nil {
			r.redis.Set(ctx, cacheKey, raw, 30*time.Minute)
		}
	}
	return categories, nil
}

func (r *ExpenseCategoryRepository) Create(ctx context.Context, c models.ExpenseCategory) error {
	_, err := r.db.ExecContext(ctx, "INSERT INTO expense_categories (id, store_id, name, description) VALUES ($1, $2, $3, $4)",
		c.ID, c.StoreID, c.Name, c.Description)
	if err == nil && r.redis != nil {
		r.redis.Delete(ctx, "expense_categories:"+c.StoreID)
	}
	return err
}

func (r *ExpenseCategoryRepository) Update(ctx context.Context, c models.ExpenseCategory) error {
	_, err := r.db.ExecContext(ctx, "UPDATE expense_categories SET name = $1, description = $2, modified_by = $3 WHERE id = $4",
		c.Name, c.Description, c.ModifiedBy, c.ID)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, "expense_categories:")
	}
	return err
}

func (r *ExpenseCategoryRepository) Delete(ctx context.Context, id, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE expense_categories SET is_active = false, modified_by = $2 WHERE id = $1", id, modifiedBy)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, "expense_categories:")
	}
	return err
}

// ==========================================
// EXPENSE REPOSITORY
// ==========================================

type ExpenseRepository struct {
	db    *sql.DB
	redis *RedisCache
}

func (r *ExpenseRepository) GetAll(ctx context.Context, storeID string, startDate, endDate string) ([]models.Expense, error) {
	sqlStr := `
		SELECT e.id, e.store_id, e.category_id, ec.name as category_name, e.title, e.description, 
		       e.amount, e.expense_date, e.payment_method, e.receipt_number, e.vendor, 
		       e.attachments, e.is_active, e.created_at, e.updated_at, e.created_by
		FROM expenses e
		LEFT JOIN expense_categories ec ON e.category_id = ec.id
		WHERE e.store_id = $1 AND e.is_active = true
	`
	var args []interface{}
	args = append(args, storeID)
	idx := 2

	if startDate != "" {
		sqlStr += fmt.Sprintf(" AND e.expense_date >= $%d", idx)
		args = append(args, startDate)
		idx++
	}

	if endDate != "" {
		sqlStr += fmt.Sprintf(" AND e.expense_date <= $%d", idx)
		args = append(args, endDate)
		idx++
	}

	sqlStr += " ORDER BY e.expense_date DESC"

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var expenses []models.Expense
	for rows.Next() {
		var e models.Expense
		var categoryName, description, paymentMethod, receiptNumber, vendor, createdBy sql.NullString
		var attachmentsBytes []byte
		err := rows.Scan(
			&e.ID, &e.StoreID, &e.CategoryID, &categoryName, &e.Title, &description,
			&e.Amount, &e.ExpenseDate, &paymentMethod, &receiptNumber, &vendor,
			&attachmentsBytes, &e.IsActive, &e.CreatedAt, &e.UpdatedAt, &createdBy,
		)
		if err != nil {
			return nil, err
		}
		e.CategoryName = categoryName.String
		e.Description = description.String
		e.PaymentMethod = paymentMethod.String
		e.ReceiptNumber = receiptNumber.String
		e.Vendor = vendor.String
		e.CreatedBy = createdBy.String

		if len(attachmentsBytes) > 0 {
			var attachments []string
			if err := json.Unmarshal(attachmentsBytes, &attachments); err == nil {
				e.Attachments = attachments
			}
		}
		if e.Attachments == nil {
			e.Attachments = []string{}
		}

		expenses = append(expenses, e)
	}
	return expenses, nil
}

func (r *ExpenseRepository) GetByID(ctx context.Context, id string) (*models.Expense, error) {
	sqlStr := `
		SELECT e.id, e.store_id, e.category_id, ec.name as category_name, e.title, e.description, 
		       e.amount, e.expense_date, e.payment_method, e.receipt_number, e.vendor, 
		       e.attachments, e.is_active, e.created_at, e.updated_at, e.created_by
		FROM expenses e
		LEFT JOIN expense_categories ec ON e.category_id = ec.id
		WHERE e.id = $1
	`
	row := r.db.QueryRowContext(ctx, sqlStr, id)

	var e models.Expense
	var categoryName, description, paymentMethod, receiptNumber, vendor, createdBy sql.NullString
	var attachmentsBytes []byte
	err := row.Scan(
		&e.ID, &e.StoreID, &e.CategoryID, &categoryName, &e.Title, &description,
		&e.Amount, &e.ExpenseDate, &paymentMethod, &receiptNumber, &vendor,
		&attachmentsBytes, &e.IsActive, &e.CreatedAt, &e.UpdatedAt, &createdBy,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	e.CategoryName = categoryName.String
	e.Description = description.String
	e.PaymentMethod = paymentMethod.String
	e.ReceiptNumber = receiptNumber.String
	e.Vendor = vendor.String
	e.CreatedBy = createdBy.String

	if len(attachmentsBytes) > 0 {
		var attachments []string
		if err := json.Unmarshal(attachmentsBytes, &attachments); err == nil {
			e.Attachments = attachments
		}
	}
	if e.Attachments == nil {
		e.Attachments = []string{}
	}

	return &e, nil
}

func (r *ExpenseRepository) Create(ctx context.Context, e models.Expense) error {
	if e.Attachments == nil {
		e.Attachments = []string{}
	}
	attachmentsJSON, err := json.Marshal(e.Attachments)
	if err != nil {
		return err
	}

	sqlStr := `INSERT INTO expenses (id, store_id, category_id, title, description, amount, expense_date, payment_method, receipt_number, vendor, attachments, created_by)
	           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`

	var categoryID, paymentMethod, receiptNumber, vendor, createdBy interface{}
	if e.CategoryID != "" {
		categoryID = e.CategoryID
	}
	if e.PaymentMethod != "" {
		paymentMethod = e.PaymentMethod
	}
	if e.ReceiptNumber != "" {
		receiptNumber = e.ReceiptNumber
	}
	if e.Vendor != "" {
		vendor = e.Vendor
	}
	if e.CreatedBy != "" {
		createdBy = e.CreatedBy
	}

	_, err = r.db.ExecContext(ctx, sqlStr,
		e.ID, e.StoreID, categoryID, e.Title, e.Description, e.Amount, e.ExpenseDate,
		paymentMethod, receiptNumber, vendor, string(attachmentsJSON), createdBy)
	return err
}

func (r *ExpenseRepository) Update(ctx context.Context, e models.Expense) error {
	if e.Attachments == nil {
		e.Attachments = []string{}
	}
	attachmentsJSON, err := json.Marshal(e.Attachments)
	if err != nil {
		return err
	}

	sqlStr := `UPDATE expenses SET category_id = $1, title = $2, description = $3, amount = $4,
	           expense_date = $5, payment_method = $6, receipt_number = $7, vendor = $8,
	           attachments = $9::jsonb, modified_by = $11, updated_at = CURRENT_TIMESTAMP WHERE id = $10`

	var categoryID, paymentMethod, receiptNumber, vendor interface{}
	if e.CategoryID != "" {
		categoryID = e.CategoryID
	}
	if e.PaymentMethod != "" {
		paymentMethod = e.PaymentMethod
	}
	if e.ReceiptNumber != "" {
		receiptNumber = e.ReceiptNumber
	}
	if e.Vendor != "" {
		vendor = e.Vendor
	}

	_, err = r.db.ExecContext(ctx, sqlStr,
		categoryID, e.Title, e.Description, e.Amount, e.ExpenseDate,
		paymentMethod, receiptNumber, vendor, string(attachmentsJSON), e.ID, e.ModifiedBy)
	return err
}

func (r *ExpenseRepository) Delete(ctx context.Context, id, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE expenses SET is_active = false, modified_by = $2 WHERE id = $1", id, modifiedBy)
	return err
}

func (r *ExpenseRepository) GetReportByCategory(ctx context.Context, storeID, startDate, endDate string) ([]models.ExpenseReport, error) {
	sqlStr := `
		SELECT ec.id as category_id, ec.name as category_name, 
		       COALESCE(SUM(e.amount), 0) as total_amount,
		       COUNT(e.id) as expense_count
		FROM expense_categories ec
		LEFT JOIN expenses e ON ec.id = e.category_id 
			AND e.store_id = $1 
			AND e.is_active = true
		WHERE ec.store_id = $1 AND ec.is_active = true
	`
	var args []interface{}
	args = append(args, storeID)
	idx := 2

	if startDate != "" {
		sqlStr += fmt.Sprintf(" AND (e.expense_date IS NULL OR e.expense_date >= $%d)", idx)
		args = append(args, startDate)
		idx++
	}

	if endDate != "" {
		sqlStr += fmt.Sprintf(" AND (e.expense_date IS NULL OR e.expense_date <= $%d)", idx)
		args = append(args, endDate)
		idx++
	}

	sqlStr += " GROUP BY ec.id, ec.name ORDER BY total_amount DESC"

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []models.ExpenseReport
	for rows.Next() {
		var r models.ExpenseReport
		if err := rows.Scan(&r.CategoryID, &r.CategoryName, &r.TotalAmount, &r.ExpenseCount); err != nil {
			return nil, err
		}
		reports = append(reports, r)
	}
	return reports, nil
}

func (r *ExpenseRepository) GetSummaryByDate(ctx context.Context, storeID, startDate, endDate string) ([]models.ExpenseSummary, error) {
	sqlStr := `
		SELECT DATE(e.expense_date) as date, 
		       COALESCE(SUM(e.amount), 0) as total_amount,
		       COUNT(e.id) as expense_count
		FROM expenses e
		WHERE e.store_id = $1 AND e.is_active = true
	`
	var args []interface{}
	args = append(args, storeID)
	idx := 2

	if startDate != "" {
		sqlStr += fmt.Sprintf(" AND e.expense_date >= $%d", idx)
		args = append(args, startDate)
		idx++
	}

	if endDate != "" {
		sqlStr += fmt.Sprintf(" AND e.expense_date <= $%d", idx)
		args = append(args, endDate)
		idx++
	}

	sqlStr += " GROUP BY DATE(e.expense_date) ORDER BY date DESC"

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []models.ExpenseSummary
	for rows.Next() {
		var s models.ExpenseSummary
		if err := rows.Scan(&s.Date, &s.TotalAmount, &s.ExpenseCount); err != nil {
			return nil, err
		}
		summaries = append(summaries, s)
	}
	return summaries, nil
}

// ==========================================
// REVENUE REPORT REPOSITORY
// ==========================================

type RevenueReportRepository struct {
	db *sql.DB
}

// GetRevenueReport aggregates the profit report metrics. With summaryOnly
// the entry lists are skipped — the paginated pages fetch them separately.
func (r *RevenueReportRepository) GetRevenueReport(ctx context.Context, storeID, startDate, endDate string, summaryOnly bool) (*models.RevenueReport, error) {
	// Build date filter conditions
	var dateFilter string
	var args []interface{}
	args = append(args, storeID)
	idx := 2

	if startDate != "" {
		dateFilter += fmt.Sprintf(" AND DATE(b.generated_at) >= $%d::date", idx)
		args = append(args, startDate)
		idx++
	}

	if endDate != "" {
		dateFilter += fmt.Sprintf(" AND DATE(b.generated_at) <= $%d::date", idx)
		args = append(args, endDate)
		idx++
	}

	// Get total revenue from bills (exclude cancelled bills)
	revenueSQL := `
		SELECT COALESCE(SUM(b.total), 0), COUNT(b.id)
		FROM bills b
		WHERE b.store_id = $1 AND (b.status IS NULL OR b.status = 'active')
	` + dateFilter

	var totalRevenue float64
	var totalBills int
	err := r.db.QueryRowContext(ctx, revenueSQL, args...).Scan(&totalRevenue, &totalBills)
	if err != nil {
		return nil, err
	}

	// Get total expenses
	expenseSQL := `
		SELECT COALESCE(SUM(e.amount), 0), COUNT(e.id)
		FROM expenses e
		WHERE e.store_id = $1 AND e.is_active = true
	`
	var expenseArgs []interface{}
	expenseArgs = append(expenseArgs, storeID)
	expenseIdx := 2

	if startDate != "" {
		expenseSQL += fmt.Sprintf(" AND DATE(e.expense_date) >= $%d::date", expenseIdx)
		expenseArgs = append(expenseArgs, startDate)
		expenseIdx++
	}

	if endDate != "" {
		expenseSQL += fmt.Sprintf(" AND DATE(e.expense_date) <= $%d::date", expenseIdx)
		expenseArgs = append(expenseArgs, endDate)
		expenseIdx++
	}

	var totalExpenses float64
	var totalExpenseCount int
	err = r.db.QueryRowContext(ctx, expenseSQL, expenseArgs...).Scan(&totalExpenses, &totalExpenseCount)
	if err != nil {
		return nil, err
	}

	// Get completed orders count
	orderSQL := `
		SELECT COUNT(o.id)
		FROM orders o
		WHERE o.store_id = $1 AND o.status = 'completed'
	`
	var orderArgs []interface{}
	orderArgs = append(orderArgs, storeID)
	orderIdx := 2

	if startDate != "" {
		orderSQL += fmt.Sprintf(" AND DATE(o.created_at) >= $%d::date", orderIdx)
		orderArgs = append(orderArgs, startDate)
		orderIdx++
	}

	if endDate != "" {
		orderSQL += fmt.Sprintf(" AND DATE(o.created_at) <= $%d::date", orderIdx)
		orderArgs = append(orderArgs, endDate)
		orderIdx++
	}

	var totalOrders int
	err = r.db.QueryRowContext(ctx, orderSQL, orderArgs...).Scan(&totalOrders)
	if err != nil {
		return nil, err
	}

	// Calculate net profit and average order value
	netProfit := totalRevenue - totalExpenses
	avgOrderValue := 0.0
	if totalOrders > 0 {
		avgOrderValue = totalRevenue / float64(totalOrders)
	}

	report := &models.RevenueReport{
		PeriodStart:       startDate,
		PeriodEnd:         endDate,
		TotalRevenue:      totalRevenue,
		TotalExpenses:     totalExpenses,
		NetProfit:         netProfit,
		TotalOrders:       totalOrders,
		TotalBills:        totalBills,
		TotalExpenseCount: totalExpenseCount,
		AverageOrderValue: avgOrderValue,
		Bills:             []models.Bill{},
		Expenses:          []models.Expense{},
	}
	if summaryOnly {
		return report, nil
	}

	// Fetch individual bills (revenue entries) with items
	billsSQL := `
		SELECT b.id, b.store_id, b.order_id, b.table_number, b.table_name, b.invoice_no, b.subtotal, b.tax_total, b.discount, b.total,
		       b.payment_method, b.customer_name, b.customer_mobile, b.is_printed, b.generated_at, b.generated_by,
		       COALESCE(
		         json_agg(
		           json_build_object(
		             'itemId', oi.item_id,
		             'quantity', oi.quantity,
		             'unitPrice', oi.unit_price,
		             'item', json_build_object(
		               'id', i.id,
		               'name', i.name,
		               'price', i.price,
		               'categoryId', i.category_id,
		               'categoryName', COALESCE(c.name, 'Uncategorised')
		             )
		           )
		         ) FILTER (WHERE oi.id IS NOT NULL),
		         '[]'
		       ) as items
		FROM bills b
		LEFT JOIN order_items oi ON b.order_id = oi.order_id
		LEFT JOIN items i ON oi.item_id = i.id
		LEFT JOIN categories c ON i.category_id = c.id
		WHERE b.store_id = $1 AND (b.status IS NULL OR b.status = 'active')
	`
	var billArgs []interface{}
	billArgs = append(billArgs, storeID)
	billIdx := 2

	if startDate != "" {
		billsSQL += fmt.Sprintf(" AND DATE(b.generated_at) >= $%d::date", billIdx)
		billArgs = append(billArgs, startDate)
		billIdx++
	}

	if endDate != "" {
		billsSQL += fmt.Sprintf(" AND DATE(b.generated_at) <= $%d::date", billIdx)
		billArgs = append(billArgs, endDate)
		billIdx++
	}

	billsSQL += " GROUP BY b.id ORDER BY b.generated_at DESC"

	billRows, err := r.db.QueryContext(ctx, billsSQL, billArgs...)
	if err != nil {
		return nil, err
	}
	defer billRows.Close()

	var bills []models.Bill
	for billRows.Next() {
		var b models.Bill
		var tableName, method, customer, customerMobile, generatedBy sql.NullString
		var itemsBytes []byte
		err := billRows.Scan(
			&b.ID, &b.StoreID, &b.OrderID, &b.TableNumber, &tableName, &b.InvoiceNo, &b.Subtotal, &b.TaxTotal, &b.Discount, &b.Total,
			&method, &customer, &customerMobile, &b.IsPrinted, &b.GeneratedAt, &generatedBy,
			&itemsBytes,
		)
		if err != nil {
			return nil, err
		}
		b.TableName = tableName.String
		b.PaymentMethod = method.String
		b.CustomerName = customer.String
		b.CustomerMobile = customerMobile.String
		b.GeneratedBy = generatedBy.String

		if len(itemsBytes) > 0 {
			var items []models.OrderItem
			if err := json.Unmarshal(itemsBytes, &items); err == nil {
				b.Items = items
			}
		}
		if b.Items == nil {
			b.Items = []models.OrderItem{}
		}
		bills = append(bills, b)
	}

	// Fetch individual expenses
	expensesListSQL := `
		SELECT e.id, e.store_id, e.category_id, ec.name as category_name, e.title, e.description,
		       e.amount, e.expense_date, e.payment_method, e.receipt_number, e.vendor,
		       e.attachments, e.is_active, e.created_at, e.updated_at, e.created_by
		FROM expenses e
		LEFT JOIN expense_categories ec ON e.category_id = ec.id
		WHERE e.store_id = $1 AND e.is_active = true
	`
	var expArgs []interface{}
	expArgs = append(expArgs, storeID)
	expIdx := 2

	if startDate != "" {
		expensesListSQL += fmt.Sprintf(" AND DATE(e.expense_date) >= $%d::date", expIdx)
		expArgs = append(expArgs, startDate)
		expIdx++
	}

	if endDate != "" {
		expensesListSQL += fmt.Sprintf(" AND DATE(e.expense_date) <= $%d::date", expIdx)
		expArgs = append(expArgs, endDate)
		expIdx++
	}

	expensesListSQL += " ORDER BY e.expense_date DESC"

	expRows, err := r.db.QueryContext(ctx, expensesListSQL, expArgs...)
	if err != nil {
		return nil, err
	}
	defer expRows.Close()

	var expenses []models.Expense
	for expRows.Next() {
		var e models.Expense
		var categoryName, description, paymentMethod, receiptNumber, vendor, createdBy sql.NullString
		var attachmentsBytes []byte
		err := expRows.Scan(
			&e.ID, &e.StoreID, &e.CategoryID, &categoryName, &e.Title, &description,
			&e.Amount, &e.ExpenseDate, &paymentMethod, &receiptNumber, &vendor,
			&attachmentsBytes, &e.IsActive, &e.CreatedAt, &e.UpdatedAt, &createdBy,
		)
		if err != nil {
			return nil, err
		}
		e.CategoryName = categoryName.String
		e.Description = description.String
		e.PaymentMethod = paymentMethod.String
		e.ReceiptNumber = receiptNumber.String
		e.Vendor = vendor.String
		e.CreatedBy = createdBy.String

		if len(attachmentsBytes) > 0 {
			var attachments []string
			if err := json.Unmarshal(attachmentsBytes, &attachments); err == nil {
				e.Attachments = attachments
			}
		}
		if e.Attachments == nil {
			e.Attachments = []string{}
		}

		expenses = append(expenses, e)
	}

	report.Bills = bills
	report.Expenses = expenses
	return report, nil
}

// ==========================================
// TOP SELLING ITEMS REPORT REPOSITORY
// ==========================================

type ReportRepository struct {
	db *sql.DB
}

// ReportFilter bounds the paginated sales reports. Rows are aggregated
// groups; pagination applies after filtering and sorting.
type ReportFilter struct {
	From     *time.Time
	To       *time.Time
	Search   string
	Sort     string // item | category | date | count | revenue
	Dir      string // asc | desc
	Page     int    // 1-based
	PageSize int
	All      bool // bypass pagination (CSV export)
}

// topSellingGroupedSQL builds the per-date aggregation subquery for the
// given source, grouped by "item" or "category". The "bills" source mirrors
// the storefront report (bill generated_at); "orders" is the fallback for
// stores that only complete orders without generating bills.
func topSellingGroupedSQL(source, group, storeID string, f ReportFilter) (string, []interface{}) {
	var from, tsCol, where string
	if source == "orders" {
		from = "orders o JOIN order_items oi ON o.id = oi.order_id"
		tsCol = "o.created_at"
		where = "o.store_id = $1 AND o.status = 'completed'"
	} else {
		from = "bills b JOIN order_items oi ON b.order_id = oi.order_id"
		tsCol = "b.generated_at"
		where = "b.store_id = $1 AND (b.status IS NULL OR b.status = 'active')"
	}

	var selectCols, groupBy string
	if group == "category" {
		selectCols = `COALESCE(i.category_id, 'unknown') AS category_id,
			COALESCE(c.name, 'Uncategorised') AS category`
		groupBy = "category_id, category"
	} else {
		selectCols = `oi.item_id AS item_id,
			COALESCE(i.name, oi.item_id) AS item,
			COALESCE(c.name, 'Uncategorised') AS category`
		groupBy = "item_id, item, category"
	}

	args := []interface{}{storeID}
	idx := 2
	sqlStr := fmt.Sprintf(`
		SELECT
			%s,
			TO_CHAR(%s::date, 'YYYY-MM-DD') AS date,
			SUM(oi.quantity)::int AS count,
			COALESCE(SUM(oi.quantity * COALESCE(i.price, 0)), 0)::float8 AS revenue
		FROM %s
		LEFT JOIN items i ON oi.item_id = i.id
		LEFT JOIN categories c ON i.category_id = c.id
		WHERE %s
	`, selectCols, tsCol, from, where)

	if f.From != nil {
		sqlStr += fmt.Sprintf(" AND %s::date >= $%d::date", tsCol, idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		sqlStr += fmt.Sprintf(" AND %s::date <= $%d::date", tsCol, idx)
		args = append(args, *f.To)
		idx++
	}

	sqlStr += fmt.Sprintf(" GROUP BY %s, %s::date", groupBy, tsCol)
	return sqlStr, args
}

func (r *ReportRepository) GetTopSellingItems(ctx context.Context, storeID string, f ReportFilter) (*models.TopSellingItemsReport, error) {
	grouped, args := topSellingGroupedSQL("bills", "item", storeID, f)

	// The report falls back to completed orders only when no bills produced
	// any rows in range — same condition the storefront applied client-side.
	var groupCount int
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ("+grouped+") g", args...).Scan(&groupCount); err != nil {
		return nil, err
	}
	if groupCount == 0 {
		grouped, args = topSellingGroupedSQL("orders", "item", storeID, f)
	}

	// Search applies to the grouped display values (item / category names).
	idx := len(args) + 1
	filtered := grouped
	if f.Search != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(f.Search)
		filtered = fmt.Sprintf(
			"SELECT * FROM (%s) g WHERE (g.item ILIKE $%d ESCAPE '\\' OR g.category ILIKE $%d ESCAPE '\\')",
			grouped, idx, idx,
		)
		args = append(args, "%"+escaped+"%")
		idx++
	}

	report := &models.TopSellingItemsReport{
		Rows:     []models.TopSellingItemRow{},
		Page:     f.Page,
		PageSize: f.PageSize,
	}

	summarySQL := fmt.Sprintf(`
		SELECT COUNT(*), COUNT(DISTINCT item_id),
		       COALESCE(SUM(count), 0), COALESCE(SUM(revenue), 0)
		FROM (%s) t
	`, filtered)
	if err := r.db.QueryRowContext(ctx, summarySQL, args...).Scan(
		&report.Total, &report.UniqueItems, &report.TotalCount, &report.TotalRevenue,
	); err != nil {
		return nil, err
	}
	if report.Total == 0 {
		return report, nil
	}

	sortExpr := map[string]string{
		"item":     "LOWER(item), item",
		"category": "LOWER(category), category",
		"date":     "date",
		"count":    "count",
		"revenue":  "revenue",
	}[f.Sort]
	if sortExpr == "" {
		sortExpr = "count"
	}
	dir := "DESC"
	if f.Dir == "asc" {
		dir = "ASC"
	}

	rowsSQL := fmt.Sprintf(
		"SELECT item_id, item, category, date, count, revenue FROM (%s) t ORDER BY %s %s, item_id, date",
		filtered, sortExpr, dir,
	)
	if !f.All {
		rowsSQL += fmt.Sprintf(" LIMIT $%d OFFSET $%d", idx, idx+1)
		args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	}

	rows, err := r.db.QueryContext(ctx, rowsSQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var row models.TopSellingItemRow
		var itemID, item, category, date sql.NullString
		if err := rows.Scan(&itemID, &item, &category, &date, &row.Count, &row.Revenue); err != nil {
			return nil, err
		}
		row.ItemID = itemID.String
		row.Item = item.String
		row.Category = category.String
		row.Date = date.String
		report.Rows = append(report.Rows, row)
	}
	return report, rows.Err()
}

func (r *ReportRepository) GetTopSellingCategories(ctx context.Context, storeID string, f ReportFilter) (*models.TopSellingCategoriesReport, error) {
	grouped, args := topSellingGroupedSQL("bills", "category", storeID, f)

	// Same client-side fallback rule as the items report: completed orders
	// are only used when no bills produced rows in range.
	var groupCount int
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ("+grouped+") g", args...).Scan(&groupCount); err != nil {
		return nil, err
	}
	if groupCount == 0 {
		grouped, args = topSellingGroupedSQL("orders", "category", storeID, f)
	}

	idx := len(args) + 1
	filtered := grouped
	if f.Search != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(f.Search)
		filtered = fmt.Sprintf(
			"SELECT * FROM (%s) g WHERE g.category ILIKE $%d ESCAPE '\\'",
			grouped, idx,
		)
		args = append(args, "%"+escaped+"%")
		idx++
	}

	report := &models.TopSellingCategoriesReport{
		Rows:           []models.TopSellingCategoryRow{},
		CategoryTotals: []models.CategorySaleTotal{},
		Page:           f.Page,
		PageSize:       f.PageSize,
	}

	summarySQL := fmt.Sprintf(`
		SELECT COUNT(*), COUNT(DISTINCT category_id),
		       COALESCE(SUM(count), 0), COALESCE(SUM(revenue), 0)
		FROM (%s) t
	`, filtered)
	if err := r.db.QueryRowContext(ctx, summarySQL, args...).Scan(
		&report.Total, &report.UniqueCategories, &report.TotalCount, &report.TotalRevenue,
	); err != nil {
		return nil, err
	}
	if report.Total == 0 {
		return report, nil
	}

	// Per-category totals across the whole filtered range drive the revenue
	// split chart — they must not be truncated to the current page.
	catRows, err := r.db.QueryContext(ctx, fmt.Sprintf(`
		SELECT category_id, category, SUM(count)::int, SUM(revenue)
		FROM (%s) t
		GROUP BY category_id, category
		ORDER BY SUM(revenue) DESC
	`, filtered), args...)
	if err != nil {
		return nil, err
	}
	for catRows.Next() {
		var ct models.CategorySaleTotal
		var catID, cat sql.NullString
		if err := catRows.Scan(&catID, &cat, &ct.Count, &ct.Revenue); err != nil {
			catRows.Close()
			return nil, err
		}
		ct.CategoryID = catID.String
		ct.Category = cat.String
		report.CategoryTotals = append(report.CategoryTotals, ct)
	}
	catRows.Close()

	sortExpr := map[string]string{
		"category": "LOWER(category), category",
		"date":     "date",
		"count":    "count",
		"revenue":  "revenue",
	}[f.Sort]
	if sortExpr == "" {
		sortExpr = "count"
	}
	dir := "DESC"
	if f.Dir == "asc" {
		dir = "ASC"
	}

	rowsSQL := fmt.Sprintf(
		"SELECT category_id, category, date, count, revenue FROM (%s) t ORDER BY %s %s, category_id, date",
		filtered, sortExpr, dir,
	)
	if !f.All {
		rowsSQL += fmt.Sprintf(" LIMIT $%d OFFSET $%d", idx, idx+1)
		args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	}

	rows, err := r.db.QueryContext(ctx, rowsSQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var row models.TopSellingCategoryRow
		var catID, cat, date sql.NullString
		if err := rows.Scan(&catID, &cat, &date, &row.Count, &row.Revenue); err != nil {
			return nil, err
		}
		row.CategoryID = catID.String
		row.Category = cat.String
		row.Date = date.String
		report.Rows = append(report.Rows, row)
	}
	return report, rows.Err()
}

// salesProfitGroupedSQL builds the per-item sales aggregation subquery used
// by the sales-based profit report. Cost data only counts for currently
// active items, matching the storefront which looked costs up in the
// (active-only) menu profit report. unit_price falls back to the current
// item price, then 0.
func salesProfitGroupedSQL(source, storeID string, f ReportFilter, hasCosts bool) (string, []interface{}) {
	var from, tsCol, where string
	if source == "orders" {
		from = "orders o JOIN order_items oi ON o.id = oi.order_id"
		tsCol = "o.created_at"
		where = "o.store_id = $1 AND o.status = 'completed'"
	} else {
		from = "bills b JOIN order_items oi ON b.order_id = oi.order_id"
		tsCol = "b.generated_at"
		where = "b.store_id = $1 AND (b.status IS NULL OR b.status = 'active')"
	}

	costJoin := ""
	groupBy := "oi.item_id, i.id, i.name, c.name"
	unitCost := "0::float8"
	if hasCosts {
		costJoin = `LEFT JOIN (
			SELECT item_id, SUM(amount) AS total_cost
			FROM item_expenses WHERE is_active = true
			GROUP BY item_id
		) ic ON ic.item_id = i.id AND i.is_active = true`
		groupBy += ", ic.total_cost"
		unitCost = "COALESCE(ic.total_cost, 0)"
	}

	args := []interface{}{storeID}
	idx := 2
	sqlStr := fmt.Sprintf(`
		SELECT
			oi.item_id AS item_id,
			COALESCE(i.name, oi.item_id) AS name,
			CASE WHEN i.id IS NULL THEN '—' ELSE COALESCE(c.name, 'Uncategorised') END AS category,
			SUM(oi.quantity)::int AS qty_sold,
			COALESCE(SUM(oi.quantity * COALESCE(oi.unit_price, i.price, 0)), 0)::float8 AS revenue,
			COALESCE(SUM(oi.quantity * %s), 0)::float8 AS prep_cost,
			COALESCE(SUM(oi.quantity * (COALESCE(oi.unit_price, i.price, 0) - %s))
				FILTER (WHERE %s > 0), 0)::float8 AS profit,
			%s AS unit_cost
		FROM %s
		LEFT JOIN items i ON oi.item_id = i.id
		LEFT JOIN categories c ON i.category_id = c.id
		%s
		WHERE %s
	`, unitCost, unitCost, unitCost, unitCost, from, costJoin, where)

	if f.From != nil {
		sqlStr += fmt.Sprintf(" AND %s::date >= $%d::date", tsCol, idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		sqlStr += fmt.Sprintf(" AND %s::date <= $%d::date", tsCol, idx)
		args = append(args, *f.To)
		idx++
	}

	sqlStr += fmt.Sprintf(" GROUP BY %s", groupBy)
	return sqlStr, args
}

func (r *ReportRepository) GetSalesProfit(ctx context.Context, storeID string, f ReportFilter) (*models.SalesProfitReport, error) {
	hasCosts := itemExpensesTableExists(ctx, r.db)
	grouped, args := salesProfitGroupedSQL("bills", storeID, f, hasCosts)

	// Same fallback rule as the other sales reports: completed orders are
	// used only when no bills produced rows in range.
	var groupCount int
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ("+grouped+") g", args...).Scan(&groupCount); err != nil {
		return nil, err
	}
	if groupCount == 0 {
		grouped, args = salesProfitGroupedSQL("orders", storeID, f, hasCosts)
	}

	computed := fmt.Sprintf(`SELECT g.*,
			(g.unit_cost > 0) AS has_cost_data,
			CASE WHEN g.revenue > 0 AND g.unit_cost > 0 THEN g.profit / g.revenue * 100 ELSE 0 END AS profit_percent
		FROM (%s) g`, grouped)

	report := &models.SalesProfitReport{
		Rows:     []models.SalesProfitRow{},
		Page:     f.Page,
		PageSize: f.PageSize,
	}

	// Summary covers the whole period regardless of the table search —
	// matches how the storefront computed the KPIs before pagination.
	summarySQL := fmt.Sprintf(`
		SELECT COALESCE(SUM(qty_sold),0)::int, COALESCE(SUM(revenue),0), COALESCE(SUM(prep_cost),0),
		       COALESCE(SUM(profit),0),
		       COALESCE(SUM(revenue) FILTER (WHERE unit_cost > 0),0),
		       COALESCE(SUM(revenue) FILTER (WHERE unit_cost <= 0),0),
		       COUNT(*)::int, COUNT(*) FILTER (WHERE unit_cost > 0)::int
		FROM (%s) t
	`, computed)
	if err := r.db.QueryRowContext(ctx, summarySQL, args...).Scan(
		&report.UnitsSold, &report.Revenue, &report.PrepCost, &report.Profit,
		&report.TrackedRevenue, &report.UntrackedRevenue,
		&report.ItemsSold, &report.ItemsWithCostSold,
	); err != nil {
		return nil, err
	}

	idx := len(args) + 1
	filtered := computed
	if f.Search != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(f.Search)
		filtered = fmt.Sprintf(
			"SELECT * FROM (%s) g WHERE (g.name ILIKE $%d ESCAPE '\\' OR g.category ILIKE $%d ESCAPE '\\')",
			computed, idx, idx,
		)
		args = append(args, "%"+escaped+"%")
		idx++
	}

	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ("+filtered+") t", args...).Scan(&report.Total); err != nil {
		return nil, err
	}
	if report.Total == 0 {
		return report, nil
	}

	sortExpr := map[string]string{
		"name":          "LOWER(name), name",
		"category":      "LOWER(category), category",
		"qtySold":       "qty_sold",
		"revenue":       "revenue",
		"prepCost":      "prep_cost",
		"profit":        "profit",
		"profitPercent": "profit_percent",
	}[f.Sort]
	if sortExpr == "" {
		sortExpr = "profit"
	}
	dir := "DESC"
	if f.Dir == "asc" {
		dir = "ASC"
	}

	rowsSQL := fmt.Sprintf(
		`SELECT item_id, name, category, qty_sold, revenue, prep_cost, profit, profit_percent, has_cost_data
		 FROM (%s) t ORDER BY %s %s, item_id`,
		filtered, sortExpr, dir,
	)
	if !f.All {
		rowsSQL += fmt.Sprintf(" LIMIT $%d OFFSET $%d", idx, idx+1)
		args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	}

	rows, err := r.db.QueryContext(ctx, rowsSQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var row models.SalesProfitRow
		var itemID, name, category sql.NullString
		if err := rows.Scan(&itemID, &name, &category, &row.QtySold, &row.Revenue, &row.PrepCost, &row.Profit, &row.ProfitPercent, &row.HasCostData); err != nil {
			return nil, err
		}
		row.ItemID = itemID.String
		row.Name = name.String
		row.Category = category.String
		report.Rows = append(report.Rows, row)
	}
	return report, rows.Err()
}

func (r *ReportRepository) GetMenuProfit(ctx context.Context, storeID string, f ReportFilter) (*models.MenuProfitReport, error) {
	hasCosts := itemExpensesTableExists(ctx, r.db)

	costExpr := "0::float8"
	costJoin := ""
	// Resolved per row against t.item_id in the paged query below.
	expensesExpr := "'[]'::json"
	if hasCosts {
		costExpr = "COALESCE(ic.total_cost, 0)"
		costJoin = `LEFT JOIN (
			SELECT item_id, SUM(amount) AS total_cost
			FROM item_expenses WHERE is_active = true
			GROUP BY item_id
		) ic ON ic.item_id = i.id`
		expensesExpr = `COALESCE((
			SELECT json_agg(json_build_object(
				'id', e.id, 'itemId', e.item_id, 'name', e.name,
				'description', COALESCE(e.description, ''), 'amount', e.amount
			) ORDER BY e.name)
			FROM item_expenses e
			WHERE e.item_id = t.item_id AND e.is_active = true
		), '[]'::json)`
	}

	// Profit fields mirror applyItemProfitFields: no cost data → zeroes.
	base := fmt.Sprintf(`
		SELECT i.id AS item_id, i.name, COALESCE(c.name, '') AS category_name, i.price,
		       %s AS total_cost,
		       CASE WHEN %s > 0 THEN i.price - %s ELSE 0 END AS profit,
		       CASE WHEN %s > 0 AND i.price > 0 THEN (i.price - %s) / i.price * 100 ELSE 0 END AS profit_percent
		FROM items i
		LEFT JOIN categories c ON i.category_id = c.id
		%s
		WHERE i.store_id = $1 AND i.is_active = true
	`, costExpr, costExpr, costExpr, costExpr, costExpr, costJoin)

	args := []interface{}{storeID}
	idx := 2

	report := &models.MenuProfitReport{
		Rows:     []models.ItemProfitEntry{},
		Page:     f.Page,
		PageSize: f.PageSize,
	}

	// Menu KPIs cover the whole menu regardless of the table search.
	summarySQL := fmt.Sprintf(`
		SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE total_cost > 0)::int,
		       COALESCE(SUM(price),0), COALESCE(SUM(total_cost),0), COALESCE(SUM(profit),0),
		       COALESCE(AVG(profit_percent) FILTER (WHERE total_cost > 0),0)
		FROM (%s) t
	`, base)
	if err := r.db.QueryRowContext(ctx, summarySQL, args...).Scan(
		&report.TotalItems, &report.ItemsWithCostCount,
		&report.TotalSellingValue, &report.TotalCost, &report.TotalProfit,
		&report.AverageProfitPercent,
	); err != nil {
		return nil, err
	}

	filtered := base
	if f.Search != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(f.Search)
		filtered = fmt.Sprintf(
			"SELECT * FROM (%s) g WHERE (g.name ILIKE $%d ESCAPE '\\' OR g.category_name ILIKE $%d ESCAPE '\\')",
			base, idx, idx,
		)
		args = append(args, "%"+escaped+"%")
		idx++
	}

	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM ("+filtered+") t", args...).Scan(&report.Total); err != nil {
		return nil, err
	}
	if report.Total == 0 {
		return report, nil
	}

	sortExpr := map[string]string{
		"name":          "LOWER(name), name",
		"category":      "LOWER(category_name), category_name",
		"price":         "price",
		"cost":          "total_cost",
		"profit":        "profit",
		"profitPercent": "profit_percent",
	}[f.Sort]
	if sortExpr == "" {
		sortExpr = "profit_percent"
	}
	dir := "DESC"
	if f.Dir == "asc" {
		dir = "ASC"
	}

	rowsSQL := fmt.Sprintf(
		`SELECT t.item_id, t.name, t.category_name, t.price, t.total_cost, t.profit, t.profit_percent, %s AS expenses
		 FROM (%s) t ORDER BY %s %s, item_id`,
		expensesExpr, filtered, sortExpr, dir,
	)
	if !f.All {
		rowsSQL += fmt.Sprintf(" LIMIT $%d OFFSET $%d", idx, idx+1)
		args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	}

	rows, err := r.db.QueryContext(ctx, rowsSQL, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var entry models.ItemProfitEntry
		var catName sql.NullString
		var expensesBytes []byte
		if err := rows.Scan(&entry.Item.ID, &entry.Item.Name, &catName, &entry.Item.Price,
			&entry.TotalCost, &entry.Profit, &entry.ProfitPercent, &expensesBytes); err != nil {
			return nil, err
		}
		entry.Item.CategoryName = catName.String
		entry.Item.TotalCost = entry.TotalCost
		entry.Item.Profit = entry.Profit
		entry.Item.ProfitPercent = entry.ProfitPercent
		entry.Expenses = []models.ItemExpense{}
		if len(expensesBytes) > 0 {
			_ = json.Unmarshal(expensesBytes, &entry.Expenses)
		}
		report.Rows = append(report.Rows, entry)
	}
	return report, rows.Err()
}

// reportSortDir whitelists the direction param.
func reportSortDir(dir string) string {
	if dir == "asc" {
		return "ASC"
	}
	return "DESC"
}

// GetExpensesByCategory returns the expenses report grouped by expense
// category. Categories whose expenses fall outside the date range still
// appear with zero totals, matching the unpaginated report. ChartRows
// carries the whole filtered set so the split chart is not limited to the
// current page.
func (r *ReportRepository) GetExpensesByCategory(ctx context.Context, storeID string, f ReportFilter) (*models.ExpenseCategoryReport, error) {
	args := []interface{}{storeID}
	idx := 2

	// Date predicates stay in the JOIN condition so categories with no
	// expenses in range keep their zero-total rows.
	joinConds := ""
	if f.From != nil {
		joinConds += fmt.Sprintf(" AND (e.expense_date IS NULL OR e.expense_date >= $%d::date)", idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		joinConds += fmt.Sprintf(" AND (e.expense_date IS NULL OR e.expense_date <= $%d::date)", idx)
		args = append(args, *f.To)
		idx++
	}

	sqlStr := fmt.Sprintf(`
		SELECT ec.id AS category_id, ec.name AS category_name,
		       COALESCE(SUM(e.amount), 0) AS total_amount,
		       COUNT(e.id)::int AS expense_count
		FROM expense_categories ec
		LEFT JOIN expenses e ON ec.id = e.category_id
			AND e.store_id = $1
			AND e.is_active = true
			%s
		WHERE ec.store_id = $1 AND ec.is_active = true
	`, joinConds)

	if f.Search != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(f.Search)
		sqlStr += fmt.Sprintf(" AND ec.name ILIKE $%d ESCAPE '\\'", idx)
		args = append(args, "%"+escaped+"%")
		idx++
	}

	sqlStr += " GROUP BY ec.id, ec.name"

	sortExpr := map[string]string{
		"category": "LOWER(ec.name), ec.name",
		"amount":   "total_amount",
		"count":    "expense_count",
	}[f.Sort]
	if sortExpr == "" {
		sortExpr = "total_amount"
	}
	sqlStr += fmt.Sprintf(" ORDER BY %s %s, ec.id", sortExpr, reportSortDir(f.Dir))

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []models.ExpenseReport
	for rows.Next() {
		var row models.ExpenseReport
		if err := rows.Scan(&row.CategoryID, &row.CategoryName, &row.TotalAmount, &row.ExpenseCount); err != nil {
			return nil, err
		}
		all = append(all, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	report := &models.ExpenseCategoryReport{
		Rows:      []models.ExpenseReport{},
		Total:     len(all),
		Page:      f.Page,
		PageSize:  f.PageSize,
		ChartRows: all,
	}
	if report.ChartRows == nil {
		report.ChartRows = []models.ExpenseReport{}
	}
	for _, row := range all {
		report.TotalAmount += row.TotalAmount
		report.TotalCount += row.ExpenseCount
	}
	if f.All {
		report.Rows = all
		return report, nil
	}
	start := (f.Page - 1) * f.PageSize
	if start < len(all) {
		end := start + f.PageSize
		if end > len(all) {
			end = len(all)
		}
		report.Rows = all[start:end]
	}
	return report, nil
}

// GetExpensesByDate returns the expenses report grouped by expense date,
// paginated the same way as the category grouping.
func (r *ReportRepository) GetExpensesByDate(ctx context.Context, storeID string, f ReportFilter) (*models.ExpenseDateReport, error) {
	args := []interface{}{storeID}
	idx := 2

	sqlStr := `
		SELECT TO_CHAR(e.expense_date::date, 'YYYY-MM-DD') AS date,
		       COALESCE(SUM(e.amount), 0) AS total_amount,
		       COUNT(e.id)::int AS expense_count
		FROM expenses e
		WHERE e.store_id = $1 AND e.is_active = true
	`
	if f.From != nil {
		sqlStr += fmt.Sprintf(" AND e.expense_date >= $%d::date", idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		sqlStr += fmt.Sprintf(" AND e.expense_date <= $%d::date", idx)
		args = append(args, *f.To)
		idx++
	}
	sqlStr += " GROUP BY e.expense_date::date"

	sortExpr := map[string]string{
		"date":   "date",
		"amount": "total_amount",
		"count":  "expense_count",
	}[f.Sort]
	if sortExpr == "" {
		sortExpr = "date"
	}
	sqlStr += fmt.Sprintf(" ORDER BY %s %s", sortExpr, reportSortDir(f.Dir))

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []models.ExpenseSummary
	for rows.Next() {
		var row models.ExpenseSummary
		if err := rows.Scan(&row.Date, &row.TotalAmount, &row.ExpenseCount); err != nil {
			return nil, err
		}
		all = append(all, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	report := &models.ExpenseDateReport{
		Rows:      []models.ExpenseSummary{},
		Total:     len(all),
		Page:      f.Page,
		PageSize:  f.PageSize,
		ChartRows: all,
	}
	if report.ChartRows == nil {
		report.ChartRows = []models.ExpenseSummary{}
	}
	for _, row := range all {
		report.TotalAmount += row.TotalAmount
		report.TotalCount += row.ExpenseCount
	}
	if f.All {
		report.Rows = all
		return report, nil
	}
	start := (f.Page - 1) * f.PageSize
	if start < len(all) {
		end := start + f.PageSize
		if end > len(all) {
			end = len(all)
		}
		report.Rows = all[start:end]
	}
	return report, nil
}

// GetRevenueEntries returns a paginated slice of bill revenue entries for
// the profit report, each with its order items embedded (the detail modal
// needs them). Sorting/searching/pagination happen server-side.
func (r *ReportRepository) GetRevenueEntries(ctx context.Context, storeID string, f ReportFilter) (*models.RevenueEntriesReport, error) {
	args := []interface{}{storeID}
	idx := 2

	where := "b.store_id = $1 AND (b.status IS NULL OR b.status = 'active')"
	if f.From != nil {
		where += fmt.Sprintf(" AND DATE(b.generated_at) >= $%d::date", idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		where += fmt.Sprintf(" AND DATE(b.generated_at) <= $%d::date", idx)
		args = append(args, *f.To)
		idx++
	}
	if f.Search != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(f.Search)
		where += fmt.Sprintf(
			" AND (b.invoice_no ILIKE $%d ESCAPE '\\' OR b.customer_name ILIKE $%d ESCAPE '\\')",
			idx, idx,
		)
		args = append(args, "%"+escaped+"%")
		idx++
	}

	report := &models.RevenueEntriesReport{
		Rows:     []models.Bill{},
		Page:     f.Page,
		PageSize: f.PageSize,
	}
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM bills b WHERE "+where, args...).Scan(&report.Total); err != nil {
		return nil, err
	}
	if report.Total == 0 {
		return report, nil
	}

	sortExpr := map[string]string{
		"invoice":  "b.invoice_no",
		"date":     "b.generated_at",
		"customer": "LOWER(b.customer_name), b.customer_name",
		"total":    "b.total",
	}[f.Sort]
	if sortExpr == "" {
		sortExpr = "b.generated_at"
	}

	sqlStr := fmt.Sprintf(`
		SELECT b.id, b.store_id, b.order_id, b.table_number, b.table_name, b.invoice_no, b.subtotal, b.tax_total, b.discount, b.total,
		       b.payment_method, b.customer_name, b.customer_mobile, b.is_printed, b.generated_at, b.generated_by,
		       COALESCE(
		         json_agg(
		           json_build_object(
		             'itemId', oi.item_id,
		             'quantity', oi.quantity,
		             'unitPrice', oi.unit_price,
		             'item', json_build_object(
		               'id', i.id,
		               'name', i.name,
		               'price', i.price,
		               'categoryId', i.category_id,
		               'categoryName', COALESCE(c.name, 'Uncategorised')
		             )
		           )
		         ) FILTER (WHERE oi.id IS NOT NULL),
		         '[]'
		       ) as items
		FROM bills b
		LEFT JOIN order_items oi ON b.order_id = oi.order_id
		LEFT JOIN items i ON oi.item_id = i.id
		LEFT JOIN categories c ON i.category_id = c.id
		WHERE %s
		GROUP BY b.id
		ORDER BY %s %s, b.id
	`, where, sortExpr, reportSortDir(f.Dir))

	if !f.All {
		sqlStr += fmt.Sprintf(" LIMIT $%d OFFSET $%d", idx, idx+1)
		args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	}

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var b models.Bill
		var tableName, method, customer, customerMobile, generatedBy sql.NullString
		var itemsBytes []byte
		if err := rows.Scan(
			&b.ID, &b.StoreID, &b.OrderID, &b.TableNumber, &tableName, &b.InvoiceNo, &b.Subtotal, &b.TaxTotal, &b.Discount, &b.Total,
			&method, &customer, &customerMobile, &b.IsPrinted, &b.GeneratedAt, &generatedBy,
			&itemsBytes,
		); err != nil {
			return nil, err
		}
		b.TableName = tableName.String
		b.PaymentMethod = method.String
		b.CustomerName = customer.String
		b.CustomerMobile = customerMobile.String
		b.GeneratedBy = generatedBy.String

		b.Items = []models.OrderItem{}
		if len(itemsBytes) > 0 {
			_ = json.Unmarshal(itemsBytes, &b.Items)
		}
		report.Rows = append(report.Rows, b)
	}
	return report, rows.Err()
}

// GetExpenseEntries returns a paginated slice of expense entries for the
// profit report.
func (r *ReportRepository) GetExpenseEntries(ctx context.Context, storeID string, f ReportFilter) (*models.ExpenseEntriesReport, error) {
	args := []interface{}{storeID}
	idx := 2

	where := "e.store_id = $1 AND e.is_active = true"
	if f.From != nil {
		where += fmt.Sprintf(" AND DATE(e.expense_date) >= $%d::date", idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		where += fmt.Sprintf(" AND DATE(e.expense_date) <= $%d::date", idx)
		args = append(args, *f.To)
		idx++
	}
	if f.Search != "" {
		escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(f.Search)
		where += fmt.Sprintf(
			" AND (e.title ILIKE $%d ESCAPE '\\' OR ec.name ILIKE $%d ESCAPE '\\')",
			idx, idx,
		)
		args = append(args, "%"+escaped+"%")
		idx++
	}

	report := &models.ExpenseEntriesReport{
		Rows:     []models.Expense{},
		Page:     f.Page,
		PageSize: f.PageSize,
	}
	if err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id WHERE "+where,
		args...).Scan(&report.Total); err != nil {
		return nil, err
	}
	if report.Total == 0 {
		return report, nil
	}

	sortExpr := map[string]string{
		"date":     "e.expense_date",
		"title":    "LOWER(e.title), e.title",
		"category": "LOWER(ec.name), ec.name",
		"amount":   "e.amount",
	}[f.Sort]
	if sortExpr == "" {
		sortExpr = "e.expense_date"
	}

	sqlStr := fmt.Sprintf(`
		SELECT e.id, e.store_id, e.category_id, ec.name as category_name, e.title, e.description,
		       e.amount, e.expense_date, e.payment_method, e.receipt_number, e.vendor,
		       e.attachments, e.is_active, e.created_at, e.updated_at, e.created_by
		FROM expenses e
		LEFT JOIN expense_categories ec ON e.category_id = ec.id
		WHERE %s
		ORDER BY %s %s, e.id
	`, where, sortExpr, reportSortDir(f.Dir))

	if !f.All {
		sqlStr += fmt.Sprintf(" LIMIT $%d OFFSET $%d", idx, idx+1)
		args = append(args, f.PageSize, (f.Page-1)*f.PageSize)
	}

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var e models.Expense
		var categoryName, description, paymentMethod, receiptNumber, vendor, createdBy sql.NullString
		var attachmentsBytes []byte
		if err := rows.Scan(
			&e.ID, &e.StoreID, &e.CategoryID, &categoryName, &e.Title, &description,
			&e.Amount, &e.ExpenseDate, &paymentMethod, &receiptNumber, &vendor,
			&attachmentsBytes, &e.IsActive, &e.CreatedAt, &e.UpdatedAt, &createdBy,
		); err != nil {
			return nil, err
		}
		e.CategoryName = categoryName.String
		e.Description = description.String
		e.PaymentMethod = paymentMethod.String
		e.ReceiptNumber = receiptNumber.String
		e.Vendor = vendor.String
		e.CreatedBy = createdBy.String

		e.Attachments = []string{}
		if len(attachmentsBytes) > 0 {
			_ = json.Unmarshal(attachmentsBytes, &e.Attachments)
		}
		report.Rows = append(report.Rows, e)
	}
	return report, rows.Err()
}

// ==========================================
// SUPPORT TICKET REPOSITORY
// ==========================================

type SupportTicketRepository struct {
	db *sql.DB
}

// ticketSelect is the shared SELECT for ticket list/detail queries. It joins
// store and creator for display details and derives message stats in one pass.
const ticketSelect = `
	SELECT t.id, t.store_id, COALESCE(t.created_by, ''), t.subject, t.category,
		t.priority, t.status, t.created_at, t.updated_at,
		COALESCE(u.name, '') AS created_by_name,
		COALESCE(s.name, '') AS store_name,
		COALESCE(s.branch, '') AS store_branch,
		COALESCE(s.phone, '') AS store_phone,
		COALESCE(s.location, '') AS store_location,
		(SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
		COALESCE((SELECT m.message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1), '') AS last_message
	FROM support_tickets t
	LEFT JOIN users u ON u.id = t.created_by
	LEFT JOIN stores s ON s.id = t.store_id
`

// ticketOrder sorts actionable tickets first (open, then in progress), newest activity first.
const ticketOrder = `
	ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
		t.updated_at DESC
`

func scanTicket(row interface{ Scan(...interface{}) error }) (*models.SupportTicket, error) {
	t := &models.SupportTicket{}
	err := row.Scan(
		&t.ID, &t.StoreID, &t.CreatedBy, &t.Subject, &t.Category,
		&t.Priority, &t.Status, &t.CreatedAt, &t.UpdatedAt,
		&t.CreatedByName, &t.StoreName, &t.StoreBranch, &t.StorePhone, &t.StoreLocation,
		&t.MessageCount, &t.LastMessage,
	)
	if err != nil {
		return nil, err
	}
	return t, nil
}

// Create inserts a ticket and its first message atomically.
func (r *SupportTicketRepository) Create(ctx context.Context, storeID, userID string, req models.CreateSupportTicketRequest) (*models.SupportTicket, error) {
	ticketID := uuid.New().String()
	messageID := uuid.New().String()

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO support_tickets (id, store_id, created_by, subject, category, priority, status, modified_by)
		VALUES ($1, $2, $3, $4, $5, $6, 'open', $3)
	`, ticketID, storeID, userID, req.Subject, req.Category, req.Priority)
	if err != nil {
		return nil, err
	}

	var senderRole string
	if err = tx.QueryRowContext(ctx, `SELECT role FROM users WHERE id = $1`, userID).Scan(&senderRole); err != nil {
		return nil, err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO support_messages (id, ticket_id, sender_id, sender_role, message)
		VALUES ($1, $2, $3, $4, $5)
	`, messageID, ticketID, userID, senderRole, req.Message)
	if err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	return r.GetByID(ctx, ticketID)
}

// ListByStore returns all tickets for one store, actionable first.
func (r *SupportTicketRepository) ListByStore(ctx context.Context, storeID string) ([]models.SupportTicket, error) {
	rows, err := r.db.QueryContext(ctx, ticketSelect+`WHERE t.store_id = $1`+ticketOrder, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tickets := []models.SupportTicket{}
	for rows.Next() {
		t, err := scanTicket(rows)
		if err != nil {
			return nil, err
		}
		tickets = append(tickets, *t)
	}
	return tickets, rows.Err()
}

// ListAll returns every ticket (superadmin inbox), optionally filtered by status.
func (r *SupportTicketRepository) ListAll(ctx context.Context, status string) ([]models.SupportTicket, error) {
	query := ticketSelect
	var args []interface{}
	if status != "" && status != "all" {
		query += `WHERE t.status = $1`
		args = append(args, status)
	}
	rows, err := r.db.QueryContext(ctx, query+ticketOrder, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tickets := []models.SupportTicket{}
	for rows.Next() {
		t, err := scanTicket(rows)
		if err != nil {
			return nil, err
		}
		tickets = append(tickets, *t)
	}
	return tickets, rows.Err()
}

// GetByID returns one ticket with store/creator details.
func (r *SupportTicketRepository) GetByID(ctx context.Context, id string) (*models.SupportTicket, error) {
	return scanTicket(r.db.QueryRowContext(ctx, ticketSelect+`WHERE t.id = $1`, id))
}

// ListMessages returns a ticket's thread in chronological order.
func (r *SupportTicketRepository) ListMessages(ctx context.Context, ticketID string) ([]models.SupportMessage, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT m.id, m.ticket_id, COALESCE(m.sender_id, ''), COALESCE(u.name, ''),
			COALESCE(m.sender_role, ''), m.message, m.created_at
		FROM support_messages m
		LEFT JOIN users u ON u.id = m.sender_id
		WHERE m.ticket_id = $1
		ORDER BY m.created_at ASC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []models.SupportMessage{}
	for rows.Next() {
		var m models.SupportMessage
		if err := rows.Scan(&m.ID, &m.TicketID, &m.SenderID, &m.SenderName, &m.SenderRole, &m.Message, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

// AddMessage appends a reply and applies the workflow side-effects in one
// transaction: a superadmin reply moves open -> in_progress, and a store
// reply reopens resolved/closed tickets.
func (r *SupportTicketRepository) AddMessage(ctx context.Context, ticketID, senderID, senderRole, message string) (*models.SupportMessage, error) {
	msgID := uuid.New().String()

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO support_messages (id, ticket_id, sender_id, sender_role, message)
		VALUES ($1, $2, $3, $4, $5)
	`, msgID, ticketID, senderID, senderRole, message)
	if err != nil {
		return nil, err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE support_tickets SET
			updated_at = CURRENT_TIMESTAMP,
			status = CASE
				WHEN $2 <> 'superadmin' AND status IN ('resolved', 'closed') THEN 'open'
				WHEN $2 = 'superadmin' AND status = 'open' THEN 'in_progress'
				ELSE status
			END
		WHERE id = $1
	`, ticketID, senderRole)
	if err != nil {
		return nil, err
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	var m models.SupportMessage
	err = r.db.QueryRowContext(ctx, `
		SELECT m.id, m.ticket_id, COALESCE(m.sender_id, ''), COALESCE(u.name, ''),
			COALESCE(m.sender_role, ''), m.message, m.created_at
		FROM support_messages m
		LEFT JOIN users u ON u.id = m.sender_id
		WHERE m.id = $1
	`, msgID).Scan(&m.ID, &m.TicketID, &m.SenderID, &m.SenderName, &m.SenderRole, &m.Message, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// UpdateStatus moves a ticket through the support workflow (superadmin).
func (r *SupportTicketRepository) UpdateStatus(ctx context.Context, id, status string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE support_tickets SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, status, id)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}
