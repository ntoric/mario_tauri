package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"cafe-backend/internal/gst"
	"cafe-backend/internal/models"

	"github.com/google/uuid"
)

// BadRequestError marks domain validation failures that map to HTTP 400.
type BadRequestError struct{ Msg string }

func (e *BadRequestError) Error() string { return e.Msg }

// ConflictError marks domain conflicts that map to HTTP 409.
type ConflictError struct{ Msg string }

func (e *ConflictError) Error() string { return e.Msg }

// Bill and credit-note timestamps are TIMESTAMP (no time zone) columns filled
// by CURRENT_TIMESTAMP, i.e. wall-clock time in the database session's zone.
// tsInstant reads such a column as a real instant and tsParam converts a
// timestamptz parameter into that wall clock, so IST day and month
// boundaries are right whatever zone the database server runs in.
func tsInstant(col string) string {
	return "(" + col + " AT TIME ZONE current_setting('TimeZone'))"
}

func tsParam(n int) string {
	return fmt.Sprintf("($%d::timestamptz AT TIME ZONE current_setting('TimeZone'))", n)
}

// tsArg formats a time as an unambiguous timestamptz literal for tsParam.
func tsArg(t time.Time) string { return t.Format(time.RFC3339Nano) }

// IssueOptions carries the mutable billing attributes for IssueBill.
type IssueOptions struct {
	PaymentMethod  string
	CustomerName   string
	CustomerMobile string
	Discount       float64
	Buyer          gst.Buyer
	GeneratedBy    string
}

// issueBillColumns is the full bill column list used by GetAll/GetByID.
const billSelectCols = `
	b.id, b.store_id, b.order_id, b.table_number, b.table_name, b.invoice_no, b.subtotal, b.tax_total, b.discount, b.total,
	b.payment_method, b.customer_name, b.customer_mobile, b.is_printed, b.status, (b.generated_at AT TIME ZONE current_setting('TimeZone')), b.generated_by,
	b.fy, b.invoice_seq, b.document_type, b.supply_type, b.place_of_supply, b.supplier_gstin, b.supplier_state_code,
	b.buyer_gstin, b.buyer_name, b.buyer_address, b.buyer_state_code, b.order_source, b.prices_include_tax,
	b.taxable_value, b.cgst, b.sgst, b.igst, b.cess, b.round_off, b.is_utgst, (b.cancelled_at AT TIME ZONE current_setting('TimeZone')), b.cancel_reason, b.eco_gstin,
	(SELECT COALESCE(SUM(cn.total), 0) FROM credit_notes cn WHERE cn.bill_id = b.id AND cn.status = 'active'),
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
	),
	(SELECT COALESCE(json_agg(
	    json_build_object(
	      'id', bl.id, 'billId', bl.bill_id, 'itemId', bl.item_id, 'name', bl.name,
	      'hsnCode', bl.hsn_code, 'unit', bl.unit, 'taxCategory', bl.tax_category,
	      'quantity', bl.quantity, 'unitPrice', bl.unit_price, 'gross', bl.gross,
	      'discount', bl.discount, 'taxableValue', bl.taxable_value, 'taxRate', bl.tax_rate,
	      'cgstRate', bl.cgst_rate, 'cgst', bl.cgst, 'sgstRate', bl.sgst_rate, 'sgst', bl.sgst,
	      'igstRate', bl.igst_rate, 'igst', bl.igst, 'cess', bl.cess, 'total', bl.total,
	      'creditedQuantity', (SELECT COALESCE(SUM(cnl.quantity), 0)
	        FROM credit_note_lines cnl
	        JOIN credit_notes cn ON cn.id = cnl.credit_note_id AND cn.status = 'active'
	        WHERE cnl.bill_line_id = bl.id)
	    ) ORDER BY bl.id), '[]')
	 FROM bill_lines bl WHERE bl.bill_id = b.id)
`

const billSelectJoins = `
	FROM bills b
	LEFT JOIN order_items oi ON b.order_id = oi.order_id
	LEFT JOIN items i ON oi.item_id = i.id
	LEFT JOIN categories c ON i.category_id = c.id
`

// scanBills scans rows produced by "SELECT billSelectCols ..." queries and
// derives the JSON-only fields (tax summary, place-of-supply name).
func scanBills(rows *sql.Rows) ([]models.Bill, error) {
	var bills []models.Bill
	for rows.Next() {
		b, err := scanBill(rows)
		if err != nil {
			return nil, err
		}
		bills = append(bills, *b)
	}
	return bills, rows.Err()
}

type scanner interface {
	Scan(dest ...interface{}) error
}

func scanBill(s scanner) (*models.Bill, error) {
	var b models.Bill
	var tableName, method, customer, customerMobile, generatedBy, billStatus sql.NullString
	var fy, docType, supplyType, pos, supGSTIN, supState sql.NullString
	var buyerGSTIN, buyerName, buyerAddr, buyerState, orderSource, cancelReason, ecoGSTIN sql.NullString
	var invoiceSeq sql.NullInt64
	var cancelledAt sql.NullTime
	var itemsBytes, linesBytes []byte

	err := s.Scan(
		&b.ID, &b.StoreID, &b.OrderID, &b.TableNumber, &tableName, &b.InvoiceNo, &b.Subtotal, &b.TaxTotal, &b.Discount, &b.Total,
		&method, &customer, &customerMobile, &b.IsPrinted, &billStatus, &b.GeneratedAt, &generatedBy,
		&fy, &invoiceSeq, &docType, &supplyType, &pos, &supGSTIN, &supState,
		&buyerGSTIN, &buyerName, &buyerAddr, &buyerState, &orderSource, &b.PricesIncludeTax,
		&b.TaxableValue, &b.CGST, &b.SGST, &b.IGST, &b.Cess, &b.RoundOff, &b.IsUTGST, &cancelledAt, &cancelReason, &ecoGSTIN,
		&b.CreditedTotal,
		&itemsBytes, &linesBytes,
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
	b.FY = fy.String
	b.InvoiceSeq = int(invoiceSeq.Int64)
	b.DocumentType = docType.String
	b.SupplyType = supplyType.String
	b.PlaceOfSupply = pos.String
	b.PlaceOfSupplyName = gst.StateName(b.PlaceOfSupply)
	b.SupplierGSTIN = supGSTIN.String
	b.SupplierStateCode = supState.String
	b.BuyerGSTIN = buyerGSTIN.String
	b.BuyerName = buyerName.String
	b.BuyerAddress = buyerAddr.String
	b.BuyerStateCode = buyerState.String
	b.OrderSource = orderSource.String
	if b.OrderSource == "" {
		b.OrderSource = "pos"
	}
	b.CancelReason = cancelReason.String
	b.EcoGSTIN = ecoGSTIN.String
	if cancelledAt.Valid {
		b.CancelledAt = &cancelledAt.Time
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
	if len(linesBytes) > 0 {
		var lines []models.BillLine
		if err := json.Unmarshal(linesBytes, &lines); err == nil {
			b.Lines = lines
		}
	}
	if b.Lines == nil {
		b.Lines = []models.BillLine{}
	}
	b.TaxSummary = summarizeLines(b.Lines)
	return &b, nil
}

func round2f(x float64) float64 { return math.Round(x*100) / 100 }

func summarizeLines(lines []models.BillLine) []models.TaxSummaryRow {
	byRate := map[float64]*models.TaxSummaryRow{}
	for _, l := range lines {
		rs := byRate[l.TaxRate]
		if rs == nil {
			rs = &models.TaxSummaryRow{Rate: l.TaxRate}
			byRate[l.TaxRate] = rs
		}
		rs.TaxableValue = round2f(rs.TaxableValue + l.TaxableValue)
		rs.CGST = round2f(rs.CGST + l.CGST)
		rs.SGST = round2f(rs.SGST + l.SGST)
		rs.IGST = round2f(rs.IGST + l.IGST)
		rs.Cess = round2f(rs.Cess + l.Cess)
	}
	out := make([]models.TaxSummaryRow, 0, len(byRate))
	for _, rs := range byRate {
		out = append(out, *rs)
	}
	sort.Slice(out, func(a, b int) bool { return out[a].Rate < out[b].Rate })
	return out
}

// GetByID returns one bill with its computed GST lines.
func (r *BillRepository) GetByID(ctx context.Context, id string) (*models.Bill, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+billSelectCols+billSelectJoins+"WHERE b.id = $1 GROUP BY b.id", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	bills, err := scanBills(rows)
	if err != nil {
		return nil, err
	}
	if len(bills) == 0 {
		return nil, nil
	}
	return &bills[0], nil
}

// PeekNextInvoiceNo returns the next invoice number the doc_series would
// issue for the current FY — informational only; the real number is
// allocated inside IssueBill's transaction.
func (r *BillRepository) PeekNextInvoiceNo(ctx context.Context, store *models.Store) (string, error) {
	fy := gst.FYCode(time.Now())
	var lastSeq int
	var prefix sql.NullString
	err := r.db.QueryRowContext(ctx,
		"SELECT last_seq, prefix FROM doc_series WHERE store_id = $1 AND doc_type = 'invoice' AND fy = $2",
		store.ID, fy).Scan(&lastSeq, &prefix)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	p := store.InvoicePrefix
	if prefix.Valid && prefix.String != "" {
		p = prefix.String
	}
	if p == "" {
		p = "INV"
	}
	no, err := gst.FormatDocNo(p, fy, lastSeq+1)
	if err != nil {
		return fmt.Sprintf("%s/%s/%d", p, fy, lastSeq+1), nil
	}
	return no, nil
}

// allocateDocNo bumps the per-(store, doc type, FY) series inside tx and
// returns the formatted document number. The prefix captured when the series
// row is first created wins for the whole FY — a changed store prefix only
// takes effect next FY.
func allocateDocNo(ctx context.Context, tx *sql.Tx, storeID, docType, fy, prefix string) (string, int, error) {
	var seq int
	var storedPrefix sql.NullString
	err := tx.QueryRowContext(ctx, `
		INSERT INTO doc_series (store_id, doc_type, fy, prefix, last_seq)
		VALUES ($1, $2, $3, $4, 1)
		ON CONFLICT (store_id, doc_type, fy)
		DO UPDATE SET last_seq = doc_series.last_seq + 1
		RETURNING last_seq, prefix
	`, storeID, docType, fy, prefix).Scan(&seq, &storedPrefix)
	if err != nil {
		return "", 0, err
	}
	if storedPrefix.Valid && storedPrefix.String != "" {
		prefix = storedPrefix.String
	}
	no, err := gst.FormatDocNo(prefix, fy, seq)
	if err != nil {
		return "", 0, &BadRequestError{Msg: err.Error()}
	}
	return no, seq, nil
}

// IssueBill computes the GST bill for an order and persists it atomically:
// order row lock → idempotency check → line load → gst.Compute → document
// number allocation → bill + bill_lines insert. Returns the existing bill
// unchanged when the order already has an active one.
func (r *BillRepository) IssueBill(ctx context.Context, store *models.Store, orderID string, opts IssueOptions) (*models.Bill, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var tableNumber int
	var tableName, orderSource, custName, custMobile sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT table_number, COALESCE(table_name, ''), COALESCE(order_source, 'pos'),
		       COALESCE(customer_name, ''), COALESCE(customer_mobile, '')
		FROM orders WHERE id = $1 AND store_id = $2 FOR UPDATE
	`, orderID, store.ID).Scan(&tableNumber, &tableName, &orderSource, &custName, &custMobile)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &BadRequestError{Msg: "Order not found"}
		}
		return nil, err
	}

	// Idempotent: an existing active bill is returned as-is so double clicks
	// and retries never burn a document number.
	var existingID string
	err = tx.QueryRowContext(ctx,
		"SELECT id FROM bills WHERE order_id = $1 AND COALESCE(status, 'active') = 'active' LIMIT 1",
		orderID).Scan(&existingID)
	if err == nil {
		tx.Rollback()
		return r.GetByID(ctx, existingID)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	inputs, err := loadOrderLineInputs(ctx, tx, store, orderID)
	if err != nil {
		return nil, err
	}
	if len(inputs) == 0 {
		return nil, &BadRequestError{Msg: "Order has no items to bill"}
	}

	res, err := gst.Compute(gst.Input{
		Store:       gstProfile(store),
		Lines:       inputs,
		Discount:    opts.Discount,
		Buyer:       opts.Buyer,
		OrderSource: orderSource.String,
	})
	if err != nil {
		return nil, &BadRequestError{Msg: err.Error()}
	}

	now := time.Now()
	fy := gst.FYCode(now)
	prefix := store.InvoicePrefix
	if prefix == "" {
		prefix = "INV"
	}
	invoiceNo, seq, err := allocateDocNo(ctx, tx, store.ID, "invoice", fy, prefix)
	if err != nil {
		return nil, err
	}

	paymentMethod := opts.PaymentMethod
	if paymentMethod == "" {
		paymentMethod = "upi"
	}

	billID := uuid.New().String()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO bills (
			id, store_id, order_id, table_number, table_name, invoice_no,
			subtotal, tax_total, discount, total, payment_method, customer_name, customer_mobile,
			generated_by, fy, invoice_seq, document_type, supply_type, place_of_supply,
			supplier_gstin, supplier_state_code, buyer_gstin, buyer_name, buyer_address, buyer_state_code,
			order_source, prices_include_tax, taxable_value, cgst, sgst, igst, cess, round_off, is_utgst, eco_gstin
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
	`, billID, store.ID, orderID, tableNumber, tableName.String, invoiceNo,
		res.Gross, res.TotalTax, res.Discount, res.Total, paymentMethod,
		nz(opts.CustomerName, custName.String), nz(opts.CustomerMobile, custMobile.String),
		opts.GeneratedBy, fy, seq, res.DocumentType, res.SupplyType, res.PlaceOfSupply,
		nz(store.GSTIN, ""), nz(store.StateCode, ""), nz(opts.Buyer.GSTIN, ""), nz(opts.Buyer.Name, ""), nz(opts.Buyer.Address, ""), nz(opts.Buyer.StateCode, ""),
		orderSource.String, store.PricesIncludeTax, res.TaxableValue, res.CGST, res.SGST, res.IGST, res.Cess, res.RoundOff, res.UTGST,
		nz(ECOGSTINFor(store, orderSource.String), ""),
	)
	if err != nil {
		return nil, err
	}

	for _, l := range res.Lines {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO bill_lines (bill_id, item_id, name, hsn_code, unit, tax_category, quantity, unit_price, gross, discount, taxable_value, tax_rate, cgst_rate, cgst, sgst_rate, sgst, igst_rate, igst, cess, total)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
		`, billID, nz(l.ItemID, ""), l.Name, l.HSN, l.Unit, l.TaxCategory, l.Quantity, l.UnitPrice,
			l.Gross, l.Discount, l.TaxableValue, l.TaxRate, l.CGSTRate, l.CGST, l.SGSTRate, l.SGST, l.IGSTRate, l.IGST, l.Cess, l.Total)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetByID(ctx, billID)
}

// ECOGSTINFor returns the store's configured GSTIN for the e-commerce
// operator behind an order source, or "" for counter sales / unset.
func ECOGSTINFor(store *models.Store, source string) string {
	switch source {
	case gst.SourceSwiggy:
		return store.SwiggyGSTIN
	case gst.SourceZomato:
		return store.ZomatoGSTIN
	case gst.SourceOther:
		return store.OtherEcoGSTIN
	}
	return ""
}

// cleanTaxCategory drops unknown tax categories (e.g. from a parsed menu
// upload) so the column default applies.
func cleanTaxCategory(c string) string {
	if gst.ValidTaxCategory(c) {
		return c
	}
	return ""
}

// queryer is satisfied by *sql.DB and *sql.Tx.
type queryer interface {
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// gstProfile maps a store row onto the engine's StoreProfile.
func gstProfile(store *models.Store) gst.StoreProfile {
	regType := store.GSTRegistrationType
	if regType == "" {
		regType = gst.RegistrationRegular
	}
	return gst.StoreProfile{
		RegistrationType: regType,
		TaxEnabled:       store.TaxEnabled,
		PricesIncludeTax: store.PricesIncludeTax,
		StateCode:        store.StateCode,
		GSTIN:            store.GSTIN,
	}
}

// hsnFallback returns the item's HSN or the store/default restaurant SAC.
func hsnFallback(itemHSN, defaultSAC string) string {
	if itemHSN != "" {
		return itemHSN
	}
	if defaultSAC != "" {
		return defaultSAC
	}
	return "996331"
}

// loadOrderLineInputs is the single order→LineInput loader used by IssueBill
// (inside its transaction) and by the preview endpoint.
func loadOrderLineInputs(ctx context.Context, q queryer, store *models.Store, orderID string) ([]gst.LineInput, error) {
	rows, err := q.QueryContext(ctx, `
		SELECT oi.item_id, COALESCE(i.name, ''), oi.quantity,
		       COALESCE(NULLIF(oi.unit_price, 0), i.price, 0),
		       COALESCE(i.tax_percent, oi.tax_percent, 0),
		       COALESCE(NULLIF(i.hsn_code, ''), $2, '996331'),
		       COALESCE(NULLIF(i.tax_category, ''), 'taxable')
		FROM order_items oi
		LEFT JOIN items i ON i.id = oi.item_id
		WHERE oi.order_id = $1
		ORDER BY oi.id
	`, orderID, store.DefaultSACCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var inputs []gst.LineInput
	for rows.Next() {
		var li gst.LineInput
		var itemID sql.NullString
		var qty float64
		if err := rows.Scan(&itemID, &li.Name, &qty, &li.UnitPrice, &li.TaxRate, &li.HSN, &li.TaxCategory); err != nil {
			return nil, err
		}
		li.ItemID = itemID.String
		li.Quantity = qty
		inputs = append(inputs, li)
	}
	return inputs, rows.Err()
}

// nz returns a nullable driver value: nil when s is empty, else s.
func nz(s, fallback string) interface{} {
	if s == "" {
		s = fallback
	}
	if s == "" {
		return nil
	}
	return s
}

// OrderLineInputs loads the gst.LineInput rows for an order exactly the way
// IssueBill does — used by the bill-preview endpoint.
func (r *BillRepository) OrderLineInputs(ctx context.Context, store *models.Store, orderID string) ([]gst.LineInput, string, error) {
	var orderSource sql.NullString
	err := r.db.QueryRowContext(ctx,
		"SELECT COALESCE(order_source, 'pos') FROM orders WHERE id = $1 AND store_id = $2",
		orderID, store.ID).Scan(&orderSource)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, "", &BadRequestError{Msg: "Order not found"}
		}
		return nil, "", err
	}
	inputs, err := loadOrderLineInputs(ctx, r.db, store, orderID)
	return inputs, orderSource.String, err
}

// GetActiveByOrderID returns the order's active bill, or nil.
func (r *BillRepository) GetActiveByOrderID(ctx context.Context, orderID string) (*models.Bill, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+billSelectCols+billSelectJoins+
			"WHERE b.order_id = $1 AND COALESCE(b.status, 'active') = 'active' GROUP BY b.id LIMIT 1",
		orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	bills, err := scanBills(rows)
	if err != nil {
		return nil, err
	}
	if len(bills) == 0 {
		return nil, nil
	}
	return &bills[0], nil
}

// ==========================================
// CREDIT NOTES
// ==========================================

// CreditNoteLineInput selects a bill line and the quantity to credit.
type CreditNoteLineInput struct {
	BillLineID int64   `json:"billLineId"`
	Quantity   float64 `json:"quantity"`
}

// CreateCreditNote issues a GST credit note against an active bill. Empty
// reqLines credits every remaining quantity; otherwise each requested
// quantity must not exceed the billed minus already-credited quantity.
func (r *BillRepository) CreateCreditNote(ctx context.Context, store *models.Store, billID, reason string, reqLines []CreditNoteLineInput, issuedBy string) (*models.CreditNote, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var fy, status sql.NullString
	var billTotal float64
	var supplyType, pos, buyerGSTIN sql.NullString
	var isUTGST bool
	var invoiceNo sql.NullString
	var generatedAt time.Time
	err = tx.QueryRowContext(ctx, `
		SELECT fy, COALESCE(status, 'active'), total, supply_type, place_of_supply, buyer_gstin, is_utgst, invoice_no, generated_at
		FROM bills WHERE id = $1 AND store_id = $2 FOR UPDATE
	`, billID, store.ID).Scan(&fy, &status, &billTotal, &supplyType, &pos, &buyerGSTIN, &isUTGST, &invoiceNo, &generatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &BadRequestError{Msg: "Bill not found"}
		}
		return nil, err
	}
	if status.String != "active" {
		return nil, &BadRequestError{Msg: "Bill is cancelled"}
	}
	if !fy.Valid || fy.String == "" {
		return nil, &BadRequestError{Msg: "Credit notes are only supported for GST bills"}
	}
	if time.Now().After(gst.CreditNoteDeadline(fy.String)) {
		return nil, &BadRequestError{Msg: "Credit note period for this invoice has passed"}
	}

	lineRows, err := tx.QueryContext(ctx, `
		SELECT id, item_id, name, hsn_code, unit, quantity, taxable_value, tax_rate, cgst, sgst, igst, cess, total
		FROM bill_lines WHERE bill_id = $1 ORDER BY id
	`, billID)
	if err != nil {
		return nil, err
	}
	type billLine struct {
		models.BillLine
	}
	var blines []billLine
	for lineRows.Next() {
		var l billLine
		var itemID, hsn, unit sql.NullString
		if err := lineRows.Scan(&l.ID, &itemID, &l.Name, &hsn, &unit, &l.Quantity, &l.TaxableValue, &l.TaxRate, &l.CGST, &l.SGST, &l.IGST, &l.Cess, &l.Total); err != nil {
			lineRows.Close()
			return nil, err
		}
		l.ItemID = itemID.String
		l.HSNCode = hsn.String
		l.Unit = unit.String
		blines = append(blines, l)
	}
	lineRows.Close()
	if len(blines) == 0 {
		return nil, &BadRequestError{Msg: "Credit notes are only supported for GST bills"}
	}

	// Already-credited quantities and amounts per bill line (active CNs only).
	creditedQty := map[int64]float64{}
	creditedAmt := map[int64]*models.CreditNoteLine{}
	cRows, err := tx.QueryContext(ctx, `
		SELECT cnl.bill_line_id, SUM(cnl.quantity), SUM(cnl.taxable_value), SUM(cnl.cgst), SUM(cnl.sgst), SUM(cnl.igst), SUM(cnl.cess), SUM(cnl.total)
		FROM credit_note_lines cnl
		JOIN credit_notes cn ON cn.id = cnl.credit_note_id
		WHERE cn.bill_id = $1 AND cn.status = 'active'
		GROUP BY cnl.bill_line_id
	`, billID)
	if err != nil {
		return nil, err
	}
	for cRows.Next() {
		var id int64
		var a models.CreditNoteLine
		if err := cRows.Scan(&id, &a.Quantity, &a.TaxableValue, &a.CGST, &a.SGST, &a.IGST, &a.Cess, &a.Total); err != nil {
			cRows.Close()
			return nil, err
		}
		creditedQty[id] = a.Quantity
		creditedAmt[id] = &a
	}
	cRows.Close()

	requested := map[int64]float64{}
	if len(reqLines) == 0 {
		for _, l := range blines {
			rem := l.Quantity - creditedQty[l.ID]
			if rem > 0 {
				requested[l.ID] = rem
			}
		}
	} else {
		for _, rl := range reqLines {
			requested[rl.BillLineID] += rl.Quantity
		}
	}
	if len(requested) == 0 {
		return nil, &BadRequestError{Msg: "Nothing left to credit on this bill"}
	}

	var cnLines []models.CreditNoteLine
	var taxable, cgst, sgst, igst, cess float64
	for _, l := range blines {
		q := requested[l.ID]
		if q == 0 {
			continue
		}
		remaining := round2f(l.Quantity - creditedQty[l.ID])
		if q <= 0 || q > remaining {
			return nil, &BadRequestError{Msg: fmt.Sprintf("invalid credit quantity %.3f for line %d (remaining %.3f)", q, l.ID, remaining)}
		}
		prev := creditedAmt[l.ID]
		cl := models.CreditNoteLine{
			BillLineID: l.ID,
			ItemID:     l.ItemID,
			Name:       l.Name,
			HSNCode:    l.HSNCode,
			Unit:       l.Unit,
			Quantity:   q,
			TaxRate:    l.TaxRate,
		}
		if q == remaining && prev != nil {
			// Crediting everything left: take the remaining amounts exactly so
			// cumulative credit notes never drift from the bill.
			cl.TaxableValue = round2f(l.TaxableValue - prev.TaxableValue)
			cl.CGST = round2f(l.CGST - prev.CGST)
			cl.SGST = round2f(l.SGST - prev.SGST)
			cl.IGST = round2f(l.IGST - prev.IGST)
			cl.Cess = round2f(l.Cess - prev.Cess)
			cl.Total = round2f(l.Total - prev.Total)
		} else if q == remaining {
			cl.TaxableValue = l.TaxableValue
			cl.CGST = l.CGST
			cl.SGST = l.SGST
			cl.IGST = l.IGST
			cl.Cess = l.Cess
			cl.Total = l.Total
		} else {
			cl.TaxableValue = round2f(l.TaxableValue * q / l.Quantity)
			cl.CGST = round2f(l.CGST * q / l.Quantity)
			cl.SGST = round2f(l.SGST * q / l.Quantity)
			cl.IGST = round2f(l.IGST * q / l.Quantity)
			cl.Cess = round2f(l.Cess * q / l.Quantity)
			cl.Total = round2f(cl.TaxableValue + cl.CGST + cl.SGST + cl.IGST + cl.Cess)
		}
		taxable = round2f(taxable + cl.TaxableValue)
		cgst = round2f(cgst + cl.CGST)
		sgst = round2f(sgst + cl.SGST)
		igst = round2f(igst + cl.IGST)
		cess = round2f(cess + cl.Cess)
		cnLines = append(cnLines, cl)
	}

	// Total rounded to the rupee like invoices, capped so cumulative credit
	// never exceeds the bill total.
	var creditedSoFar float64
	err = tx.QueryRowContext(ctx,
		"SELECT COALESCE(SUM(total), 0) FROM credit_notes WHERE bill_id = $1 AND status = 'active'",
		billID).Scan(&creditedSoFar)
	if err != nil {
		return nil, err
	}
	exact := taxable + cgst + sgst + igst + cess
	total := float64(int(exact + 0.5))
	roundOff := round2f(total - exact)
	if cap_ := round2f(billTotal - creditedSoFar); total > cap_ {
		total = cap_
		roundOff = round2f(total - exact)
	}

	now := time.Now()
	fyNow := gst.FYCode(now)
	prefix := store.CreditNotePrefix
	if prefix == "" {
		prefix = "CN"
	}
	cnNo, seq, err := allocateDocNo(ctx, tx, store.ID, "credit_note", fyNow, prefix)
	if err != nil {
		return nil, err
	}

	cnID := uuid.New().String()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO credit_notes (id, store_id, bill_id, credit_note_no, fy, seq, reason, supply_type, place_of_supply, buyer_gstin, is_utgst, taxable_value, cgst, sgst, igst, cess, round_off, total, issued_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
	`, cnID, store.ID, billID, cnNo, fyNow, seq, reason, supplyType, pos, buyerGSTIN, isUTGST, taxable, cgst, sgst, igst, cess, roundOff, total, issuedBy)
	if err != nil {
		return nil, err
	}
	for i := range cnLines {
		cl := &cnLines[i]
		_, err = tx.ExecContext(ctx, `
			INSERT INTO credit_note_lines (credit_note_id, bill_line_id, item_id, name, hsn_code, unit, quantity, taxable_value, tax_rate, cgst, sgst, igst, cess, total)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		`, cnID, cl.BillLineID, nz(cl.ItemID, ""), cl.Name, cl.HSNCode, cl.Unit, cl.Quantity, cl.TaxableValue, cl.TaxRate, cl.CGST, cl.SGST, cl.IGST, cl.Cess, cl.Total)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetCreditNoteByID(ctx, cnID)
}

const creditNoteSelectCols = `
	cn.id, cn.store_id, cn.bill_id, cn.credit_note_no, cn.fy, cn.seq, cn.reason, cn.supply_type,
	cn.place_of_supply, cn.buyer_gstin, cn.is_utgst, cn.taxable_value, cn.cgst, cn.sgst, cn.igst,
	cn.cess, cn.round_off, cn.total, cn.status, (cn.issued_at AT TIME ZONE current_setting('TimeZone')), cn.issued_by,
	b.invoice_no, (b.generated_at AT TIME ZONE current_setting('TimeZone')),
	(SELECT COALESCE(json_agg(
	    json_build_object(
	      'id', cnl.id, 'creditNoteId', cnl.credit_note_id, 'billLineId', cnl.bill_line_id,
	      'itemId', cnl.item_id, 'name', cnl.name, 'hsnCode', cnl.hsn_code, 'unit', cnl.unit,
	      'quantity', cnl.quantity, 'taxableValue', cnl.taxable_value, 'taxRate', cnl.tax_rate,
	      'cgst', cnl.cgst, 'sgst', cnl.sgst, 'igst', cnl.igst, 'cess', cnl.cess, 'total', cnl.total
	    ) ORDER BY cnl.id), '[]')
	 FROM credit_note_lines cnl WHERE cnl.credit_note_id = cn.id)
`

func scanCreditNotes(rows *sql.Rows) ([]models.CreditNote, error) {
	var out []models.CreditNote
	for rows.Next() {
		var cn models.CreditNote
		var billID, fy, supplyType, pos, buyerGSTIN, issuedBy, invNo sql.NullString
		var seq sql.NullInt64
		var billAt sql.NullTime
		var linesBytes []byte
		err := rows.Scan(
			&cn.ID, &cn.StoreID, &billID, &cn.CreditNoteNo, &fy, &seq, &cn.Reason, &supplyType,
			&pos, &buyerGSTIN, &cn.IsUTGST, &cn.TaxableValue, &cn.CGST, &cn.SGST, &cn.IGST,
			&cn.Cess, &cn.RoundOff, &cn.Total, &cn.Status, &cn.IssuedAt, &issuedBy,
			&invNo, &billAt, &linesBytes,
		)
		if err != nil {
			return nil, err
		}
		cn.BillID = billID.String
		cn.FY = fy.String
		cn.Seq = int(seq.Int64)
		cn.SupplyType = supplyType.String
		cn.PlaceOfSupply = pos.String
		cn.BuyerGSTIN = buyerGSTIN.String
		cn.IssuedBy = issuedBy.String
		cn.OriginalBillNo = invNo.String
		if billAt.Valid {
			cn.OriginalBillAt = &billAt.Time
		}
		if len(linesBytes) > 0 {
			_ = json.Unmarshal(linesBytes, &cn.Lines)
		}
		if cn.Lines == nil {
			cn.Lines = []models.CreditNoteLine{}
		}
		out = append(out, cn)
	}
	return out, rows.Err()
}

// GetCreditNoteByID returns one credit note with its lines and the original
// invoice number/date.
func (r *BillRepository) GetCreditNoteByID(ctx context.Context, id string) (*models.CreditNote, error) {
	rows, err := r.db.QueryContext(ctx,
		"SELECT "+creditNoteSelectCols+" FROM credit_notes cn LEFT JOIN bills b ON b.id = cn.bill_id WHERE cn.id = $1", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cns, err := scanCreditNotes(rows)
	if err != nil {
		return nil, err
	}
	if len(cns) == 0 {
		return nil, nil
	}
	return &cns[0], nil
}

// GetCreditNotes lists credit notes for a store within an optional range.
func (r *BillRepository) GetCreditNotes(ctx context.Context, storeID string, from, to *time.Time, billID string) ([]models.CreditNote, error) {
	q := "SELECT " + creditNoteSelectCols + " FROM credit_notes cn LEFT JOIN bills b ON b.id = cn.bill_id WHERE cn.store_id = $1"
	args := []interface{}{storeID}
	idx := 2
	if billID != "" {
		q += fmt.Sprintf(" AND cn.bill_id = $%d", idx)
		args = append(args, billID)
		idx++
	}
	if from != nil {
		q += " AND cn.issued_at >= " + tsParam(idx)
		args = append(args, tsArg(*from))
		idx++
	}
	if to != nil {
		q += " AND cn.issued_at <= " + tsParam(idx)
		args = append(args, tsArg(*to))
	}
	q += " ORDER BY cn.issued_at DESC"
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCreditNotes(rows)
}

// ==========================================
// GST REPORT ROW FETCHERS
// ==========================================

// GSTBillRow is the header-level data needed by the GST reports.
type GSTBillRow struct {
	ID            string
	InvoiceNo     string
	FY            string
	InvoiceSeq    int
	DocumentType  string
	SupplyType    string
	PlaceOfSupply string
	BuyerGSTIN    string
	BuyerName     string
	OrderSource   string
	Status        string
	PaymentMethod string
	CustomerName  string
	EcoGSTIN      string
	IsUTGST       bool
	TaxableValue  float64
	CGST          float64
	SGST          float64
	IGST          float64
	Cess          float64
	RoundOff      float64
	Total         float64
	GeneratedAt   time.Time
}

// GSTLineRow is one bill_lines row used for rate/HSN splits.
type GSTLineRow struct {
	BillID       string
	Rate         float64
	TaxableValue float64
	CGST         float64
	SGST         float64
	IGST         float64
	Cess         float64
	Quantity     float64
	HSN          string
	Name         string
	Unit         string
	TaxCategory  string
}

// GSTCNRow is the header-level data of an active credit note.
type GSTCNRow struct {
	ID                string
	BillID            string
	ParentInvoiceNo   string
	ParentGeneratedAt time.Time
	ParentStatus      string
	ParentSupplyType  string
	ParentOrderSource string
	ParentEcoGSTIN    string
	CreditNoteNo      string
	Seq               int
	Status            string
	FY                string
	SupplyType        string
	PlaceOfSupply     string
	BuyerGSTIN        string
	IsUTGST           bool
	TaxableValue      float64
	CGST              float64
	SGST              float64
	IGST              float64
	Cess              float64
	Total             float64
	IssuedAt          time.Time
}

// GSTCNLineRow is one credit_note_lines row.
type GSTCNLineRow struct {
	CreditNoteID string
	Rate         float64
	TaxableValue float64
	CGST         float64
	SGST         float64
	IGST         float64
	Cess         float64
	Quantity     float64
	HSN          string
	Name         string
	Unit         string
	TaxCategory  string
}

// FetchGSTReportData pulls all GST bills (fy IS NOT NULL), their lines, and
// every credit note (any status — callers filter, the document summary
// counts them all) issued inside the given range.
// Also returns the count of legacy bills (fy IS NULL) inside the range.
func (r *BillRepository) FetchGSTReportData(ctx context.Context, storeID string, from, to *time.Time) (
	bills []GSTBillRow, lines []GSTLineRow, cns []GSTCNRow, cnLines []GSTCNLineRow, legacyCount int, err error,
) {
	where := "b.store_id = $1 AND b.fy IS NOT NULL"
	args := []interface{}{storeID}
	idx := 2
	if from != nil {
		where += " AND b.generated_at >= " + tsParam(idx)
		args = append(args, tsArg(*from))
		idx++
	}
	if to != nil {
		where += " AND b.generated_at <= " + tsParam(idx)
		args = append(args, tsArg(*to))
		idx++
	}

	legacyWhere := "store_id = $1 AND fy IS NULL"
	largs := []interface{}{storeID}
	lidx := 2
	if from != nil {
		legacyWhere += " AND generated_at >= " + tsParam(lidx)
		largs = append(largs, tsArg(*from))
		lidx++
	}
	if to != nil {
		legacyWhere += " AND generated_at <= " + tsParam(lidx)
		largs = append(largs, tsArg(*to))
	}
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM bills WHERE "+legacyWhere, largs...).Scan(&legacyCount); err != nil {
		return nil, nil, nil, nil, 0, err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT b.id, b.invoice_no, b.fy, b.invoice_seq, b.document_type, b.supply_type, b.place_of_supply,
		       b.buyer_gstin, b.buyer_name, b.order_source, b.status, b.payment_method, b.customer_name,
		       b.is_utgst, b.taxable_value, b.cgst, b.sgst, b.igst, b.cess, b.round_off, b.total,
		       `+tsInstant("b.generated_at")+`, b.eco_gstin
		FROM bills b WHERE `+where+` ORDER BY b.generated_at, b.invoice_seq`, args...)
	if err != nil {
		return nil, nil, nil, nil, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var b GSTBillRow
		var invoiceNo, fy, docType, supplyType, pos, buyerGSTIN, buyerName, src, status, pm, cust, eco sql.NullString
		var seq sql.NullInt64
		if err := rows.Scan(&b.ID, &invoiceNo, &fy, &seq, &docType, &supplyType, &pos,
			&buyerGSTIN, &buyerName, &src, &status, &pm, &cust,
			&b.IsUTGST, &b.TaxableValue, &b.CGST, &b.SGST, &b.IGST, &b.Cess, &b.RoundOff, &b.Total, &b.GeneratedAt, &eco); err != nil {
			return nil, nil, nil, nil, 0, err
		}
		b.InvoiceNo, b.FY, b.DocumentType, b.SupplyType, b.PlaceOfSupply = invoiceNo.String, fy.String, docType.String, supplyType.String, pos.String
		b.BuyerGSTIN, b.BuyerName, b.OrderSource, b.Status = buyerGSTIN.String, buyerName.String, src.String, status.String
		b.PaymentMethod, b.CustomerName = pm.String, cust.String
		b.EcoGSTIN = eco.String
		b.InvoiceSeq = int(seq.Int64)
		if b.OrderSource == "" {
			b.OrderSource = "pos"
		}
		if b.Status == "" {
			b.Status = "active"
		}
		bills = append(bills, b)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, nil, nil, 0, err
	}
	rows.Close()

	if len(bills) == 0 {
		// Still return credit notes in range (they may reference earlier bills).
		bills = []GSTBillRow{}
		lines = []GSTLineRow{}
	} else {
		lrows, err := r.db.QueryContext(ctx, `
			SELECT bl.bill_id, bl.tax_rate, bl.taxable_value, bl.cgst, bl.sgst, bl.igst, bl.cess,
			       bl.quantity, bl.hsn_code, bl.name, bl.unit, bl.tax_category
			FROM bill_lines bl JOIN bills b ON b.id = bl.bill_id
			WHERE `+where, args...)
		if err != nil {
			return nil, nil, nil, nil, 0, err
		}
		defer lrows.Close()
		for lrows.Next() {
			var l GSTLineRow
			var hsn, name, unit, cat sql.NullString
			if err := lrows.Scan(&l.BillID, &l.Rate, &l.TaxableValue, &l.CGST, &l.SGST, &l.IGST, &l.Cess,
				&l.Quantity, &hsn, &name, &unit, &cat); err != nil {
				return nil, nil, nil, nil, 0, err
			}
			l.HSN, l.Name, l.Unit, l.TaxCategory = hsn.String, name.String, unit.String, cat.String
			lines = append(lines, l)
		}
		if err := lrows.Err(); err != nil {
			return nil, nil, nil, nil, 0, err
		}
		lrows.Close()
	}

	// Credit notes: filtered by issued_at so a CN issued in this period
	// against an older bill is still reported now.
	cnWhere := "cn.store_id = $1"
	cargs := []interface{}{storeID}
	cidx := 2
	if from != nil {
		cnWhere += " AND cn.issued_at >= " + tsParam(cidx)
		cargs = append(cargs, tsArg(*from))
		cidx++
	}
	if to != nil {
		cnWhere += " AND cn.issued_at <= " + tsParam(cidx)
		cargs = append(cargs, tsArg(*to))
	}
	crows, err := r.db.QueryContext(ctx, `
		SELECT cn.id, cn.bill_id, cn.credit_note_no, cn.fy, cn.supply_type, cn.place_of_supply,
		       cn.buyer_gstin, cn.is_utgst, cn.taxable_value, cn.cgst, cn.sgst, cn.igst, cn.cess,
		       cn.total, `+tsInstant("cn.issued_at")+`, COALESCE(cn.status, 'active'), cn.seq,
		       b.invoice_no, `+tsInstant("b.generated_at")+`, b.status, b.supply_type,
		       COALESCE(b.order_source, 'pos'), b.eco_gstin
		FROM credit_notes cn LEFT JOIN bills b ON b.id = cn.bill_id WHERE `+cnWhere+` ORDER BY cn.issued_at, cn.seq`, cargs...)
	if err != nil {
		return nil, nil, nil, nil, 0, err
	}
	defer crows.Close()
	cns = []GSTCNRow{}
	for crows.Next() {
		var c GSTCNRow
		var billID, no, fy, st, pos, GSTIN sql.NullString
		var pInv, pStatus, pSupply, pSource, pEco sql.NullString
		var pAt sql.NullTime
		var cnSeq sql.NullInt64
		if err := crows.Scan(&c.ID, &billID, &no, &fy, &st, &pos, &GSTIN, &c.IsUTGST,
			&c.TaxableValue, &c.CGST, &c.SGST, &c.IGST, &c.Cess, &c.Total, &c.IssuedAt, &c.Status, &cnSeq,
			&pInv, &pAt, &pStatus, &pSupply, &pSource, &pEco); err != nil {
			return nil, nil, nil, nil, 0, err
		}
		c.BillID, c.CreditNoteNo, c.FY, c.SupplyType, c.PlaceOfSupply, c.BuyerGSTIN = billID.String, no.String, fy.String, st.String, pos.String, GSTIN.String
		c.Seq = int(cnSeq.Int64)
		c.ParentInvoiceNo = pInv.String
		c.ParentGeneratedAt = pAt.Time
		c.ParentStatus = pStatus.String
		c.ParentSupplyType = pSupply.String
		c.ParentOrderSource = pSource.String
		c.ParentEcoGSTIN = pEco.String
		cns = append(cns, c)
	}
	if err := crows.Err(); err != nil {
		return nil, nil, nil, nil, 0, err
	}
	crows.Close()

	cnLines = []GSTCNLineRow{}
	if len(cns) > 0 {
		clrows, err := r.db.QueryContext(ctx, `
			SELECT cnl.credit_note_id, cnl.tax_rate, cnl.taxable_value, cnl.cgst, cnl.sgst, cnl.igst,
			       cnl.cess, cnl.quantity, cnl.hsn_code, cnl.name, cnl.unit, COALESCE(bl.tax_category, 'taxable')
			FROM credit_note_lines cnl JOIN credit_notes cn ON cn.id = cnl.credit_note_id
			LEFT JOIN bill_lines bl ON bl.id = cnl.bill_line_id
			WHERE `+cnWhere, cargs...)
		if err != nil {
			return nil, nil, nil, nil, 0, err
		}
		defer clrows.Close()
		for clrows.Next() {
			var l GSTCNLineRow
			var hsn, name, unit, cat sql.NullString
			if err := clrows.Scan(&l.CreditNoteID, &l.Rate, &l.TaxableValue, &l.CGST, &l.SGST, &l.IGST,
				&l.Cess, &l.Quantity, &hsn, &name, &unit, &cat); err != nil {
				return nil, nil, nil, nil, 0, err
			}
			l.HSN, l.Name, l.Unit, l.TaxCategory = hsn.String, name.String, unit.String, cat.String
			cnLines = append(cnLines, l)
		}
	}

	return bills, lines, cns, cnLines, legacyCount, nil
}

// GetByID returns a single item (needed by the bill preview endpoint).
func (r *ItemRepository) GetByID(ctx context.Context, id string) (*models.Item, error) {
	var i models.Item
	var desc, hsn, taxCat sql.NullString
	err := r.db.QueryRowContext(ctx,
		"SELECT id, store_id, category_id, name, description, price, hsn_code, tax_percent, tax_category, is_active FROM items WHERE id = $1",
		id).Scan(&i.ID, &i.StoreID, &i.CategoryID, &i.Name, &desc, &i.Price, &hsn, &i.TaxPercent, &taxCat, &i.IsActive)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	i.Description = desc.String
	i.HSNCode = hsn.String
	i.TaxCategory = taxCat.String
	if i.TaxCategory == "" {
		i.TaxCategory = "taxable"
	}
	return &i, nil
}
