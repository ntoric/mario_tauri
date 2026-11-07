package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"cafe-backend/internal/models"

	"github.com/google/uuid"
)

// ==========================================
// INVENTORY (RAW MATERIALS) REPOSITORY
// ==========================================
//
// Stock model: raw_material_transactions is the source of truth — a signed
// ledger per material ('purchase'/'adjustment' can add, 'usage'/'wastage'
// subtract). raw_materials.current_stock and each row's stock_after are
// recomputed inside the same DB transaction whenever the ledger changes, so
// purchase edits/deletes and transaction deletes keep the balance correct.

type InventoryRepository struct {
	db    *sql.DB
	redis *RedisCache
}

// invalidateItemCostCache drops cached item lists/reports after a recipe or
// material-cost change, since item profit derives from recipe lines now.
func (r *InventoryRepository) invalidateItemCostCache(ctx context.Context, storeID string) {
	if r.redis != nil {
		r.redis.Delete(ctx, itemsCacheKey(storeID, false))
		r.redis.Delete(ctx, itemsCacheKey(storeID, true))
		r.redis.Delete(ctx, "items:"+storeID)
	}
}

// lockMaterial serializes stock mutations for a material inside a tx.
func (r *InventoryRepository) lockMaterial(ctx context.Context, tx *sql.Tx, materialID string) error {
	var id string
	return tx.QueryRowContext(ctx,
		"SELECT id FROM raw_materials WHERE id = $1 FOR UPDATE", materialID).Scan(&id)
}

// recomputeMaterial rewrites stock_after for the material's active ledger rows
// and syncs raw_materials.current_stock to the ledger sum.
func (r *InventoryRepository) recomputeMaterial(ctx context.Context, tx *sql.Tx, materialID string) error {
	if _, err := tx.ExecContext(ctx, `
		UPDATE raw_material_transactions t
		SET stock_after = sub.balance
		FROM (
			SELECT id, SUM(quantity) OVER (ORDER BY transaction_date, created_at, id) AS balance
			FROM raw_material_transactions
			WHERE material_id = $1 AND is_active = true
		) sub
		WHERE t.id = sub.id`, materialID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
		UPDATE raw_materials
		SET current_stock = COALESCE((
			SELECT SUM(quantity) FROM raw_material_transactions
			WHERE material_id = $1 AND is_active = true), 0),
			avg_cost = COALESCE((
			SELECT SUM(p.total_cost) / NULLIF(SUM(p.quantity), 0)
			FROM raw_material_purchases p
			WHERE p.material_id = $1 AND p.is_active = true), 0),
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $1`, materialID)
	return err
}

// ---------- Materials ----------

func (r *InventoryRepository) GetMaterials(ctx context.Context, storeID string) ([]models.RawMaterial, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, store_id, name, unit, description, current_stock, min_stock,
		       avg_cost, is_active, created_at, updated_at, created_by
		FROM raw_materials
		WHERE store_id = $1 AND is_active = true
		ORDER BY name`, storeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var materials []models.RawMaterial
	for rows.Next() {
		var m models.RawMaterial
		var desc, createdBy sql.NullString
		if err := rows.Scan(&m.ID, &m.StoreID, &m.Name, &m.Unit, &desc,
			&m.CurrentStock, &m.MinStock, &m.AvgCost, &m.IsActive, &m.CreatedAt, &m.UpdatedAt, &createdBy); err != nil {
			return nil, err
		}
		m.Description = desc.String
		m.CreatedBy = createdBy.String
		materials = append(materials, m)
	}
	return materials, nil
}

func (r *InventoryRepository) GetMaterialByID(ctx context.Context, id string) (*models.RawMaterial, error) {
	var m models.RawMaterial
	var desc, createdBy sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT id, store_id, name, unit, description, current_stock, min_stock,
		       avg_cost, is_active, created_at, updated_at, created_by
		FROM raw_materials WHERE id = $1`, id).Scan(
		&m.ID, &m.StoreID, &m.Name, &m.Unit, &desc,
		&m.CurrentStock, &m.MinStock, &m.AvgCost, &m.IsActive, &m.CreatedAt, &m.UpdatedAt, &createdBy)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	m.Description = desc.String
	m.CreatedBy = createdBy.String
	return &m, nil
}

func (r *InventoryRepository) CreateMaterial(ctx context.Context, m models.RawMaterial, openingTxn *models.RawMaterialTransaction) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var createdBy interface{}
	if m.CreatedBy != "" {
		createdBy = m.CreatedBy
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO raw_materials (id, store_id, name, unit, description, min_stock, avg_cost, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		m.ID, m.StoreID, m.Name, m.Unit, m.Description, m.MinStock, m.AvgCost, createdBy); err != nil {
		return err
	}

	if openingTxn != nil && openingTxn.Quantity != 0 {
		if err := r.insertTransaction(ctx, tx, *openingTxn); err != nil {
			return err
		}
		if err := r.recomputeMaterial(ctx, tx, m.ID); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *InventoryRepository) UpdateMaterial(ctx context.Context, m models.RawMaterial) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE raw_materials SET name = $1, unit = $2, description = $3, min_stock = $4, avg_cost = $5,
			modified_by = $6, updated_at = CURRENT_TIMESTAMP
		WHERE id = $7`,
		m.Name, m.Unit, m.Description, m.MinStock, m.AvgCost, m.ModifiedBy, m.ID)
	return err
}

func (r *InventoryRepository) DeleteMaterial(ctx context.Context, id, modifiedBy string) error {
	_, err := r.db.ExecContext(ctx,
		"UPDATE raw_materials SET is_active = false, modified_by = $2 WHERE id = $1", id, modifiedBy)
	return err
}

// ---------- Ledger helpers ----------

func (r *InventoryRepository) insertTransaction(ctx context.Context, tx *sql.Tx, t models.RawMaterialTransaction) error {
	var referenceID, createdBy, itemID interface{}
	if t.ReferenceID != "" {
		referenceID = t.ReferenceID
	}
	if t.CreatedBy != "" {
		createdBy = t.CreatedBy
	}
	if t.ItemID != "" {
		itemID = t.ItemID
	}
	// Snapshot the material's current average cost when the caller didn't
	// supply one, so stock-out rows carry a valuation.
	if t.UnitCost == 0 {
		_ = tx.QueryRowContext(ctx,
			"SELECT COALESCE(avg_cost, 0) FROM raw_materials WHERE id = $1",
			t.MaterialID).Scan(&t.UnitCost)
	}
	_, err := tx.ExecContext(ctx, `
		INSERT INTO raw_material_transactions
			(id, store_id, material_id, type, quantity, reference_id, item_id, unit_cost, notes, transaction_date, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		t.ID, t.StoreID, t.MaterialID, t.Type, t.Quantity, referenceID, itemID, t.UnitCost, t.Notes, t.TransactionDate, createdBy)
	return err
}

// ---------- Purchases (batches) ----------

// allocateStockOut drains a material's purchase batches oldest-first (FIFO),
// reducing remaining_qty by the given positive amount. Unbatched stock
// (opening/adjustments) simply isn't attributed to a batch.
func (r *InventoryRepository) allocateStockOut(ctx context.Context, tx *sql.Tx, materialID string, amount float64) error {
	if amount <= 0 {
		return nil
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT id, remaining_qty FROM raw_material_purchases
		WHERE material_id = $1 AND is_active = true AND remaining_qty > 0
		ORDER BY expiry_date NULLS LAST, purchase_date, created_at, id FOR UPDATE`, materialID)
	if err != nil {
		return err
	}
	var ids []string
	var rems []float64
	for rows.Next() {
		var id string
		var rem float64
		if err := rows.Scan(&id, &rem); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
		rems = append(rems, rem)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	left := amount
	for i, id := range ids {
		if left <= 0 {
			break
		}
		take := rems[i]
		if take > left {
			take = left
		}
		if _, err := tx.ExecContext(ctx,
			"UPDATE raw_material_purchases SET remaining_qty = remaining_qty - $1 WHERE id = $2", take, id); err != nil {
			return err
		}
		left -= take
	}
	return nil
}

// refundStockOut restores remaining_qty to batches newest-first — the
// approximate mirror of allocateStockOut used when a stock-out is reversed.
func (r *InventoryRepository) refundStockOut(ctx context.Context, tx *sql.Tx, materialID string, amount float64) error {
	if amount <= 0 {
		return nil
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT id, quantity, remaining_qty FROM raw_material_purchases
		WHERE material_id = $1 AND is_active = true AND remaining_qty < quantity
		ORDER BY purchase_date DESC, created_at DESC, id DESC FOR UPDATE`, materialID)
	if err != nil {
		return err
	}
	var ids []string
	var gaps []float64
	for rows.Next() {
		var id string
		var q, rem float64
		if err := rows.Scan(&id, &q, &rem); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
		gaps = append(gaps, q-rem)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	left := amount
	for i, id := range ids {
		if left <= 0 {
			break
		}
		put := gaps[i]
		if put > left {
			put = left
		}
		if _, err := tx.ExecContext(ctx,
			"UPDATE raw_material_purchases SET remaining_qty = remaining_qty + $1 WHERE id = $2", put, id); err != nil {
			return err
		}
		left -= put
	}
	return nil
}

func (r *InventoryRepository) GetPurchases(ctx context.Context, storeID, materialID, startDate, endDate string) ([]models.RawMaterialPurchase, error) {
	sqlStr := `
		SELECT p.id, p.store_id, p.material_id, m.name, m.unit, p.quantity, p.unit_cost,
		       p.total_cost, p.vendor, p.invoice_number, p.purchase_date, p.payment_method,
		       p.notes, p.is_active, p.created_at, p.updated_at, p.created_by, p.remaining_qty, p.expiry_date
		FROM raw_material_purchases p
		LEFT JOIN raw_materials m ON p.material_id = m.id
		WHERE p.store_id = $1 AND p.is_active = true`
	args := []interface{}{storeID}
	idx := 2
	if materialID != "" {
		sqlStr += fmt.Sprintf(" AND p.material_id = $%d", idx)
		args = append(args, materialID)
		idx++
	}
	if startDate != "" {
		sqlStr += fmt.Sprintf(" AND p.purchase_date >= $%d", idx)
		args = append(args, startDate)
		idx++
	}
	if endDate != "" {
		sqlStr += fmt.Sprintf(" AND p.purchase_date <= $%d", idx)
		args = append(args, endDate)
		idx++
	}
	sqlStr += " ORDER BY p.purchase_date DESC, p.created_at DESC"

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var purchases []models.RawMaterialPurchase
	for rows.Next() {
		var p models.RawMaterialPurchase
		var matName, matUnit, vendor, invoiceNo, paymentMethod, notes, createdBy sql.NullString
		var remQty sql.NullFloat64
		var expiry sql.NullString
		if err := rows.Scan(&p.ID, &p.StoreID, &p.MaterialID, &matName, &matUnit,
			&p.Quantity, &p.UnitCost, &p.TotalCost, &vendor, &invoiceNo, &p.PurchaseDate,
			&paymentMethod, &notes, &p.IsActive, &p.CreatedAt, &p.UpdatedAt, &createdBy, &remQty, &expiry); err != nil {
			return nil, err
		}
		p.RemainingQty = remQty.Float64
		p.ExpiryDate = expiry.String
		p.MaterialName = matName.String
		p.MaterialUnit = matUnit.String
		p.Vendor = vendor.String
		p.InvoiceNumber = invoiceNo.String
		p.PaymentMethod = paymentMethod.String
		p.Notes = notes.String
		p.CreatedBy = createdBy.String
		purchases = append(purchases, p)
	}
	return purchases, nil
}

func (r *InventoryRepository) GetPurchaseByID(ctx context.Context, id string) (*models.RawMaterialPurchase, error) {
	var p models.RawMaterialPurchase
	var vendor, invoiceNo, paymentMethod, notes, createdBy sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT id, store_id, material_id, quantity, unit_cost, total_cost, vendor,
		       invoice_number, purchase_date, payment_method, notes, is_active,
		       created_at, updated_at, created_by
		FROM raw_material_purchases WHERE id = $1`, id).Scan(
		&p.ID, &p.StoreID, &p.MaterialID, &p.Quantity, &p.UnitCost, &p.TotalCost,
		&vendor, &invoiceNo, &p.PurchaseDate, &paymentMethod, &notes, &p.IsActive,
		&p.CreatedAt, &p.UpdatedAt, &createdBy)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	p.Vendor = vendor.String
	p.InvoiceNumber = invoiceNo.String
	p.PaymentMethod = paymentMethod.String
	p.Notes = notes.String
	p.CreatedBy = createdBy.String
	return &p, nil
}

// CreatePurchase inserts the purchase plus its 'purchase' ledger entry and
// recomputes the material balance, atomically.
func (r *InventoryRepository) CreatePurchase(ctx context.Context, p models.RawMaterialPurchase, txn models.RawMaterialTransaction) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := r.lockMaterial(ctx, tx, p.MaterialID); err != nil {
		return err
	}

	var vendor, invoiceNo, paymentMethod, notes, createdBy interface{}
	if p.Vendor != "" {
		vendor = p.Vendor
	}
	if p.InvoiceNumber != "" {
		invoiceNo = p.InvoiceNumber
	}
	if p.PaymentMethod != "" {
		paymentMethod = p.PaymentMethod
	}
	if p.Notes != "" {
		notes = p.Notes
	}
	if p.CreatedBy != "" {
		createdBy = p.CreatedBy
	}

	// Same-price buys merge into the oldest open batch; a different unit
	// cost starts a new batch.
	var batchID string
	var expiryDate interface{}
	if p.ExpiryDate != "" {
		expiryDate = p.ExpiryDate
	}
	err = tx.QueryRowContext(ctx, `
		SELECT id FROM raw_material_purchases
		WHERE material_id = $1 AND unit_cost = $2 AND expiry_date IS NOT DISTINCT FROM $3
		  AND is_active = true AND remaining_qty > 0
		ORDER BY purchase_date, created_at, id LIMIT 1`,
		p.MaterialID, p.UnitCost, expiryDate).Scan(&batchID)
	if err == nil {
		if _, err := tx.ExecContext(ctx, `
			UPDATE raw_material_purchases
			SET quantity = quantity + $1, total_cost = total_cost + $2,
			    remaining_qty = remaining_qty + $1,
			    vendor = COALESCE($3, vendor), invoice_number = COALESCE($4, invoice_number),
			    payment_method = COALESCE($5, payment_method),
			    modified_by = $6, updated_at = CURRENT_TIMESTAMP
			WHERE id = $7`,
			p.Quantity, p.TotalCost, vendor, invoiceNo, paymentMethod, createdBy, batchID); err != nil {
			return err
		}
		p.ID = batchID
	} else {
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO raw_material_purchases
				(id, store_id, material_id, quantity, unit_cost, total_cost, vendor,
				 invoice_number, purchase_date, payment_method, notes, created_by, remaining_qty)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $4)`,
			p.ID, p.StoreID, p.MaterialID, p.Quantity, p.UnitCost, p.TotalCost,
			vendor, invoiceNo, p.PurchaseDate, paymentMethod, notes, createdBy); err != nil {
			return err
		}
	}

	txn.ReferenceID = p.ID
	if txn.UnitCost == 0 {
		txn.UnitCost = p.UnitCost
	}
	if err := r.insertTransaction(ctx, tx, txn); err != nil {
		return err
	}
	if err := r.recomputeMaterial(ctx, tx, p.MaterialID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	r.invalidateItemCostCache(ctx, p.StoreID)
	return nil
}

// UpdatePurchase updates the purchase row and keeps the linked ledger entry in
// sync (quantity, material, date). Recomputes both materials when the purchase
// is moved to a different material.
func (r *InventoryRepository) UpdatePurchase(ctx context.Context, p models.RawMaterialPurchase, oldMaterialID string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := r.lockMaterial(ctx, tx, oldMaterialID); err != nil {
		return err
	}
	if p.MaterialID != oldMaterialID {
		if err := r.lockMaterial(ctx, tx, p.MaterialID); err != nil {
			return err
		}
	}

	var vendor, invoiceNo, paymentMethod, notes interface{}
	if p.Vendor != "" {
		vendor = p.Vendor
	}
	if p.InvoiceNumber != "" {
		invoiceNo = p.InvoiceNumber
	}
	if p.PaymentMethod != "" {
		paymentMethod = p.PaymentMethod
	}
	if p.Notes != "" {
		notes = p.Notes
	}
	if p.Quantity != 0 {
		// Shift remaining_qty by the quantity delta on the same batch.
		var oldQty float64
		if err := tx.QueryRowContext(ctx, "SELECT quantity FROM raw_material_purchases WHERE id = $1", p.ID).Scan(&oldQty); err == nil {
			if _, err := tx.ExecContext(ctx, `
				UPDATE raw_material_purchases SET remaining_qty = GREATEST(0, remaining_qty + ($1 - $2)) WHERE id = $3`,
				p.Quantity, oldQty, p.ID); err != nil {
				return err
			}
		}
	}
	var expiryUpd interface{}
	if p.ExpiryDate != "" {
		expiryUpd = p.ExpiryDate
	}
	res, err := tx.ExecContext(ctx, `
		UPDATE raw_material_purchases
		SET material_id = $1, quantity = $2, unit_cost = $3, total_cost = $4,
		    vendor = $5, invoice_number = $6, purchase_date = $7,
		    payment_method = $8, notes = $9, modified_by = $10,
		    expiry_date = $12, updated_at = CURRENT_TIMESTAMP
		WHERE id = $11`,
		p.MaterialID, p.Quantity, p.UnitCost, p.TotalCost, vendor, invoiceNo,
		p.PurchaseDate, paymentMethod, notes, p.ModifiedBy, p.ID, expiryUpd)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE raw_material_transactions
		SET material_id = $1, quantity = $2, transaction_date = $3
		WHERE reference_id = $4 AND type = 'purchase' AND is_active = true`,
		p.MaterialID, p.Quantity, p.PurchaseDate, p.ID); err != nil {
		return err
	}

	if err := r.recomputeMaterial(ctx, tx, p.MaterialID); err != nil {
		return err
	}
	if p.MaterialID != oldMaterialID {
		if err := r.recomputeMaterial(ctx, tx, oldMaterialID); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	r.invalidateItemCostCache(ctx, p.StoreID)
	return nil
}

// DeletePurchase soft-deletes the purchase and its linked ledger entry, then
// recomputes the material balance.
func (r *InventoryRepository) DeletePurchase(ctx context.Context, id, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var materialID, purchaseStoreID string
	if err := tx.QueryRowContext(ctx,
		"SELECT material_id, store_id FROM raw_material_purchases WHERE id = $1", id).Scan(&materialID, &purchaseStoreID); err != nil {
		return err
	}
	if err := r.lockMaterial(ctx, tx, materialID); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		"UPDATE raw_material_purchases SET is_active = false, modified_by = $2 WHERE id = $1",
		id, modifiedBy); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		"UPDATE raw_material_transactions SET is_active = false WHERE reference_id = $1 AND type = 'purchase'",
		id); err != nil {
		return err
	}
	if err := r.recomputeMaterial(ctx, tx, materialID); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	r.invalidateItemCostCache(ctx, purchaseStoreID)
	return nil
}

// ---------- Transactions (usage / wastage / adjustment) ----------

const txnSelectSQL = `
	SELECT t.id, t.store_id, t.material_id, m.name, m.unit, t.type, t.quantity,
	       t.stock_after, t.reference_id, t.item_id, i.name, t.unit_cost,
	       t.notes, t.transaction_date, t.is_active, t.created_at, t.created_by
	FROM raw_material_transactions t
	LEFT JOIN raw_materials m ON t.material_id = m.id
	LEFT JOIN items i ON i.id = t.item_id`

// txnFilterSQL builds the shared WHERE clause for transaction listing.
// args[0] is always the store id; additional placeholders continue from $2.
func txnFilterSQL(storeID, materialID, txnType, startDate, endDate string) (string, []interface{}) {
	where := "WHERE t.store_id = $1 AND t.is_active = true"
	args := []interface{}{storeID}
	idx := 2
	if materialID != "" {
		where += fmt.Sprintf(" AND t.material_id = $%d", idx)
		args = append(args, materialID)
		idx++
	}
	if txnType != "" {
		where += fmt.Sprintf(" AND t.type = $%d", idx)
		args = append(args, txnType)
		idx++
	}
	if startDate != "" {
		where += fmt.Sprintf(" AND t.transaction_date >= $%d", idx)
		args = append(args, startDate)
		idx++
	}
	if endDate != "" {
		where += fmt.Sprintf(" AND t.transaction_date <= $%d", idx)
		args = append(args, endDate)
		idx++
	}
	return where, args
}

func scanTransactions(rows *sql.Rows) ([]models.RawMaterialTransaction, error) {
	var txns []models.RawMaterialTransaction
	for rows.Next() {
		var t models.RawMaterialTransaction
		var matName, matUnit, referenceID, itemID, itemName, notes, createdBy sql.NullString
		var stockAfter, unitCost sql.NullFloat64
		if err := rows.Scan(&t.ID, &t.StoreID, &t.MaterialID, &matName, &matUnit,
			&t.Type, &t.Quantity, &stockAfter, &referenceID, &itemID, &itemName, &unitCost, &notes,
			&t.TransactionDate, &t.IsActive, &t.CreatedAt, &createdBy); err != nil {
			return nil, err
		}
		t.MaterialName = matName.String
		t.MaterialUnit = matUnit.String
		t.StockAfter = stockAfter.Float64
		t.ReferenceID = referenceID.String
		t.ItemID = itemID.String
		t.ItemName = itemName.String
		t.UnitCost = unitCost.Float64
		t.Notes = notes.String
		t.CreatedBy = createdBy.String
		txns = append(txns, t)
	}
	return txns, nil
}

func (r *InventoryRepository) GetTransactions(ctx context.Context, storeID, materialID, txnType, startDate, endDate string) ([]models.RawMaterialTransaction, error) {
	where, args := txnFilterSQL(storeID, materialID, txnType, startDate, endDate)
	sqlStr := txnSelectSQL + " " + where + " ORDER BY t.transaction_date DESC, t.created_at DESC"

	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTransactions(rows)
}

// GetTransactionsPaginated returns one page of the ledger plus the total row
// count for the same filters, so the UI can page server-side.
func (r *InventoryRepository) GetTransactionsPaginated(ctx context.Context, storeID, materialID, txnType, startDate, endDate string, page, limit int) ([]models.RawMaterialTransaction, int, error) {
	where, args := txnFilterSQL(storeID, materialID, txnType, startDate, endDate)

	var total int
	if err := r.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM raw_material_transactions t "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	sqlStr := txnSelectSQL + " " + where +
		fmt.Sprintf(" ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)
	pageArgs := append(append([]interface{}{}, args...), limit, (page-1)*limit)

	rows, err := r.db.QueryContext(ctx, sqlStr, pageArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	txns, err := scanTransactions(rows)
	if err != nil {
		return nil, 0, err
	}
	return txns, total, nil
}

// GetTransactionByID returns a single ledger row (used by the delete handler
// to block removal of purchase-derived entries).
func (r *InventoryRepository) GetTransactionByID(ctx context.Context, id string) (*models.RawMaterialTransaction, error) {
	var t models.RawMaterialTransaction
	var referenceID, notes, createdBy sql.NullString
	var stockAfter sql.NullFloat64
	err := r.db.QueryRowContext(ctx, `
		SELECT id, store_id, material_id, type, quantity, stock_after, reference_id,
		       notes, transaction_date, is_active, created_at, created_by
		FROM raw_material_transactions WHERE id = $1`, id).Scan(
		&t.ID, &t.StoreID, &t.MaterialID, &t.Type, &t.Quantity, &stockAfter,
		&referenceID, &notes, &t.TransactionDate, &t.IsActive, &t.CreatedAt, &createdBy)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	t.StockAfter = stockAfter.Float64
	t.ReferenceID = referenceID.String
	t.Notes = notes.String
	t.CreatedBy = createdBy.String
	return &t, nil
}

// CreateTransaction inserts a manual ledger row and recomputes the material.
func (r *InventoryRepository) CreateTransaction(ctx context.Context, t models.RawMaterialTransaction) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := r.lockMaterial(ctx, tx, t.MaterialID); err != nil {
		return err
	}
	if err := r.insertTransaction(ctx, tx, t); err != nil {
		return err
	}
	if t.Quantity < 0 {
		if err := r.allocateStockOut(ctx, tx, t.MaterialID, -t.Quantity); err != nil {
			return err
		}
	}
	if err := r.recomputeMaterial(ctx, tx, t.MaterialID); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteTransaction soft-deletes a manual ledger row and recomputes the
// material balance.
func (r *InventoryRepository) DeleteTransaction(ctx context.Context, id, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var materialID string
	var delQty float64
	if err := tx.QueryRowContext(ctx,
		"SELECT material_id, quantity FROM raw_material_transactions WHERE id = $1", id).Scan(&materialID, &delQty); err != nil {
		return err
	}
	if err := r.lockMaterial(ctx, tx, materialID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		"UPDATE raw_material_transactions SET is_active = false, modified_by = $2 WHERE id = $1",
		id, modifiedBy); err != nil {
		return err
	}
	if err := r.recomputeMaterial(ctx, tx, materialID); err != nil {
		return err
	}
	return tx.Commit()
}

// ---------- Purchase cost report ----------

func (r *InventoryRepository) GetPurchaseReport(ctx context.Context, storeID, startDate, endDate string) (*models.RawMaterialPurchaseReport, error) {
	args := []interface{}{storeID}
	filter := ""
	idx := 2
	if startDate != "" {
		filter += fmt.Sprintf(" AND p.purchase_date >= $%d", idx)
		args = append(args, startDate)
		idx++
	}
	if endDate != "" {
		filter += fmt.Sprintf(" AND p.purchase_date <= $%d", idx)
		args = append(args, endDate)
		idx++
	}

	report := &models.RawMaterialPurchaseReport{
		ByMaterial: []models.RawMaterialPurchaseByMaterial{},
		ByDate:     []models.RawMaterialPurchaseByDate{},
	}

	if err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(p.total_cost), 0), COUNT(*)
		FROM raw_material_purchases p
		WHERE p.store_id = $1 AND p.is_active = true`+filter,
		args...).Scan(&report.TotalCost, &report.TotalCount); err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT p.material_id, COALESCE(m.name, ''), COALESCE(m.unit, ''),
		       SUM(p.quantity), SUM(p.total_cost), COUNT(*)
		FROM raw_material_purchases p
		LEFT JOIN raw_materials m ON p.material_id = m.id
		WHERE p.store_id = $1 AND p.is_active = true`+filter+`
		GROUP BY p.material_id, m.name, m.unit
		ORDER BY SUM(p.total_cost) DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var row models.RawMaterialPurchaseByMaterial
		if err := rows.Scan(&row.MaterialID, &row.MaterialName, &row.MaterialUnit,
			&row.Quantity, &row.TotalCost, &row.PurchaseCount); err != nil {
			return nil, err
		}
		report.ByMaterial = append(report.ByMaterial, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()

	dateRows, err := r.db.QueryContext(ctx, `
		SELECT TO_CHAR(DATE(p.purchase_date), 'YYYY-MM-DD'), SUM(p.total_cost), COUNT(*)
		FROM raw_material_purchases p
		WHERE p.store_id = $1 AND p.is_active = true`+filter+`
		GROUP BY DATE(p.purchase_date)
		ORDER BY DATE(p.purchase_date) DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer dateRows.Close()
	for dateRows.Next() {
		var row models.RawMaterialPurchaseByDate
		if err := dateRows.Scan(&row.Date, &row.TotalCost, &row.PurchaseCount); err != nil {
			return nil, err
		}
		report.ByDate = append(report.ByDate, row)
	}
	return report, dateRows.Err()
}

// ---------- Item Recipes ----------

func (r *InventoryRepository) GetItemRecipe(ctx context.Context, itemID string) ([]models.ItemRecipe, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT rc.id, rc.store_id, rc.item_id, rc.material_id,
		       COALESCE(m.name, ''), COALESCE(m.unit, ''), COALESCE(m.avg_cost, 0),
		       rc.quantity, rc.quantity * COALESCE(m.avg_cost, 0),
		       rc.is_active, rc.created_at
		FROM item_recipes rc
		LEFT JOIN raw_materials m ON m.id = rc.material_id
		WHERE rc.item_id = $1 AND rc.is_active = true
		ORDER BY m.name`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []models.ItemRecipe
	for rows.Next() {
		var l models.ItemRecipe
		if err := rows.Scan(&l.ID, &l.StoreID, &l.ItemID, &l.MaterialID,
			&l.MaterialName, &l.MaterialUnit, &l.MaterialAvgCost,
			&l.Quantity, &l.LineCost, &l.IsActive, &l.CreatedAt); err != nil {
			return nil, err
		}
		lines = append(lines, l)
	}
	return lines, nil
}

// SetItemRecipe atomically replaces an item's recipe. Lines are config data
// (not a ledger) so a hard delete+insert keeps replace semantics simple.
func (r *InventoryRepository) SetItemRecipe(ctx context.Context, storeID, itemID string, lines []models.ItemRecipeLineInput, modifiedBy string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM item_recipes WHERE item_id = $1", itemID); err != nil {
		return err
	}
	for _, l := range lines {
		var modBy interface{}
		if modifiedBy != "" {
			modBy = modifiedBy
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO item_recipes (id, store_id, item_id, material_id, quantity, modified_by)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			uuid.New().String(), storeID, itemID, l.MaterialID, l.Quantity, modBy); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	r.invalidateItemCostCache(ctx, storeID)
	return nil
}

// ---------- Order-driven consumption ----------

// ConsumeOrderTx writes 'consumption' ledger rows for every recipe line of
// every item on the order (recipe qty x item qty). Idempotent: if the order
// already has active consumption rows it does nothing, so retries and double
// completes never double-deduct. Must be called inside the caller's tx.
func (r *InventoryRepository) ConsumeOrderTx(ctx context.Context, tx *sql.Tx, orderID, modifiedBy string) error {
	var existing int
	if err := tx.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM raw_material_transactions WHERE reference_id = $1 AND type = 'consumption' AND is_active = true",
		orderID).Scan(&existing); err != nil {
		return err
	}
	if existing > 0 {
		return nil
	}

	rows, err := tx.QueryContext(ctx, `
		SELECT oi.item_id, COALESCE(i.name, ''), oi.quantity,
		       rc.material_id, rc.quantity, COALESCE(m.avg_cost, 0), o.store_id,
		       COALESCE(b.invoice_no, ''), COALESCE(o.table_name, '')
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN item_recipes rc ON rc.item_id = oi.item_id AND rc.is_active = true
		JOIN raw_materials m ON m.id = rc.material_id AND m.is_active = true
		LEFT JOIN items i ON i.id = oi.item_id
		LEFT JOIN bills b ON b.order_id = o.id AND (b.status IS NULL OR b.status = 'active')
		WHERE oi.order_id = $1
		ORDER BY rc.material_id`, orderID)
	if err != nil {
		return err
	}
	type line struct {
		itemID, itemName, materialID, storeID string
		itemQty, recipeQty, avgCost           float64
		invoiceNo, tableName                  string
	}
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.itemID, &l.itemName, &l.itemQty,
			&l.materialID, &l.recipeQty, &l.avgCost, &l.storeID,
			&l.invoiceNo, &l.tableName); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(lines) == 0 {
		return nil
	}

	// Lock touched materials in sorted order to avoid deadlocks between
	// concurrent order completions.
	locked := map[string]bool{}
	affected := []string{}
	for _, l := range lines {
		if !locked[l.materialID] {
			if err := r.lockMaterial(ctx, tx, l.materialID); err != nil {
				return err
			}
			locked[l.materialID] = true
			affected = append(affected, l.materialID)
		}
	}
	sort.Strings(affected)

	for _, l := range lines {
		orderRef := orderID
		if len(orderRef) > 8 {
			orderRef = orderRef[:8]
		}
		if l.invoiceNo != "" {
			orderRef = l.invoiceNo
		} else if l.tableName != "" {
			orderRef = l.tableName
		}
		if err := r.allocateStockOut(ctx, tx, l.materialID, l.recipeQty*l.itemQty); err != nil {
			return err
		}
		err := r.insertTransaction(ctx, tx, models.RawMaterialTransaction{
			ID:              uuid.New().String(),
			StoreID:         l.storeID,
			MaterialID:      l.materialID,
			Type:            "consumption",
			Quantity:        -(l.recipeQty * l.itemQty),
			ReferenceID:     orderID,
			ItemID:          l.itemID,
			UnitCost:        l.avgCost,
			Notes:           fmt.Sprintf("%s ×%g (order %s)", l.itemName, l.itemQty, orderRef),
			TransactionDate: time.Now(),
			CreatedBy:       modifiedBy,
		})
		if err != nil {
			return err
		}
	}
	for _, materialID := range affected {
		if err := r.recomputeMaterial(ctx, tx, materialID); err != nil {
			return err
		}
	}
	return nil
}

// ReverseOrderConsumptionTx soft-deletes an order's consumption rows and
// recomputes the affected materials — used when a completed order is
// cancelled or its items are re-synced.
func (r *InventoryRepository) ReverseOrderConsumptionTx(ctx context.Context, tx *sql.Tx, orderID, modifiedBy string) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT DISTINCT material_id FROM raw_material_transactions
		WHERE reference_id = $1 AND type = 'consumption' AND is_active = true
		ORDER BY material_id`, orderID)
	if err != nil {
		return err
	}
	var materialIDs []string
	var outQtys []float64
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		materialIDs = append(materialIDs, id)
		var q float64
		_ = tx.QueryRowContext(ctx, "SELECT COALESCE(-SUM(quantity),0) FROM raw_material_transactions WHERE reference_id = $1 AND type = 'consumption' AND is_active = true AND material_id = $2", orderID, id).Scan(&q)
		outQtys = append(outQtys, q)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(materialIDs) == 0 {
		return nil
	}

	for _, materialID := range materialIDs {
		if err := r.lockMaterial(ctx, tx, materialID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE raw_material_transactions
		SET is_active = false, modified_by = $2
		WHERE reference_id = $1 AND type = 'consumption' AND is_active = true`,
		orderID, modifiedBy); err != nil {
		return err
	}
	for i, materialID := range materialIDs {
		if err := r.refundStockOut(ctx, tx, materialID, outQtys[i]); err != nil {
			return err
		}
		if err := r.recomputeMaterial(ctx, tx, materialID); err != nil {
			return err
		}
	}
	return nil
}

// ---------- Consumption report ----------

func (r *InventoryRepository) GetConsumptionReport(ctx context.Context, storeID, startDate, endDate string) (*models.RawMaterialConsumptionReport, error) {
	args := []interface{}{storeID}
	filter := ""
	idx := 2
	if startDate != "" {
		filter += fmt.Sprintf(" AND t.transaction_date >= $%d", idx)
		args = append(args, startDate)
		idx++
	}
	if endDate != "" {
		filter += fmt.Sprintf(" AND t.transaction_date <= $%d", idx)
		args = append(args, endDate)
		idx++
	}

	report := &models.RawMaterialConsumptionReport{
		ByMaterial: []models.RawMaterialConsumptionByMaterial{},
		ByItem:     []models.RawMaterialConsumptionByItem{},
	}

	if err := r.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(-t.quantity * COALESCE(t.unit_cost, 0)), 0), COUNT(*)
		FROM raw_material_transactions t
		WHERE t.store_id = $1 AND t.is_active = true AND t.type = 'consumption'`+filter,
		args...).Scan(&report.TotalCost, &report.TotalCount); err != nil {
		return nil, err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT t.material_id, COALESCE(m.name, ''), COALESCE(m.unit, ''),
		       SUM(-t.quantity), SUM(-t.quantity * COALESCE(t.unit_cost, 0)), COUNT(*)
		FROM raw_material_transactions t
		LEFT JOIN raw_materials m ON m.id = t.material_id
		WHERE t.store_id = $1 AND t.is_active = true AND t.type = 'consumption'`+filter+`
		GROUP BY t.material_id, m.name, m.unit
		ORDER BY SUM(-t.quantity * COALESCE(t.unit_cost, 0)) DESC`, args...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var row models.RawMaterialConsumptionByMaterial
		if err := rows.Scan(&row.MaterialID, &row.MaterialName, &row.MaterialUnit,
			&row.Quantity, &row.TotalCost, &row.TxnCount); err != nil {
			rows.Close()
			return nil, err
		}
		report.ByMaterial = append(report.ByMaterial, row)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	itemRows, err := r.db.QueryContext(ctx, `
		SELECT t.item_id, COALESCE(i.name, ''), 
		       SUM(-t.quantity * COALESCE(t.unit_cost, 0)), COUNT(*)
		FROM raw_material_transactions t
		LEFT JOIN items i ON i.id = t.item_id
		WHERE t.store_id = $1 AND t.is_active = true AND t.type = 'consumption'`+filter+`
		GROUP BY t.item_id, i.name
		ORDER BY SUM(-t.quantity * COALESCE(t.unit_cost, 0)) DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var row models.RawMaterialConsumptionByItem
		var itemID sql.NullString
		if err := itemRows.Scan(&itemID, &row.ItemName, &row.TotalCost, &row.TxnCount); err != nil {
			return nil, err
		}
		row.ItemID = itemID.String
		report.ByItem = append(report.ByItem, row)
	}
	return report, itemRows.Err()
}

// itemCostLines returns an item's cost components as ItemExpense-shaped rows
// for the profit reports: recipe lines (material name, "qty unit @ avg/unit"
// description, line cost) when the item has a recipe, otherwise its legacy
// manual item_expenses entries.
func itemCostLines(ctx context.Context, q queryer, itemID string) ([]models.ItemExpense, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT rc.id, rc.item_id, m.name,
		       (rc.quantity || ' ' || m.unit || ' @ ' || ROUND(COALESCE(m.avg_cost,0)::numeric, 2) || '/' || m.unit) AS description,
		       (rc.quantity * COALESCE(m.avg_cost, 0)) AS amount, rc.is_active, rc.created_at
		FROM item_recipes rc
		JOIN raw_materials m ON m.id = rc.material_id
		WHERE rc.item_id = $1 AND rc.is_active = true
		UNION ALL
		SELECT e.id, e.item_id, e.name, COALESCE(e.description, ''), e.amount, e.is_active, e.created_at
		FROM item_expenses e
		WHERE e.item_id = $1 AND e.is_active = true
		  AND NOT EXISTS (SELECT 1 FROM item_recipes r2 WHERE r2.item_id = e.item_id AND r2.is_active = true)
		ORDER BY 3`, itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []models.ItemExpense
	for rows.Next() {
		var e models.ItemExpense
		var createdAt sql.NullTime
		if err := rows.Scan(&e.ID, &e.ItemID, &e.Name, &e.Description, &e.Amount, &e.IsActive, &createdAt); err != nil {
			return nil, err
		}
		lines = append(lines, e)
	}
	if lines == nil {
		lines = []models.ItemExpense{}
	}
	return lines, nil
}
