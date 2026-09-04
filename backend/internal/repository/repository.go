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
	Cache           *MemoryCache
}

func NewRepository(db *sql.DB, redisCache *RedisCache) *Repository {
	cache := NewMemoryCache()
	return &Repository{
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
		Cache:           cache,
	}
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
		sqlStr = "SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, created_at FROM stores ORDER BY name"
	} else if role == "business_owner" {
		sqlStr = `SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, created_at 
		          FROM stores WHERE id IN (SELECT store_id FROM user_stores WHERE user_id = $1) ORDER BY name`
		args = append(args, userID)
	} else {
		sqlStr = `SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, created_at 
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
		var branch, location, gstin, fssaiNo, phone, printerName, printerVendor, printerProduct, logoURL, themeColor sql.NullString
		err := rows.Scan(
			&s.ID, &s.Name, &branch, &location, &gstin, &fssaiNo, &phone,
			&printerName, &printerVendor, &printerProduct, &s.InvoiceSize, &s.KOTPrintEnabled, &s.RemoteBillingEnabled,
			&logoURL, &themeColor, &s.TaxEnabled, &s.DefaultTaxPercent, &s.IsActive, &s.CreatedAt,
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
		stores = append(stores, s)
	}
	return stores, nil
}

func (r *StoreRepository) GetByID(ctx context.Context, id string) (*models.Store, error) {
	sqlStr := "SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, logo_url, theme_color, tax_enabled, default_tax_percent, is_active, created_at FROM stores WHERE id = $1"
	row := r.db.QueryRowContext(ctx, sqlStr, id)

	var s models.Store
	var branch, location, gstin, fssaiNo, phone, printerName, printerVendor, printerProduct, logoURL, themeColor sql.NullString
	err := row.Scan(
		&s.ID, &s.Name, &branch, &location, &gstin, &fssaiNo, &phone,
		&printerName, &printerVendor, &printerProduct, &s.InvoiceSize, &s.KOTPrintEnabled, &s.RemoteBillingEnabled,
		&logoURL, &themeColor, &s.TaxEnabled, &s.DefaultTaxPercent, &s.IsActive, &s.CreatedAt,
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

func (r *StoreRepository) UpdateLogo(ctx context.Context, id, logoBase64 string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE stores SET logo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", logoBase64, id)
	return err
}

func (r *StoreRepository) DeleteLogo(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE stores SET logo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", id)
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

func (r *UserRepository) UpdatePassword(ctx context.Context, id, hashedPassword string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE users SET password = $1 WHERE id = $2", hashedPassword, id)
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

	rows, err := r.db.QueryContext(ctx, "SELECT id, store_id, name, description, is_active FROM categories WHERE store_id = $1 AND is_active = true ORDER BY name", storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var c models.Category
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

func (r *CategoryRepository) Create(ctx context.Context, c models.Category) error {
	_, err := r.db.ExecContext(ctx, "INSERT INTO categories (id, store_id, name, description) VALUES ($1, $2, $3, $4)",
		c.ID, c.StoreID, c.Name, c.Description)
	if err == nil && r.redis != nil {
		r.redis.Delete(ctx, "categories:"+c.StoreID)
	}
	return err
}

func (r *CategoryRepository) Update(ctx context.Context, c models.Category) error {
	_, err := r.db.ExecContext(ctx, "UPDATE categories SET name = $1, description = $2 WHERE id = $3",
		c.Name, c.Description, c.ID)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, "categories:")
	}
	return err
}

func (r *CategoryRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE categories SET is_active = false WHERE id = $1", id)
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
			SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active,
			       c.name as category_name,
			       COALESCE((SELECT SUM(ie.amount) FROM item_expenses ie WHERE ie.item_id = i.id AND ie.is_active = true), 0) as total_cost
			FROM items i
			LEFT JOIN categories c ON i.category_id = c.id
			WHERE i.store_id = $1 AND i.is_active = true
			ORDER BY i.name
		`
	} else {
		// Legacy response shape for clients that do not request profit data
		sqlStr = `
			SELECT i.id, i.store_id, i.category_id, i.name, i.description, i.price, i.hsn_code, i.tax_percent, i.is_active,
			       c.name as category_name
			FROM items i
			LEFT JOIN categories c ON i.category_id = c.id
			WHERE i.store_id = $1 AND i.is_active = true
			ORDER BY i.name
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
				&i.ID, &i.StoreID, &i.CategoryID, &i.Name, &desc, &i.Price, &hsn, &i.TaxPercent, &i.IsActive,
				&catName, &i.TotalCost,
			)
		} else {
			err = rows.Scan(
				&i.ID, &i.StoreID, &i.CategoryID, &i.Name, &desc, &i.Price, &hsn, &i.TaxPercent, &i.IsActive,
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
	sqlStr := "INSERT INTO items (id, store_id, category_id, name, description, price, hsn_code, tax_percent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
	_, err := r.db.ExecContext(ctx, sqlStr, i.ID, i.StoreID, i.CategoryID, i.Name, i.Description, i.Price, i.HSNCode, i.TaxPercent)
	if err == nil && r.redis != nil {
		r.invalidateCache(ctx, i.StoreID)
	}
	return err
}

func (r *ItemRepository) Update(ctx context.Context, i models.Item) error {
	sqlStr := "UPDATE items SET category_id = $1, name = $2, description = $3, price = $4, hsn_code = $5, tax_percent = $6 WHERE id = $7"
	_, err := r.db.ExecContext(ctx, sqlStr, i.CategoryID, i.Name, i.Description, i.Price, i.HSNCode, i.TaxPercent, i.ID)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, itemsCacheKeyPrefix)
		r.redis.DeleteByPrefix(ctx, "items:")
	}
	return err
}

func (r *ItemRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE items SET is_active = false WHERE id = $1", id)
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
	sqlStr := `UPDATE item_expenses SET name = $1, description = $2, amount = $3 WHERE id = $4`
	_, err := r.db.ExecContext(ctx, sqlStr, e.Name, e.Description, e.Amount, e.ID)
	if err == nil {
		r.invalidateItemCache(ctx, e.StoreID)
	}
	return err
}

func (r *ItemExpenseRepository) Delete(ctx context.Context, id, storeID string) error {
	if !r.tableExists(ctx) {
		return fmt.Errorf("item_expenses table not available; restart the server to apply migrations")
	}
	_, err := r.db.ExecContext(ctx, "UPDATE item_expenses SET is_active = false WHERE id = $1", id)
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
	rows, err := r.db.QueryContext(ctx, "SELECT id, store_id, number, seats, position_x, position_y, is_active, section FROM tables WHERE store_id = $1 AND is_active = true ORDER BY number", storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []models.Table
	for rows.Next() {
		var t models.Table
		if err := rows.Scan(&t.ID, &t.StoreID, &t.Number, &t.Seats, &t.Position.X, &t.Position.Y, &t.IsActive, &t.Section); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}

	return tables, nil
}

func (r *TableRepository) Create(ctx context.Context, t models.Table) error {
	fmt.Printf("TableRepository.Create: id=%s store_id=%s number=%d seats=%d pos=(%d,%d) section=%v\n",
		t.ID, t.StoreID, t.Number, t.Seats, t.Position.X, t.Position.Y, t.Section)
	_, err := r.db.ExecContext(ctx, "INSERT INTO tables (id, store_id, number, seats, position_x, position_y, section) VALUES ($1, $2, $3, $4, $5, $6, $7)",
		t.ID, t.StoreID, t.Number, t.Seats, t.Position.X, t.Position.Y, t.Section)
	if err != nil {
		fmt.Println("TableRepository.Create: exec error -", err)
	}
	return err
}

func (r *TableRepository) GetByID(ctx context.Context, id string) (*models.Table, error) {
	row := r.db.QueryRowContext(ctx, "SELECT id, store_id, number, seats, position_x, position_y, is_active, section FROM tables WHERE id = $1", id)
	var t models.Table
	if err := row.Scan(&t.ID, &t.StoreID, &t.Number, &t.Seats, &t.Position.X, &t.Position.Y, &t.IsActive, &t.Section); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}

func (r *TableRepository) Update(ctx context.Context, t models.Table) error {
	_, err := r.db.ExecContext(ctx, "UPDATE tables SET number = $1, seats = $2, position_x = $3, position_y = $4, section = $5 WHERE id = $6",
		t.Number, t.Seats, t.Position.X, t.Position.Y, t.Section, t.ID)
	return err
}

func (r *TableRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM tables WHERE id = $1", id)
	return err
}

// RenameSection bulk-renames a section within a store (case-sensitive match).
// If oldName is empty, it targets tables with NULL section (the default).
// It also renames the matching row in table_sections so the catalog stays in sync.
func (r *TableRepository) RenameSection(ctx context.Context, storeID, oldName, newName string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		"UPDATE tables SET section = $1 WHERE store_id = $2 AND COALESCE(section, '') = COALESCE($3, '')",
		newName, storeID, oldName); err != nil {
		return err
	}

	if oldName != "" {
		if _, err := tx.ExecContext(ctx,
			"UPDATE table_sections SET name = $1 WHERE store_id = $2 AND name = $3",
			newName, storeID, oldName); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// DeleteSection clears the section on all tables in the given section,
// effectively moving them back to the default (NULL) section, and removes the
// section from the table_sections catalog.
func (r *TableRepository) DeleteSection(ctx context.Context, storeID, sectionName string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx,
		"UPDATE tables SET section = NULL WHERE store_id = $1 AND COALESCE(section, '') = COALESCE($2, '')",
		storeID, sectionName); err != nil {
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
		"SELECT id, store_id, name, created_at FROM table_sections WHERE store_id = $1 ORDER BY name", storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sections []models.TableSection
	for rows.Next() {
		var s models.TableSection
		if err := rows.Scan(&s.ID, &s.StoreID, &s.Name, &s.CreatedAt); err != nil {
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

// ==========================================
// ORDER REPOSITORY
// ==========================================

type OrderRepository struct {
	db *sql.DB
}

func (r *OrderRepository) GetAll(ctx context.Context, storeID, status string) ([]models.Order, error) {
	sqlStr := `
		SELECT o.id, o.store_id, o.table_id, o.table_number, o.status, o.order_type, o.customer_name, o.customer_mobile,
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

	if status != "" {
		sqlStr += fmt.Sprintf(" AND o.status = $%d", idx)
		args = append(args, status)
		idx++
	}

	sqlStr += " GROUP BY o.id ORDER BY o.created_at DESC"

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var o models.Order
		var tableID, method, statusPay, createdBy, orderType, customerName, customerMobile sql.NullString
		var cancelledAt sql.NullTime
		var itemsBytes []byte
		err := rows.Scan(
			&o.ID, &o.StoreID, &tableID, &o.TableNumber, &o.Status, &orderType, &customerName, &customerMobile,
			&o.TotalAmount, &o.TaxAmount, &o.DiscountAmount,
			&method, &statusPay, &createdBy, &o.CreatedAt, &o.UpdatedAt, &cancelledAt,
			&itemsBytes,
		)
		if err != nil {
			return nil, err
		}
		o.TableID = tableID.String
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
		SELECT o.id, o.store_id, o.table_id, o.table_number, o.status, o.order_type, o.customer_name, o.customer_mobile,
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
	var tableID, method, statusPay, createdBy, orderType, customerName, customerMobile sql.NullString
	var cancelledAt sql.NullTime
	var itemsBytes []byte
	err := row.Scan(
		&o.ID, &o.StoreID, &tableID, &o.TableNumber, &o.Status, &orderType, &customerName, &customerMobile,
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

	sqlStr := `INSERT INTO orders (id, store_id, table_id, table_number, status, order_type, customer_name, customer_mobile, total_amount, tax_amount, discount_amount, payment_method, created_by)
	           VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12)`
	var payMethod, orderType, customerName, customerMobile, tableID interface{}
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

	_, err = tx.ExecContext(ctx, sqlStr,
		o.ID, o.StoreID, tableID, o.TableNumber, orderType, customerName, customerMobile, o.TotalAmount, o.TaxAmount, o.DiscountAmount, payMethod, o.CreatedBy,
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

func (r *OrderRepository) Update(ctx context.Context, id string, updates map[string]interface{}, items []models.OrderItem, hasItems bool) error {
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
				INSERT INTO order_items (order_id, item_id, quantity, unit_price, tax_percent, notes)
				VALUES ($1, $2, $3, $4, $5, $6)
			`, id, item.ItemID, item.Quantity, price, item.TaxPercent, notes)
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
		_, err = tx.ExecContext(ctx, "UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", id)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *OrderRepository) Complete(ctx context.Context, id, paymentMethod string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE orders SET status = 'completed', payment_status = 'paid', payment_method = $1, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $2
	`, paymentMethod, id)
	return err
}

func (r *OrderRepository) Cancel(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		UPDATE orders SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1
	`, id)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE bills SET status = 'cancelled' WHERE order_id = $1 AND (status IS NULL OR status = 'active')
	`, id)
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

func (r *BillRepository) GetAll(ctx context.Context, storeID string) ([]models.Bill, error) {
	sqlStr := `
		SELECT b.id, b.store_id, b.order_id, b.table_number, b.invoice_no, b.subtotal, b.tax_total, b.discount, b.total,
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
		GROUP BY b.id
		ORDER BY b.generated_at DESC
	`
	rows, err := r.db.QueryContext(ctx, sqlStr, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bills []models.Bill
	for rows.Next() {
		var b models.Bill
		var method, customer, customerMobile, generatedBy, billStatus sql.NullString
		var itemsBytes []byte
		err := rows.Scan(
			&b.ID, &b.StoreID, &b.OrderID, &b.TableNumber, &b.InvoiceNo, &b.Subtotal, &b.TaxTotal, &b.Discount, &b.Total,
			&method, &customer, &customerMobile, &b.IsPrinted, &billStatus, &b.GeneratedAt, &generatedBy,
			&itemsBytes,
		)
		if err != nil {
			return nil, err
		}
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
	sqlStr := `
		INSERT INTO bills (id, store_id, order_id, table_number, invoice_no, subtotal, tax_total, discount, total, payment_method, customer_name, customer_mobile, generated_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
		b.ID, b.StoreID, b.OrderID, b.TableNumber, b.InvoiceNo, b.Subtotal, b.TaxTotal, b.Discount, b.Total, payMethod, custName, custMobile, b.GeneratedBy,
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

func (r *BillRepository) MarkAsPrinted(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE bills SET is_printed = true WHERE id = $1", id)
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

func (r *SystemRepository) GetStats(ctx context.Context) (map[string]int, error) {
	stats := make(map[string]int)

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

func (r *SystemRepository) SaveConfig(ctx context.Context, enabled bool, intervalMins int) error {
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
		INSERT INTO global_settings (key, value) VALUES ('cleanup_enabled', $1)
		ON CONFLICT (key) DO UPDATE SET value = $1
	`, enabledStr)
	if err != nil {
		return err
	}

	intervalStr := fmt.Sprintf("%d", intervalMins)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value) VALUES ('cleanup_interval_mins', $1)
		ON CONFLICT (key) DO UPDATE SET value = $1
	`, intervalStr)
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
			SET enabled = $1, version = $2, download_url = $3, release_notes = $4, updated_at = CURRENT_TIMESTAMP
			WHERE id = $5
		`, update.Enabled, update.Version, update.DownloadURL, update.ReleaseNotes, existingID)
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

func (r *SupportConfigRepository) Save(ctx context.Context, req models.SupportConfigRequest) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value) VALUES ('support_email', $1)
		ON CONFLICT (key) DO UPDATE SET value = $1
	`, req.Email)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value) VALUES ('support_phone', $1)
		ON CONFLICT (key) DO UPDATE SET value = $1
	`, req.Phone)
	if err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value) VALUES ('support_whatsapp_link', $1)
		ON CONFLICT (key) DO UPDATE SET value = $1
	`, req.WhatsAppLink)
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
func (r *UpdateRepoRepository) Save(ctx context.Context, repo string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO global_settings (key, value) VALUES ('update_github_repo', $1)
		ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
	`, repo)
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
func (r *GeminiConfigRepository) Save(ctx context.Context, apiKey, model string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value) VALUES ('gemini_api_key', $1)
		ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
	`, apiKey); err != nil {
		return err
	}

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO global_settings (key, value) VALUES ('gemini_model', $1)
		ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
	`, model); err != nil {
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
	_, err := r.db.ExecContext(ctx, "UPDATE expense_categories SET name = $1, description = $2 WHERE id = $3",
		c.Name, c.Description, c.ID)
	if err == nil && r.redis != nil {
		r.redis.DeleteByPrefix(ctx, "expense_categories:")
	}
	return err
}

func (r *ExpenseCategoryRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE expense_categories SET is_active = false WHERE id = $1", id)
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
	           attachments = $9::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $10`

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
		paymentMethod, receiptNumber, vendor, string(attachmentsJSON), e.ID)
	return err
}

func (r *ExpenseRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE expenses SET is_active = false WHERE id = $1", id)
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

func (r *RevenueReportRepository) GetRevenueReport(ctx context.Context, storeID, startDate, endDate string) (*models.RevenueReport, error) {
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

	// Fetch individual bills (revenue entries) with items
	billsSQL := `
		SELECT b.id, b.store_id, b.order_id, b.table_number, b.invoice_no, b.subtotal, b.tax_total, b.discount, b.total,
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
		var method, customer, customerMobile, generatedBy sql.NullString
		var itemsBytes []byte
		err := billRows.Scan(
			&b.ID, &b.StoreID, &b.OrderID, &b.TableNumber, &b.InvoiceNo, &b.Subtotal, &b.TaxTotal, &b.Discount, &b.Total,
			&method, &customer, &customerMobile, &b.IsPrinted, &b.GeneratedAt, &generatedBy,
			&itemsBytes,
		)
		if err != nil {
			return nil, err
		}
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
		Bills:             bills,
		Expenses:          expenses,
	}

	return report, nil
}
