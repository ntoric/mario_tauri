package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"sync"
	"time"

	"cafe-backend/internal/models"

	"github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"github.com/google/uuid"
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
	Store              *StoreRepository
	User               *UserRepository
	Category           *CategoryRepository
	Item               *ItemRepository
	Table              *TableRepository
	Order              *OrderRepository
	Bill               *BillRepository
	System             *SystemRepository
	AppUpdate          *AppUpdateRepository
	SupportConfig      *SupportConfigRepository
	SmtpConfig         *SmtpConfigRepository
	ExpenseCategory    *ExpenseCategoryRepository
	Expense            *ExpenseRepository
	ItemExpense        *ItemExpenseRepository
	RevenueReport      *RevenueReportRepository
	Inventory          *InventoryRepository
	Recipe             *RecipeRepository
	Purchase           *PurchaseRepository
	Cache              *MemoryCache
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
		SmtpConfig:      &SmtpConfigRepository{db: db},
		ExpenseCategory: &ExpenseCategoryRepository{db: db, redis: redisCache},
		Expense:         &ExpenseRepository{db: db, redis: redisCache},
		ItemExpense:     &ItemExpenseRepository{db: db, redis: redisCache},
		RevenueReport:   &RevenueReportRepository{db: db},
		Inventory:       &InventoryRepository{db: db, redis: redisCache},
		Recipe:          &RecipeRepository{db: db, redis: redisCache},
		Purchase:        &PurchaseRepository{db: db, redis: redisCache},
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
		sqlStr = "SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, kitchen_window_enabled, logo_url, theme_color, is_active, created_at FROM stores ORDER BY name"
	} else if role == "business_owner" {
		sqlStr = `SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, kitchen_window_enabled, logo_url, theme_color, is_active, created_at
		          FROM stores WHERE id IN (SELECT store_id FROM user_stores WHERE user_id = $1) ORDER BY name`
		args = append(args, userID)
	} else {
		sqlStr = `SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, kitchen_window_enabled, logo_url, theme_color, is_active, created_at
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
			&printerName, &printerVendor, &printerProduct, &s.InvoiceSize, &s.KOTPrintEnabled, &s.RemoteBillingEnabled, &s.KitchenWindowEnabled,
			&logoURL, &themeColor, &s.IsActive, &s.CreatedAt,
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
	sqlStr := "SELECT id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, kitchen_window_enabled, logo_url, theme_color, is_active, created_at FROM stores WHERE id = $1"
	row := r.db.QueryRowContext(ctx, sqlStr, id)

	var s models.Store
	var branch, location, gstin, fssaiNo, phone, printerName, printerVendor, printerProduct, logoURL, themeColor sql.NullString
	err := row.Scan(
		&s.ID, &s.Name, &branch, &location, &gstin, &fssaiNo, &phone,
		&printerName, &printerVendor, &printerProduct, &s.InvoiceSize, &s.KOTPrintEnabled, &s.RemoteBillingEnabled, &s.KitchenWindowEnabled,
		&logoURL, &themeColor, &s.IsActive, &s.CreatedAt,
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
	sqlStr := `INSERT INTO stores (id, name, branch, location, gstin, fssai_no, phone, printer_name, printer_vendor_id, printer_product_id, invoice_size, kot_print_enabled, remote_billing_enabled, is_active)
	           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)`
	_, err := r.db.ExecContext(ctx, sqlStr,
		s.ID, s.Name, s.Branch, s.Location, s.GSTIN, s.FSSAINo, s.Phone,
		s.PrinterName, s.PrinterVendorID, s.PrinterProductID, s.InvoiceSize, s.KOTPrintEnabled, s.RemoteBillingEnabled,
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
		SELECT u.id, u.username, u.name, u.email, u.phone, u.role, u.store_id, u.is_active, u.created_at,
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
		var email, phone, storeIDNull, storeNameNull sql.NullString
		var storeIDs pq.StringArray
		err := rows.Scan(
			&u.ID, &u.Username, &u.Name, &email, &phone, &u.Role, &storeIDNull, &u.IsActive, &u.CreatedAt,
			&storeNameNull, &storeIDs,
		)
		if err != nil {
			return nil, err
		}
		u.Email = email.String
		u.Phone = phone.String
		u.StoreID = storeIDNull.String
		u.StoreName = storeNameNull.String
		u.StoreIDs = []string(storeIDs)
		users = append(users, u)
	}
	return users, nil
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*models.User, error) {
	sqlStr := `
		SELECT u.id, u.username, u.password, u.name, u.email, u.phone, u.role, u.store_id, u.is_active, u.created_at,
		       s.name as store_name
		FROM users u
		LEFT JOIN stores s ON u.store_id = s.id
		WHERE u.id = $1
	`
	row := r.db.QueryRowContext(ctx, sqlStr, id)

	var u models.User
	var email, phone, storeIDNull, storeNameNull sql.NullString
	err := row.Scan(
		&u.ID, &u.Username, &u.Password, &u.Name, &email, &phone, &u.Role, &storeIDNull, &u.IsActive, &u.CreatedAt,
		&storeNameNull,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Email = email.String
	u.Phone = phone.String
	u.StoreID = storeIDNull.String
	u.StoreName = storeNameNull.String
	return &u, nil
}

func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	sqlStr := `
		SELECT u.id, u.username, u.password, u.name, u.email, u.phone, u.role, u.store_id, u.is_active, u.created_at,
		       s.name as store_name
		FROM users u
		LEFT JOIN stores s ON u.store_id = s.id
		WHERE u.username = $1 AND u.is_active = true
	`
	row := r.db.QueryRowContext(ctx, sqlStr, username)

	var u models.User
	var email, phone, storeIDNull, storeNameNull sql.NullString
	err := row.Scan(
		&u.ID, &u.Username, &u.Password, &u.Name, &email, &phone, &u.Role, &storeIDNull, &u.IsActive, &u.CreatedAt,
		&storeNameNull,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Email = email.String
	u.Phone = phone.String
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

	sqlStr := `INSERT INTO users (id, username, password, name, email, phone, role, store_id, is_active)
	           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`
	var finalStoreID interface{}
	if u.StoreID != "" {
		finalStoreID = u.StoreID
	}

	_, err = tx.ExecContext(ctx, sqlStr, u.ID, u.Username, u.Password, u.Name, u.Email, u.Phone, u.Role, finalStoreID)
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
	rows, err := r.db.QueryContext(ctx, "SELECT id, store_id, number, seats, position_x, position_y, is_active FROM tables WHERE store_id = $1 AND is_active = true ORDER BY number", storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []models.Table
	for rows.Next() {
		var t models.Table
		if err := rows.Scan(&t.ID, &t.StoreID, &t.Number, &t.Seats, &t.Position.X, &t.Position.Y, &t.IsActive); err != nil {
			return nil, err
		}
		tables = append(tables, t)
	}

	return tables, nil
}

func (r *TableRepository) Create(ctx context.Context, t models.Table) error {
	fmt.Printf("TableRepository.Create: id=%s store_id=%s number=%d seats=%d pos=(%d,%d)\n",
		t.ID, t.StoreID, t.Number, t.Seats, t.Position.X, t.Position.Y)
	_, err := r.db.ExecContext(ctx, "INSERT INTO tables (id, store_id, number, seats, position_x, position_y) VALUES ($1, $2, $3, $4, $5, $6)",
		t.ID, t.StoreID, t.Number, t.Seats, t.Position.X, t.Position.Y)
	if err != nil {
		fmt.Println("TableRepository.Create: exec error -", err)
	}
	return err
}

func (r *TableRepository) GetByID(ctx context.Context, id string) (*models.Table, error) {
	row := r.db.QueryRowContext(ctx, "SELECT id, store_id, number, seats, position_x, position_y, is_active FROM tables WHERE id = $1", id)
	var t models.Table
	if err := row.Scan(&t.ID, &t.StoreID, &t.Number, &t.Seats, &t.Position.X, &t.Position.Y, &t.IsActive); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &t, nil
}

func (r *TableRepository) Update(ctx context.Context, t models.Table) error {
	_, err := r.db.ExecContext(ctx, "UPDATE tables SET number = $1, seats = $2, position_x = $3, position_y = $4 WHERE id = $5",
		t.Number, t.Seats, t.Position.X, t.Position.Y, t.ID)
	return err
}

func (r *TableRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, "DELETE FROM tables WHERE id = $1", id)
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
		SELECT o.id, o.store_id, o.table_id, o.table_number, o.status, o.kitchen_status, o.order_type, o.customer_name, o.customer_mobile, o.special_note,
		       o.total_amount, o.tax_amount, o.discount_amount,
		       o.payment_method, o.payment_status, o.created_by, o.created_at, o.updated_at, o.cancelled_at, o.kot_reissued_at, o.kot_items,
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
		var tableID, method, statusPay, createdBy, orderType, customerName, customerMobile, kitchenStatus, specialNote sql.NullString
		var cancelledAt, kotReissuedAt sql.NullTime
		var itemsBytes, kotItemsBytes []byte
		err := rows.Scan(
			&o.ID, &o.StoreID, &tableID, &o.TableNumber, &o.Status, &kitchenStatus, &orderType, &customerName, &customerMobile, &specialNote,
			&o.TotalAmount, &o.TaxAmount, &o.DiscountAmount,
			&method, &statusPay, &createdBy, &o.CreatedAt, &o.UpdatedAt, &cancelledAt, &kotReissuedAt, &kotItemsBytes,
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
		o.KitchenStatus = kitchenStatus.String
		if o.KitchenStatus == "" {
			o.KitchenStatus = "pending"
		}
		o.SpecialNote = specialNote.String
		if cancelledAt.Valid {
			o.CancelledAt = &cancelledAt.Time
		}
		if kotReissuedAt.Valid {
			o.KotReissuedAt = &kotReissuedAt.Time
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
		if len(kotItemsBytes) > 0 {
			var kotItems []models.OrderItem
			if err := json.Unmarshal(kotItemsBytes, &kotItems); err == nil {
				o.KotItems = kotItems
			}
		}

		orders = append(orders, o)
	}
	return orders, nil
}

func (r *OrderRepository) GetByID(ctx context.Context, orderID string) (*models.Order, error) {
	sqlStr := `
		SELECT o.id, o.store_id, o.table_id, o.table_number, o.status, o.kitchen_status, o.order_type, o.customer_name, o.customer_mobile, o.special_note,
		       o.total_amount, o.tax_amount, o.discount_amount,
		       o.payment_method, o.payment_status, o.created_by, o.created_at, o.updated_at, o.cancelled_at, o.kot_reissued_at, o.kot_items,
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
	var tableID, method, statusPay, createdBy, orderType, customerName, customerMobile, kitchenStatus, specialNote sql.NullString
	var cancelledAt, kotReissuedAt sql.NullTime
	var itemsBytes, kotItemsBytes []byte
	err := row.Scan(
		&o.ID, &o.StoreID, &tableID, &o.TableNumber, &o.Status, &kitchenStatus, &orderType, &customerName, &customerMobile, &specialNote,
		&o.TotalAmount, &o.TaxAmount, &o.DiscountAmount,
		&method, &statusPay, &createdBy, &o.CreatedAt, &o.UpdatedAt, &cancelledAt, &kotReissuedAt, &kotItemsBytes,
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
	o.KitchenStatus = kitchenStatus.String
	if o.KitchenStatus == "" {
		o.KitchenStatus = "pending"
	}
	o.SpecialNote = specialNote.String
	if cancelledAt.Valid {
		o.CancelledAt = &cancelledAt.Time
	}
	if kotReissuedAt.Valid {
		o.KotReissuedAt = &kotReissuedAt.Time
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
	if len(kotItemsBytes) > 0 {
		var kotItems []models.OrderItem
		if err := json.Unmarshal(kotItemsBytes, &kotItems); err == nil {
			o.KotItems = kotItems
		}
	}

	return &o, nil
}

func (r *OrderRepository) Create(ctx context.Context, o models.Order) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	sqlStr := `INSERT INTO orders (id, store_id, table_id, table_number, status, order_type, customer_name, customer_mobile, special_note, kot_items, total_amount, tax_amount, discount_amount, payment_method, created_by)
	           VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`
	var payMethod, orderType, customerName, customerMobile, specialNote, tableID interface{}
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
	if o.SpecialNote != "" {
		specialNote = o.SpecialNote
	}
	if o.TableID != "" {
		tableID = o.TableID
	}

	// kot_items = all items for a new order (the initial KOT)
	kotItemsJSON, _ := json.Marshal(o.Items)
	kotItemsStr := string(kotItemsJSON)

	_, err = tx.ExecContext(ctx, sqlStr,
		o.ID, o.StoreID, tableID, o.TableNumber, orderType, customerName, customerMobile, specialNote, kotItemsStr, o.TotalAmount, o.TaxAmount, o.DiscountAmount, payMethod, o.CreatedBy,
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

// UpdateKitchenStatus updates only the kitchen_status column of an order.
// Valid values: 'pending', 'preparing', 'ready', 'served'.
func (r *OrderRepository) UpdateKitchenStatus(ctx context.Context, id, status string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE orders SET kitchen_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, status, id)
	return err
}

// RecordKitchenTransition records a kitchen status change in the history table.
// It closes the previous open history row (sets exited_at) and opens a new row
// for the incoming status. If the new status already has an open row for this
// order (e.g. re-entering 'pending' after an add-on), it reuses that row.
func (r *OrderRepository) RecordKitchenTransition(ctx context.Context, orderID, storeID, newStatus string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Close any currently-open history row for this order
	if _, err = tx.ExecContext(ctx, `
		UPDATE kitchen_status_history SET exited_at = CURRENT_TIMESTAMP
		WHERE order_id = $1 AND exited_at IS NULL
	`, orderID); err != nil {
		return err
	}

	// Insert a new history row for the incoming status
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO kitchen_status_history (order_id, store_id, status, entered_at)
		VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
	`, orderID, storeID, newStatus); err != nil {
		return err
	}

	return tx.Commit()
}

// GetKitchenHistory returns the full kitchen status history for an order,
// ordered by entry time (oldest first).
func (r *OrderRepository) GetKitchenHistory(ctx context.Context, orderID string) ([]models.KitchenStatusHistory, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, order_id, store_id, status, entered_at, exited_at
		FROM kitchen_status_history
		WHERE order_id = $1
		ORDER BY entered_at ASC
	`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []models.KitchenStatusHistory
	for rows.Next() {
		var h models.KitchenStatusHistory
		var exitedAt sql.NullTime
		if err := rows.Scan(&h.ID, &h.OrderID, &h.StoreID, &h.Status, &h.EnteredAt, &exitedAt); err != nil {
			return nil, err
		}
		if exitedAt.Valid {
			h.ExitedAt = &exitedAt.Time
		}
		history = append(history, h)
	}
	return history, nil
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

// ==========================================
// SMTP CONFIG REPOSITORY
// ==========================================

type SmtpConfigRepository struct {
	db *sql.DB
}

func (r *SmtpConfigRepository) Get(ctx context.Context) (*models.SMTPConfig, error) {
	sqlStr := `
		SELECT key, value
		FROM global_settings
		WHERE key IN ('smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_from', 'smtp_from_name', 'smtp_use_tls')
	`
	rows, err := r.db.QueryContext(ctx, sqlStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	config := &models.SMTPConfig{}
	for rows.Next() {
		var key, val string
		if err := rows.Scan(&key, &val); err != nil {
			return nil, err
		}
		switch key {
		case "smtp_host":
			config.Host = val
		case "smtp_port":
			config.Port, _ = strconv.Atoi(val)
		case "smtp_username":
			config.Username = val
		case "smtp_password":
			config.Password = val
		case "smtp_from":
			config.From = val
		case "smtp_from_name":
			config.FromName = val
		case "smtp_use_tls":
			config.UseTLS = val == "true"
		}
	}
	return config, nil
}

func (r *SmtpConfigRepository) Save(ctx context.Context, req models.SMTPConfigRequest) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	settings := map[string]string{
		"smtp_host":      req.Host,
		"smtp_port":      strconv.Itoa(req.Port),
		"smtp_username":  req.Username,
		"smtp_password":  req.Password,
		"smtp_from":      req.From,
		"smtp_from_name": req.FromName,
	}
	if req.UseTLS {
		settings["smtp_use_tls"] = "true"
	} else {
		settings["smtp_use_tls"] = "false"
	}

	for key, value := range settings {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO global_settings (key, value) VALUES ($1, $2)
			ON CONFLICT (key) DO UPDATE SET value = $2
		`, key, value)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// SetPasswordResetToken stores a reset token for a user (replaces any existing one)
func (r *UserRepository) SetPasswordResetToken(ctx context.Context, userID, token string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO password_reset_tokens (user_id, token, expires_at)
		VALUES ($1, $2, NOW() + INTERVAL '1 hour')
	`, userID, token)
	return err
}

// GetUserIDByResetToken validates a reset token and returns the user ID if valid (also deletes the token)
func (r *UserRepository) GetUserIDByResetToken(ctx context.Context, token string) (string, error) {
	var userID string
	err := r.db.QueryRowContext(ctx, `
		DELETE FROM password_reset_tokens
		WHERE token = $1 AND expires_at > NOW()
		RETURNING user_id
	`, token).Scan(&userID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return userID, nil
}

// GetUserByEmail finds a user by email address
func (r *UserRepository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	sqlStr := `
		SELECT u.id, u.username, u.password, u.name, u.email, u.role, u.store_id, u.is_active, u.created_at,
		       s.name as store_name
		FROM users u
		LEFT JOIN stores s ON u.store_id = s.id
		WHERE u.email = $1 AND u.is_active = true
	`
	row := r.db.QueryRowContext(ctx, sqlStr, email)

	var u models.User
	var emailNull, storeIDNull, storeNameNull sql.NullString
	err := row.Scan(
		&u.ID, &u.Username, &u.Password, &u.Name, &emailNull, &u.Role, &storeIDNull, &u.IsActive, &u.CreatedAt,
		&storeNameNull,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	u.Email = emailNull.String
	u.StoreID = storeIDNull.String
	u.StoreName = storeNameNull.String
	return &u, nil
}

// ==========================================
// INVENTORY ITEM REPOSITORY
// ==========================================

type InventoryRepository struct {
	db    *sql.DB
	redis *RedisCache
}

const inventoryCacheKeyPrefix = "inventory_items:"

func (r *InventoryRepository) invalidateCache(ctx context.Context, storeID string) {
	if r.redis != nil {
		r.redis.DeleteByPrefix(ctx, inventoryCacheKeyPrefix)
	}
}

func (r *InventoryRepository) GetAll(ctx context.Context, storeID string) ([]models.InventoryItem, error) {
	cacheKey := inventoryCacheKeyPrefix + storeID
	if r.redis != nil {
		if raw, ok := r.redis.Get(ctx, cacheKey); ok {
			var cached []models.InventoryItem
			if err := json.Unmarshal(raw, &cached); err == nil {
				return cached, nil
			}
		}
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, store_id, name, description, unit, quantity, reorder_level, unit_cost, is_active, created_at, updated_at
		FROM inventory_items
		WHERE store_id = $1 AND is_active = true
		ORDER BY name
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.InventoryItem
	for rows.Next() {
		var i models.InventoryItem
		var desc sql.NullString
		if err := rows.Scan(
			&i.ID, &i.StoreID, &i.Name, &desc, &i.Unit, &i.Quantity, &i.ReorderLevel, &i.UnitCost, &i.IsActive, &i.CreatedAt, &i.UpdatedAt,
		); err != nil {
			return nil, err
		}
		i.Description = desc.String
		items = append(items, i)
	}

	if r.redis != nil {
		if raw, err := json.Marshal(items); err == nil {
			r.redis.Set(ctx, cacheKey, raw, 30*time.Minute)
		}
	}
	return items, nil
}

func (r *InventoryRepository) GetByID(ctx context.Context, id string) (*models.InventoryItem, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, store_id, name, description, unit, quantity, reorder_level, unit_cost, is_active, created_at, updated_at
		FROM inventory_items
		WHERE id = $1
	`, id)

	var i models.InventoryItem
	var desc sql.NullString
	err := row.Scan(
		&i.ID, &i.StoreID, &i.Name, &desc, &i.Unit, &i.Quantity, &i.ReorderLevel, &i.UnitCost, &i.IsActive, &i.CreatedAt, &i.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	i.Description = desc.String
	return &i, nil
}

func (r *InventoryRepository) Create(ctx context.Context, i models.InventoryItem) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO inventory_items (id, store_id, name, description, unit, quantity, reorder_level, unit_cost)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, i.ID, i.StoreID, i.Name, i.Description, i.Unit, i.Quantity, i.ReorderLevel, i.UnitCost)
	if err == nil {
		r.invalidateCache(ctx, i.StoreID)
	}
	return err
}

func (r *InventoryRepository) Update(ctx context.Context, i models.InventoryItem) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE inventory_items
		SET name = $1, description = $2, unit = $3, quantity = $4, reorder_level = $5, unit_cost = $6, updated_at = CURRENT_TIMESTAMP
		WHERE id = $7
	`, i.Name, i.Description, i.Unit, i.Quantity, i.ReorderLevel, i.UnitCost, i.ID)
	if err == nil {
		r.invalidateCache(ctx, i.StoreID)
	}
	return err
}

func (r *InventoryRepository) Delete(ctx context.Context, id, storeID string) error {
	_, err := r.db.ExecContext(ctx, "UPDATE inventory_items SET is_active = false WHERE id = $1", id)
	if err == nil {
		r.invalidateCache(ctx, storeID)
	}
	return err
}

// AdjustQuantity atomically adds delta (can be negative) to an inventory item's stock.
func (r *InventoryRepository) AdjustQuantity(ctx context.Context, tx *sql.Tx, id string, delta float64) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE inventory_items SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, delta, id)
	return err
}

// UpdateUnitCost updates the unit cost of an inventory item (used when restocking).
func (r *InventoryRepository) UpdateUnitCost(ctx context.Context, tx *sql.Tx, id string, unitCost float64) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE inventory_items SET unit_cost = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, unitCost, id)
	return err
}

// ==========================================
// RECIPE REPOSITORY
// ==========================================

type RecipeRepository struct {
	db    *sql.DB
	redis *RedisCache
}

const recipeCacheKeyPrefix = "recipes:"

func (r *RecipeRepository) invalidateCache(ctx context.Context, storeID string) {
	if r.redis != nil {
		r.redis.DeleteByPrefix(ctx, recipeCacheKeyPrefix)
	}
}

// GetByItem returns the recipe (with ingredients) for a menu item, or nil if none exists.
func (r *RecipeRepository) GetByItem(ctx context.Context, itemID string) (*models.Recipe, error) {
	var rec models.Recipe
	var itemName sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT r.id, r.store_id, r.item_id, r.is_active, r.created_at, i.name
		FROM recipes r
		LEFT JOIN items i ON r.item_id = i.id
		WHERE r.item_id = $1 AND r.is_active = true
	`, itemID).Scan(&rec.ID, &rec.StoreID, &rec.ItemID, &rec.IsActive, &rec.CreatedAt, &itemName)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	rec.ItemName = itemName.String

	ingredients, err := r.getIngredients(ctx, rec.ID)
	if err != nil {
		return nil, err
	}
	rec.Ingredients = ingredients
	return &rec, nil
}

func (r *RecipeRepository) getIngredients(ctx context.Context, recipeID string) ([]models.RecipeIngredient, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT ri.id, ri.store_id, ri.recipe_id, ri.inventory_item_id, inv.name, ri.quantity, ri.unit
		FROM recipe_ingredients ri
		LEFT JOIN inventory_items inv ON ri.inventory_item_id = inv.id
		WHERE ri.recipe_id = $1 AND ri.is_active = true
		ORDER BY inv.name
	`, recipeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ingredients []models.RecipeIngredient
	for rows.Next() {
		var ri models.RecipeIngredient
		var invName sql.NullString
		if err := rows.Scan(&ri.ID, &ri.StoreID, &ri.RecipeID, &ri.InventoryItemID, &invName, &ri.Quantity, &ri.Unit); err != nil {
			return nil, err
		}
		ri.InventoryName = invName.String
		ingredients = append(ingredients, ri)
	}
	if ingredients == nil {
		ingredients = []models.RecipeIngredient{}
	}
	return ingredients, nil
}

// GetAllForStore returns all recipes (with ingredients) for a store.
func (r *RecipeRepository) GetAllForStore(ctx context.Context, storeID string) ([]models.Recipe, error) {
	cacheKey := recipeCacheKeyPrefix + storeID
	if r.redis != nil {
		if raw, ok := r.redis.Get(ctx, cacheKey); ok {
			var cached []models.Recipe
			if err := json.Unmarshal(raw, &cached); err == nil {
				return cached, nil
			}
		}
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT r.id, r.store_id, r.item_id, r.is_active, r.created_at, i.name
		FROM recipes r
		LEFT JOIN items i ON r.item_id = i.id
		WHERE r.store_id = $1 AND r.is_active = true
		ORDER BY i.name
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recipes []models.Recipe
	for rows.Next() {
		var rec models.Recipe
		var itemName sql.NullString
		if err := rows.Scan(&rec.ID, &rec.StoreID, &rec.ItemID, &rec.IsActive, &rec.CreatedAt, &itemName); err != nil {
			return nil, err
		}
		rec.ItemName = itemName.String
		ingredients, err := r.getIngredients(ctx, rec.ID)
		if err != nil {
			return nil, err
		}
		rec.Ingredients = ingredients
		recipes = append(recipes, rec)
	}

	if r.redis != nil {
		if raw, err := json.Marshal(recipes); err == nil {
			r.redis.Set(ctx, cacheKey, raw, 30*time.Minute)
		}
	}
	return recipes, nil
}

// Upsert creates or replaces the recipe (and its ingredients) for a menu item within a transaction.
func (r *RecipeRepository) Upsert(ctx context.Context, storeID, itemID string, ingredients []models.RecipeIngredient) (*models.Recipe, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Find existing active recipe for this item
	var recipeID string
	err = tx.QueryRowContext(ctx, `
		SELECT id FROM recipes WHERE item_id = $1 AND is_active = true
	`, itemID).Scan(&recipeID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	if recipeID == "" {
		recipeID = uuid.New().String()
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO recipes (id, store_id, item_id) VALUES ($1, $2, $3)
		`, recipeID, storeID, itemID); err != nil {
			return nil, err
		}
	} else {
		// Soft-delete existing ingredients, then we re-insert fresh ones
		if _, err = tx.ExecContext(ctx, `
			UPDATE recipe_ingredients SET is_active = false WHERE recipe_id = $1
		`, recipeID); err != nil {
			return nil, err
		}
	}

	for _, ing := range ingredients {
		ingID := uuid.New().String()
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO recipe_ingredients (id, store_id, recipe_id, inventory_item_id, quantity, unit)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, ingID, storeID, recipeID, ing.InventoryItemID, ing.Quantity, ing.Unit); err != nil {
			return nil, err
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, err
	}

	r.invalidateCache(ctx, storeID)
	return r.GetByItem(ctx, itemID)
}

// Delete soft-deletes a recipe and its ingredients.
func (r *RecipeRepository) Delete(ctx context.Context, id, storeID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, "UPDATE recipe_ingredients SET is_active = false WHERE recipe_id = $1", id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE recipes SET is_active = false WHERE id = $1", id); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	r.invalidateCache(ctx, storeID)
	return nil
}

// ==========================================
// PURCHASE REPOSITORY
// ==========================================

type PurchaseRepository struct {
	db    *sql.DB
	redis *RedisCache
}

const purchaseCacheKeyPrefix = "purchases:"

func (r *PurchaseRepository) invalidateCache(ctx context.Context, storeID string) {
	if r.redis != nil {
		r.redis.DeleteByPrefix(ctx, purchaseCacheKeyPrefix)
		r.redis.DeleteByPrefix(ctx, inventoryCacheKeyPrefix)
	}
}

func (r *PurchaseRepository) GetAll(ctx context.Context, storeID string) ([]models.Purchase, error) {
	cacheKey := purchaseCacheKeyPrefix + storeID
	if r.redis != nil {
		if raw, ok := r.redis.Get(ctx, cacheKey); ok {
			var cached []models.Purchase
			if err := json.Unmarshal(raw, &cached); err == nil {
				return cached, nil
			}
		}
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, store_id, vendor, purchase_date, total_amount, payment_method, receipt_number, notes,
		       is_active, created_at, created_by
		FROM purchases
		WHERE store_id = $1 AND is_active = true
		ORDER BY purchase_date DESC, created_at DESC
	`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var purchases []models.Purchase
	for rows.Next() {
		var p models.Purchase
		var vendor, paymentMethod, receiptNumber, notes, createdBy sql.NullString
		if err := rows.Scan(
			&p.ID, &p.StoreID, &vendor, &p.PurchaseDate, &p.TotalAmount, &paymentMethod, &receiptNumber, &notes,
			&p.IsActive, &p.CreatedAt, &createdBy,
		); err != nil {
			return nil, err
		}
		p.Vendor = vendor.String
		p.PaymentMethod = paymentMethod.String
		p.ReceiptNumber = receiptNumber.String
		p.Notes = notes.String
		p.CreatedBy = createdBy.String

		items, err := r.getItems(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		p.Items = items
		purchases = append(purchases, p)
	}

	if r.redis != nil {
		if raw, err := json.Marshal(purchases); err == nil {
			r.redis.Set(ctx, cacheKey, raw, 30*time.Minute)
		}
	}
	return purchases, nil
}

func (r *PurchaseRepository) GetByID(ctx context.Context, id string) (*models.Purchase, error) {
	var p models.Purchase
	var vendor, paymentMethod, receiptNumber, notes, createdBy sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT id, store_id, vendor, purchase_date, total_amount, payment_method, receipt_number, notes,
		       is_active, created_at, created_by
		FROM purchases
		WHERE id = $1
	`, id).Scan(
		&p.ID, &p.StoreID, &vendor, &p.PurchaseDate, &p.TotalAmount, &paymentMethod, &receiptNumber, &notes,
		&p.IsActive, &p.CreatedAt, &createdBy,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	p.Vendor = vendor.String
	p.PaymentMethod = paymentMethod.String
	p.ReceiptNumber = receiptNumber.String
	p.Notes = notes.String
	p.CreatedBy = createdBy.String

	items, err := r.getItems(ctx, p.ID)
	if err != nil {
		return nil, err
	}
	p.Items = items
	return &p, nil
}

func (r *PurchaseRepository) getItems(ctx context.Context, purchaseID string) ([]models.PurchaseItem, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT pi.id, pi.store_id, pi.purchase_id, pi.inventory_item_id, inv.name, pi.quantity, pi.unit_price, pi.total
		FROM purchase_items pi
		LEFT JOIN inventory_items inv ON pi.inventory_item_id = inv.id
		WHERE pi.purchase_id = $1 AND pi.is_active = true
		ORDER BY inv.name
	`, purchaseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.PurchaseItem
	for rows.Next() {
		var pi models.PurchaseItem
		var invName sql.NullString
		if err := rows.Scan(&pi.ID, &pi.StoreID, &pi.PurchaseID, &pi.InventoryItemID, &invName, &pi.Quantity, &pi.UnitPrice, &pi.Total); err != nil {
			return nil, err
		}
		pi.InventoryName = invName.String
		items = append(items, pi)
	}
	if items == nil {
		items = []models.PurchaseItem{}
	}
	return items, nil
}

// Create inserts a purchase with its line items and adjusts inventory stock + unit cost in a transaction.
func (r *PurchaseRepository) Create(ctx context.Context, p models.Purchase) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err = tx.ExecContext(ctx, `
		INSERT INTO purchases (id, store_id, vendor, purchase_date, total_amount, payment_method, receipt_number, notes, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, p.ID, p.StoreID, p.Vendor, p.PurchaseDate, p.TotalAmount, p.PaymentMethod, p.ReceiptNumber, p.Notes, nullableString(p.CreatedBy)); err != nil {
		return err
	}

	for _, item := range p.Items {
		itemID := uuid.New().String()
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO purchase_items (id, store_id, purchase_id, inventory_item_id, quantity, unit_price, total)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, itemID, p.StoreID, p.ID, item.InventoryItemID, item.Quantity, item.UnitPrice, item.Total); err != nil {
			return err
		}
		// Increase stock
		if _, err = tx.ExecContext(ctx, `
			UPDATE inventory_items SET quantity = quantity + $1, unit_cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3
		`, item.Quantity, item.UnitPrice, item.InventoryItemID); err != nil {
			return err
		}
	}

	if err = tx.Commit(); err != nil {
		return err
	}
	r.invalidateCache(ctx, p.StoreID)
	return nil
}

// Update replaces a purchase's line items. To keep stock accounting correct, it reverses the
// previous stock changes and applies the new ones.
func (r *PurchaseRepository) Update(ctx context.Context, id string, p models.Purchase) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Reverse previous line items' stock additions
	prevItems, err := r.getItems(ctx, id)
	if err != nil {
		return err
	}
	for _, item := range prevItems {
		if _, err = tx.ExecContext(ctx, `
			UPDATE inventory_items SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
		`, item.Quantity, item.InventoryItemID); err != nil {
			return err
		}
	}

	// Soft-delete previous line items
	if _, err = tx.ExecContext(ctx, "UPDATE purchase_items SET is_active = false WHERE purchase_id = $1", id); err != nil {
		return err
	}

	// Update purchase header
	if _, err = tx.ExecContext(ctx, `
		UPDATE purchases SET vendor = $1, purchase_date = $2, total_amount = $3, payment_method = $4,
		                     receipt_number = $5, notes = $6
		WHERE id = $7
	`, p.Vendor, p.PurchaseDate, p.TotalAmount, p.PaymentMethod, p.ReceiptNumber, p.Notes, id); err != nil {
		return err
	}

	// Insert new line items and apply stock additions
	for _, item := range p.Items {
		itemID := uuid.New().String()
		if _, err = tx.ExecContext(ctx, `
			INSERT INTO purchase_items (id, store_id, purchase_id, inventory_item_id, quantity, unit_price, total)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, itemID, p.StoreID, id, item.InventoryItemID, item.Quantity, item.UnitPrice, item.Total); err != nil {
			return err
		}
		if _, err = tx.ExecContext(ctx, `
			UPDATE inventory_items SET quantity = quantity + $1, unit_cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3
		`, item.Quantity, item.UnitPrice, item.InventoryItemID); err != nil {
			return err
		}
	}

	if err = tx.Commit(); err != nil {
		return err
	}
	r.invalidateCache(ctx, p.StoreID)
	return nil
}

// Delete soft-deletes a purchase and reverses its stock additions.
func (r *PurchaseRepository) Delete(ctx context.Context, id, storeID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	items, err := r.getItems(ctx, id)
	if err != nil {
		return err
	}
	for _, item := range items {
		if _, err = tx.ExecContext(ctx, `
			UPDATE inventory_items SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
		`, item.Quantity, item.InventoryItemID); err != nil {
			return err
		}
	}

	if _, err = tx.ExecContext(ctx, "UPDATE purchase_items SET is_active = false WHERE purchase_id = $1", id); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE purchases SET is_active = false WHERE id = $1", id); err != nil {
		return err
	}

	if err = tx.Commit(); err != nil {
		return err
	}
	r.invalidateCache(ctx, storeID)
	return nil
}

// nullableString returns a driver.Value that is nil for empty strings.
func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
