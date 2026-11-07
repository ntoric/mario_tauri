package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"cafe-backend/internal/models"

	"github.com/google/uuid"
)

// Subscription errors mapped to specific HTTP statuses by the handler layer.
var (
	ErrPlanInUse                = errors.New("plan is in use by store subscriptions")
	ErrActiveSubscriptionExists = errors.New("store already has an active subscription")
	ErrSubscriptionNotActive    = errors.New("subscription is not active")
	ErrSubscriptionNotRenewable = errors.New("only active or expired subscriptions can be renewed")
	ErrOpenRequestExists        = errors.New("a change request is already open for this subscription")
	ErrRequestNotPending        = errors.New("request is no longer pending")
)

// ==========================================
// SUBSCRIPTION REPOSITORY
// ==========================================

type SubscriptionRepository struct {
	db *sql.DB
}

// addBillingPeriod advances t by one billing period of the given recurring
// type. Bi-annually is billed twice a year (6 months).
func addBillingPeriod(t time.Time, recurringType string) time.Time {
	switch recurringType {
	case "quarterly":
		return t.AddDate(0, 3, 0)
	case "biannually":
		return t.AddDate(0, 6, 0)
	case "yearly":
		return t.AddDate(1, 0, 0)
	default: // monthly
		return t.AddDate(0, 1, 0)
	}
}

// ---------- Plans ----------

const planSelect = `
	SELECT id, name, price, COALESCE(features, '[]'::jsonb), recurring_type, is_active, created_at, updated_at
	FROM subscription_plans
`

func scanPlan(row interface{ Scan(...interface{}) error }) (*models.SubscriptionPlan, error) {
	p := &models.SubscriptionPlan{}
	var features []byte
	if err := row.Scan(&p.ID, &p.Name, &p.Price, &features, &p.RecurringType, &p.IsActive, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return nil, err
	}
	p.Features = []string{}
	_ = json.Unmarshal(features, &p.Features)
	return p, nil
}

// ListPlans returns plans for management. activeOnly limits the result to
// plans that can currently be assigned (used for non-superadmin callers).
func (r *SubscriptionRepository) ListPlans(ctx context.Context, activeOnly bool) ([]models.SubscriptionPlan, error) {
	query := planSelect
	if activeOnly {
		query += `WHERE is_active = true `
	}
	rows, err := r.db.QueryContext(ctx, query+`ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	plans := []models.SubscriptionPlan{}
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, *p)
	}
	return plans, rows.Err()
}

// GetPlanByID returns one plan or nil when it does not exist.
func (r *SubscriptionRepository) GetPlanByID(ctx context.Context, id string) (*models.SubscriptionPlan, error) {
	p, err := scanPlan(r.db.QueryRowContext(ctx, planSelect+`WHERE id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return p, err
}

func (r *SubscriptionRepository) CreatePlan(ctx context.Context, p *models.SubscriptionPlan) (*models.SubscriptionPlan, error) {
	p.ID = uuid.New().String()
	// Sent as string: the pool runs in simple-protocol mode where []byte is
	// encoded as bytea hex, which jsonb rejects.
	features := string(mustJSON(p.Features))
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO subscription_plans (id, name, price, features, recurring_type, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, p.ID, p.Name, p.Price, features, p.RecurringType, p.IsActive)
	if err != nil {
		return nil, err
	}
	return r.GetPlanByID(ctx, p.ID)
}

func (r *SubscriptionRepository) UpdatePlan(ctx context.Context, p *models.SubscriptionPlan) (*models.SubscriptionPlan, error) {
	features := string(mustJSON(p.Features))
	res, err := r.db.ExecContext(ctx, `
		UPDATE subscription_plans
		SET name = $2, price = $3, features = $4, recurring_type = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, p.ID, p.Name, p.Price, features, p.RecurringType, p.IsActive)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, nil
	}
	return r.GetPlanByID(ctx, p.ID)
}

// DeletePlan removes a plan. Plans referenced by any subscription period are
// kept (history integrity) — callers should deactivate them instead.
func (r *SubscriptionRepository) DeletePlan(ctx context.Context, id string) error {
	var refs int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM store_subscriptions WHERE plan_id = $1`, id).Scan(&refs); err != nil {
		return err
	}
	if refs > 0 {
		return ErrPlanInUse
	}
	res, err := r.db.ExecContext(ctx, `DELETE FROM subscription_plans WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ---------- Subscriptions ----------

const subscriptionSelect = `
	SELECT s.id, s.store_id, COALESCE(st.name, ''), COALESCE(st.branch, ''),
		COALESCE(s.plan_id, ''), s.plan_name, s.plan_price, s.recurring_type, s.status,
		s.start_date, s.end_date, s.auto_renew, s.show_price, s.renewal_count,
		COALESCE(s.created_by, ''), s.created_at, s.updated_at
	FROM store_subscriptions s
	LEFT JOIN stores st ON st.id = s.store_id
`

func scanSubscription(row interface{ Scan(...interface{}) error }) (*models.StoreSubscription, error) {
	s := &models.StoreSubscription{}
	err := row.Scan(
		&s.ID, &s.StoreID, &s.StoreName, &s.StoreBranch,
		&s.PlanID, &s.PlanName, &s.PlanPrice, &s.RecurringType, &s.Status,
		&s.StartDate, &s.EndDate, &s.AutoRenew, &s.ShowPrice, &s.RenewalCount,
		&s.CreatedBy, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return s, nil
}

// execer is satisfied by both *sql.DB and *sql.Tx so the event writer works
// inside and outside transactions.
type execer interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func mustJSON(v interface{}) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("[]")
	}
	return b
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func insertSubscriptionEvent(ctx context.Context, ex execer, storeID, subID, action, fromPlanID, fromPlanName, toPlanID, toPlanName, notes string, createdBy *string) error {
	_, err := ex.ExecContext(ctx, `
		INSERT INTO subscription_events
			(store_id, subscription_id, action, from_plan_id, from_plan_name, to_plan_id, to_plan_name, notes, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, storeID, subID, action, nullStr(fromPlanID), nullStr(fromPlanName), nullStr(toPlanID), nullStr(toPlanName), nullStr(notes), createdBy)
	return err
}

// ListSubscriptions returns subscription periods, optionally filtered by
// store and/or status ("all"/"" = every period). Active rows sort first.
func (r *SubscriptionRepository) ListSubscriptions(ctx context.Context, storeID, status string) ([]models.StoreSubscription, error) {
	query := subscriptionSelect
	var conds []string
	var args []interface{}
	if storeID != "" {
		args = append(args, storeID)
		conds = append(conds, fmt.Sprintf("s.store_id = $%d", len(args)))
	}
	if status != "" && status != "all" {
		args = append(args, status)
		conds = append(conds, fmt.Sprintf("s.status = $%d", len(args)))
	}
	if len(conds) > 0 {
		query += "WHERE " + strings.Join(conds, " AND ") + " "
	}
	query += `ORDER BY CASE s.status WHEN 'active' THEN 0 ELSE 1 END, s.end_date DESC`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	subs := []models.StoreSubscription{}
	for rows.Next() {
		s, err := scanSubscription(rows)
		if err != nil {
			return nil, err
		}
		subs = append(subs, *s)
	}
	return subs, rows.Err()
}

// GetSubscriptionByID returns one subscription period or nil.
func (r *SubscriptionRepository) GetSubscriptionByID(ctx context.Context, id string) (*models.StoreSubscription, error) {
	s, err := scanSubscription(r.db.QueryRowContext(ctx, subscriptionSelect+`WHERE s.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// GetCurrentForStore returns the store's active subscription, falling back to
// the most recently ended period so store users still see what their plan was
// (expired/cancelled states are displayed by the UI). Nil when the store has
// never had a subscription.
func (r *SubscriptionRepository) GetCurrentForStore(ctx context.Context, storeID string) (*models.StoreSubscription, error) {
	s, err := scanSubscription(r.db.QueryRowContext(ctx,
		subscriptionSelect+`WHERE s.store_id = $1 AND s.status = 'active' ORDER BY s.end_date DESC LIMIT 1`, storeID))
	if err == nil {
		return s, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	s, err = scanSubscription(r.db.QueryRowContext(ctx,
		subscriptionSelect+`WHERE s.store_id = $1 ORDER BY s.end_date DESC, s.created_at DESC LIMIT 1`, storeID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return s, err
}

// ProcessDue lazily advances the billing clock for active subscriptions whose
// end_date has passed: auto-renewing subscriptions roll forward (one catch-up
// 'renewed' event per subscription) and non-renewing ones are marked expired.
// Called on reads so statuses stay fresh without a background scheduler.
func (r *SubscriptionRepository) ProcessDue(ctx context.Context) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	type dueSub struct {
		id, storeID, planID, planName, recurringType string
		planPrice                                    float64
		endDate                                      time.Time
		autoRenew, showPrice                         bool
	}
	rows, err := tx.QueryContext(ctx, `
		SELECT id, store_id, COALESCE(plan_id, ''), plan_name, plan_price, recurring_type, end_date, auto_renew, show_price
		FROM store_subscriptions
		WHERE status = 'active' AND end_date <= CURRENT_TIMESTAMP
		FOR UPDATE`)
	if err != nil {
		return err
	}
	var due []dueSub
	for rows.Next() {
		var d dueSub
		if err := rows.Scan(&d.id, &d.storeID, &d.planID, &d.planName, &d.planPrice, &d.recurringType, &d.endDate, &d.autoRenew, &d.showPrice); err != nil {
			rows.Close()
			return err
		}
		due = append(due, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	now := time.Now()
	for _, d := range due {
		// An approved change request takes precedence over renewal/expiry:
		// it is applied exactly at the cycle boundary.
		var reqID, reqType, reqPlanID, reqPlanName, reqRecurring, reqActor string
		var reqPrice float64
		reqErr := tx.QueryRowContext(ctx, `
			SELECT id, type, COALESCE(requested_plan_id, ''), COALESCE(requested_plan_name, ''),
				COALESCE(requested_plan_price, 0), COALESCE(requested_recurring_type, ''),
				COALESCE(resolved_by, requested_by, '')
			FROM subscription_requests
			WHERE subscription_id = $1 AND status = 'approved'
		`, d.id).Scan(&reqID, &reqType, &reqPlanID, &reqPlanName, &reqPrice, &reqRecurring, &reqActor)
		if reqErr != nil && !errors.Is(reqErr, sql.ErrNoRows) {
			return reqErr
		}

		if reqErr == nil {
			if err := r.applyApprovedRequest(ctx, tx, d.id, d.storeID, d.planID, d.planName, d.endDate,
				reqID, reqType, reqPlanID, reqPlanName, reqPrice, reqRecurring, reqActor, d.autoRenew, d.showPrice); err != nil {
				return err
			}
			continue
		}

		if d.autoRenew {
			newEnd := d.endDate
			periods := 0
			for !newEnd.After(now) {
				periodStart := newEnd
				newEnd = addBillingPeriod(newEnd, d.recurringType)
				periods++
				// Each elapsed cycle gets an auto-recorded payment.
				if err := insertPayment(ctx, tx, d.storeID, d.id, d.planPrice, "auto", "paid",
					&periodStart, &newEnd, nil, "Auto-recorded on renewal"); err != nil {
					return err
				}
			}
			if _, err := tx.ExecContext(ctx, `
				UPDATE store_subscriptions
				SET end_date = $2, renewal_count = renewal_count + $3, updated_at = CURRENT_TIMESTAMP
				WHERE id = $1
			`, d.id, newEnd, periods); err != nil {
				return err
			}
			// A still-pending request now applies at the new cycle boundary.
			if _, err := tx.ExecContext(ctx, `
				UPDATE subscription_requests SET effective_date = $2, updated_at = CURRENT_TIMESTAMP
				WHERE subscription_id = $1 AND status = 'pending'
			`, d.id, newEnd); err != nil {
				return err
			}
			if err := insertSubscriptionEvent(ctx, tx, d.storeID, d.id, "renewed",
				d.planID, d.planName, d.planID, d.planName,
				fmt.Sprintf("Auto-renewed %d period(s); next renewal on %s", periods, newEnd.Format("2006-01-02")),
				nil); err != nil {
				return err
			}
		} else {
			if _, err := tx.ExecContext(ctx, `
				UPDATE store_subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1
			`, d.id); err != nil {
				return err
			}
			// Open requests die with the subscription — they can no longer be
			// approved or applied.
			if err := cancelOpenRequests(ctx, tx, d.id, "Subscription expired before the request was resolved", ""); err != nil {
				return err
			}
			if err := insertSubscriptionEvent(ctx, tx, d.storeID, d.id, "expired",
				d.planID, d.planName, "", "", "Subscription period ended without renewal",
				nil); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

// applyApprovedRequest executes an approved change request at the cycle
// boundary inside ProcessDue's transaction: cancel closes the period as
// 'cancelled', plan changes close it as 'replaced' and open a new period on
// the snapshotted plan. The request is marked 'applied'.
func (r *SubscriptionRepository) applyApprovedRequest(ctx context.Context, tx *sql.Tx,
	subID, storeID, fromPlanID, fromPlanName string, cycleEnd time.Time,
	reqID, reqType, reqPlanID, reqPlanName string, reqPrice float64, reqRecurring, actor string, autoRenew, showPrice bool) error {

	if reqType == "cancel" {
		if _, err := tx.ExecContext(ctx,
			`UPDATE store_subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
			subID); err != nil {
			return err
		}
		if err := insertSubscriptionEvent(ctx, tx, storeID, subID, "cancelled",
			fromPlanID, fromPlanName, "", "",
			"Cancelled at end of cycle per approved request", strPtr(actor)); err != nil {
			return err
		}
	} else {
		if _, err := tx.ExecContext(ctx,
			`UPDATE store_subscriptions SET status = 'replaced', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
			subID); err != nil {
			return err
		}
		if err := insertSubscriptionEvent(ctx, tx, storeID, subID, "replaced",
			fromPlanID, fromPlanName, reqPlanID, reqPlanName,
			fmt.Sprintf("Superseded by approved %s to %s", reqType, reqPlanName), strPtr(actor)); err != nil {
			return err
		}

		newSubID := uuid.New().String()
		newEnd := addBillingPeriod(cycleEnd, reqRecurring)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO store_subscriptions
				(id, store_id, plan_id, plan_name, plan_price, recurring_type, status, start_date, end_date, auto_renew, show_price, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11)
		`, newSubID, storeID, nullStr(reqPlanID), reqPlanName, reqPrice, reqRecurring, cycleEnd, newEnd, autoRenew, showPrice, nullStr(actor)); err != nil {
			return err
		}
		if err := insertSubscriptionEvent(ctx, tx, storeID, newSubID, reqType,
			fromPlanID, fromPlanName, reqPlanID, reqPlanName,
			fmt.Sprintf("Approved %s applied at end of cycle; next renewal on %s", reqType, newEnd.Format("2006-01-02")),
			strPtr(actor)); err != nil {
			return err
		}
	}

	_, err := tx.ExecContext(ctx,
		`UPDATE subscription_requests SET status = 'applied', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, reqID)
	return err
}

// CreateSubscription starts a new billing period for a store. The store row
// is locked so concurrent creates can't bypass the one-active-subscription
// unique index.
func (r *SubscriptionRepository) CreateSubscription(ctx context.Context, storeID string, plan *models.SubscriptionPlan, start time.Time, autoRenew, showPrice bool, userID string) (*models.StoreSubscription, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `SELECT id FROM stores WHERE id = $1 FOR UPDATE`, storeID); err != nil {
		return nil, err
	}

	var existing string
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM store_subscriptions WHERE store_id = $1 AND status = 'active'`, storeID).Scan(&existing)
	if err == nil {
		return nil, ErrActiveSubscriptionExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	subID := uuid.New().String()
	end := addBillingPeriod(start, plan.RecurringType)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO store_subscriptions
			(id, store_id, plan_id, plan_name, plan_price, recurring_type, status, start_date, end_date, auto_renew, show_price, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11)
	`, subID, storeID, plan.ID, plan.Name, plan.Price, plan.RecurringType, start, end, autoRenew, showPrice, userID); err != nil {
		return nil, err
	}

	verb := "expires"
	if autoRenew {
		verb = "renews"
	}
	if err := insertSubscriptionEvent(ctx, tx, storeID, subID, "created",
		"", "", plan.ID, plan.Name,
		fmt.Sprintf("Subscription started on plan %s; %s on %s", plan.Name, verb, end.Format("2006-01-02")),
		&userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetSubscriptionByID(ctx, subID)
}

// subLock is the row data needed by mutations that take FOR UPDATE locks.
type subLock struct {
	id, storeID, planID, planName, recurringType, status string
	planPrice                                            float64
	endDate                                              time.Time
	autoRenew, showPrice                                 bool
}

func lockSubscription(ctx context.Context, tx *sql.Tx, id string) (*subLock, error) {
	l := &subLock{}
	err := tx.QueryRowContext(ctx, `
		SELECT id, store_id, COALESCE(plan_id, ''), plan_name, plan_price, recurring_type, status, end_date, auto_renew, show_price
		FROM store_subscriptions WHERE id = $1 FOR UPDATE
	`, id).Scan(&l.id, &l.storeID, &l.planID, &l.planName, &l.planPrice, &l.recurringType, &l.status, &l.endDate, &l.autoRenew, &l.showPrice)
	if err != nil {
		return nil, err
	}
	return l, nil
}

// SetAutoRenew toggles auto-renewal on an active subscription and records the
// change in history.
func (r *SubscriptionRepository) SetAutoRenew(ctx context.Context, id string, autoRenew bool, userID string) (*models.StoreSubscription, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	l, err := lockSubscription(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if l.status != "active" {
		return nil, ErrSubscriptionNotActive
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE store_subscriptions SET auto_renew = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		id, autoRenew); err != nil {
		return nil, err
	}

	action := "auto_renew_disabled"
	note := fmt.Sprintf("Auto-renewal turned off; subscription expires on %s", l.endDate.Format("2006-01-02"))
	if autoRenew {
		action = "auto_renew_enabled"
		note = fmt.Sprintf("Auto-renewal turned on; next renewal on %s", l.endDate.Format("2006-01-02"))
	}
	if err := insertSubscriptionEvent(ctx, tx, l.storeID, id, action,
		l.planID, l.planName, l.planID, l.planName, note, &userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetSubscriptionByID(ctx, id)
}

// Cancel ends an active subscription immediately.
func (r *SubscriptionRepository) CancelSubscription(ctx context.Context, id, userID string) (*models.StoreSubscription, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	l, err := lockSubscription(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if l.status != "active" {
		return nil, ErrSubscriptionNotActive
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE store_subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		id); err != nil {
		return nil, err
	}
	if err := cancelOpenRequests(ctx, tx, id, "Superseded by direct cancellation", userID); err != nil {
		return nil, err
	}
	if err := insertSubscriptionEvent(ctx, tx, l.storeID, id, "cancelled",
		l.planID, l.planName, "", "", "Subscription cancelled by admin", &userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetSubscriptionByID(ctx, id)
}

// RenewSubscription extends an active or expired subscription by one billing
// period measured from max(now, end_date). Cancelled/replaced periods cannot
// be renewed — a new subscription should be created instead.
func (r *SubscriptionRepository) RenewSubscription(ctx context.Context, id, userID string) (*models.StoreSubscription, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	l, err := lockSubscription(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if l.status != "active" && l.status != "expired" {
		return nil, ErrSubscriptionNotRenewable
	}

	base := l.endDate
	if base.Before(time.Now()) {
		base = time.Now()
	}
	newEnd := addBillingPeriod(base, l.recurringType)
	if _, err := tx.ExecContext(ctx, `
		UPDATE store_subscriptions
		SET status = 'active', end_date = $2, renewal_count = renewal_count + 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, id, newEnd); err != nil {
		return nil, err
	}
	if err := insertSubscriptionEvent(ctx, tx, l.storeID, id, "renewed",
		l.planID, l.planName, l.planID, l.planName,
		fmt.Sprintf("Manually renewed; next renewal on %s", newEnd.Format("2006-01-02")),
		&userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetSubscriptionByID(ctx, id)
}

// ChangePlan replaces the active subscription's plan. The current period is
// closed (status 'replaced', ended at start) and a fresh period on the new
// plan begins immediately. The event is classified as an upgrade/downgrade
// by comparing plan prices (equal price → plan_changed).
func (r *SubscriptionRepository) ChangePlan(ctx context.Context, subID string, newPlan *models.SubscriptionPlan, start time.Time, autoRenew, showPrice *bool, userID string) (*models.StoreSubscription, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	l, err := lockSubscription(ctx, tx, subID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if l.status != "active" {
		return nil, ErrSubscriptionNotActive
	}

	action := "plan_changed"
	if newPlan.Price > l.planPrice {
		action = "upgraded"
	} else if newPlan.Price < l.planPrice {
		action = "downgraded"
	}

	newAutoRenew := l.autoRenew
	if autoRenew != nil {
		newAutoRenew = *autoRenew
	}
	newShowPrice := l.showPrice
	if showPrice != nil {
		newShowPrice = *showPrice
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE store_subscriptions SET status = 'replaced', end_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		subID, start); err != nil {
		return nil, err
	}
	if err := cancelOpenRequests(ctx, tx, subID, "Superseded by direct plan change", userID); err != nil {
		return nil, err
	}
	if err := insertSubscriptionEvent(ctx, tx, l.storeID, subID, "replaced",
		l.planID, l.planName, newPlan.ID, newPlan.Name,
		fmt.Sprintf("Superseded by plan change to %s", newPlan.Name),
		&userID); err != nil {
		return nil, err
	}

	newSubID := uuid.New().String()
	newEnd := addBillingPeriod(start, newPlan.RecurringType)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO store_subscriptions
			(id, store_id, plan_id, plan_name, plan_price, recurring_type, status, start_date, end_date, auto_renew, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11)
	`, newSubID, l.storeID, newPlan.ID, newPlan.Name, newPlan.Price, newPlan.RecurringType, start, newEnd, newAutoRenew, newShowPrice, userID); err != nil {
		return nil, err
	}
	if err := insertSubscriptionEvent(ctx, tx, l.storeID, newSubID, action,
		l.planID, l.planName, newPlan.ID, newPlan.Name,
		fmt.Sprintf("Plan changed from %s to %s; next renewal on %s", l.planName, newPlan.Name, newEnd.Format("2006-01-02")),
		&userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetSubscriptionByID(ctx, newSubID)
}

// ListEvents returns the subscription audit log, newest first, optionally
// filtered to one store.
func (r *SubscriptionRepository) ListEvents(ctx context.Context, storeID string) ([]models.SubscriptionEvent, error) {
	query := `
		SELECT e.id, e.store_id, COALESCE(st.name, ''), COALESCE(e.subscription_id, ''),
			e.action, COALESCE(e.from_plan_id, ''), COALESCE(e.from_plan_name, ''),
			COALESCE(e.to_plan_id, ''), COALESCE(e.to_plan_name, ''), COALESCE(e.notes, ''),
			COALESCE(e.created_by, ''), COALESCE(u.name, ''), e.created_at
		FROM subscription_events e
		LEFT JOIN stores st ON st.id = e.store_id
		LEFT JOIN users u ON u.id = e.created_by
	`
	var args []interface{}
	if storeID != "" {
		query += `WHERE e.store_id = $1 `
		args = append(args, storeID)
	}
	query += `ORDER BY e.created_at DESC, e.id DESC LIMIT 500`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []models.SubscriptionEvent{}
	for rows.Next() {
		var e models.SubscriptionEvent
		if err := rows.Scan(
			&e.ID, &e.StoreID, &e.StoreName, &e.SubscriptionID,
			&e.Action, &e.FromPlanID, &e.FromPlanName,
			&e.ToPlanID, &e.ToPlanName, &e.Notes,
			&e.CreatedBy, &e.CreatedByName, &e.CreatedAt,
		); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

// ---------- Change requests ----------

const requestSelect = `
	SELECT r.id, r.store_id, COALESCE(st.name, ''), COALESCE(st.branch, ''),
		r.subscription_id, r.type, COALESCE(r.current_plan_name, ''),
		COALESCE(r.requested_plan_id, ''), COALESCE(r.requested_plan_name, ''),
		COALESCE(r.requested_plan_price, 0), COALESCE(r.requested_recurring_type, ''),
		r.effective_date, r.status, COALESCE(r.note, ''),
		COALESCE(r.requested_by, ''), COALESCE(ru.name, ''), r.created_at,
		COALESCE(r.resolved_by, ''), COALESCE(rv.name, ''), r.resolved_at
	FROM subscription_requests r
	LEFT JOIN stores st ON st.id = r.store_id
	LEFT JOIN users ru ON ru.id = r.requested_by
	LEFT JOIN users rv ON rv.id = r.resolved_by
`

func scanRequest(row interface{ Scan(...interface{}) error }) (*models.SubscriptionChangeRequest, error) {
	q := &models.SubscriptionChangeRequest{}
	var effectiveAt, resolvedAt sql.NullTime
	err := row.Scan(
		&q.ID, &q.StoreID, &q.StoreName, &q.StoreBranch,
		&q.SubscriptionID, &q.Type, &q.CurrentPlanName,
		&q.RequestedPlanID, &q.RequestedPlanName,
		&q.RequestedPlanPrice, &q.RequestedRecurringType,
		&effectiveAt, &q.Status, &q.Note,
		&q.RequestedBy, &q.RequestedByName, &q.CreatedAt,
		&q.ResolvedBy, &q.ResolvedByName, &resolvedAt,
	)
	if err != nil {
		return nil, err
	}
	if effectiveAt.Valid {
		q.EffectiveDate = &effectiveAt.Time
	}
	if resolvedAt.Valid {
		q.ResolvedAt = &resolvedAt.Time
	}
	return q, nil
}

// GetChangeRequestByID returns one request or nil.
func (r *SubscriptionRepository) GetChangeRequestByID(ctx context.Context, id string) (*models.SubscriptionChangeRequest, error) {
	q, err := scanRequest(r.db.QueryRowContext(ctx, requestSelect+`WHERE r.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return q, err
}

// GetOpenRequestForSubscription returns the pending or approved (not yet
// applied) request for a subscription, or nil.
func (r *SubscriptionRepository) GetOpenRequestForSubscription(ctx context.Context, subID string) (*models.SubscriptionChangeRequest, error) {
	q, err := scanRequest(r.db.QueryRowContext(ctx,
		requestSelect+`WHERE r.subscription_id = $1 AND r.status IN ('pending', 'approved') ORDER BY r.created_at DESC LIMIT 1`, subID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return q, err
}

// ListChangeRequests returns requests for the admin inbox, optionally
// filtered by store and status. Open requests sort first.
func (r *SubscriptionRepository) ListChangeRequests(ctx context.Context, storeID, status string) ([]models.SubscriptionChangeRequest, error) {
	query := requestSelect
	var conds []string
	var args []interface{}
	if storeID != "" {
		args = append(args, storeID)
		conds = append(conds, fmt.Sprintf("r.store_id = $%d", len(args)))
	}
	if status != "" && status != "all" {
		args = append(args, status)
		conds = append(conds, fmt.Sprintf("r.status = $%d", len(args)))
	}
	if len(conds) > 0 {
		query += "WHERE " + strings.Join(conds, " AND ") + " "
	}
	query += `ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 500`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	requests := []models.SubscriptionChangeRequest{}
	for rows.Next() {
		q, err := scanRequest(rows)
		if err != nil {
			return nil, err
		}
		requests = append(requests, *q)
	}
	return requests, rows.Err()
}

// CreateChangeRequest files an upgrade/downgrade/plan_change/cancel request
// against the store's active subscription. plan is nil for cancellations;
// for plan changes its details are snapshotted onto the request so applying
// it later doesn't depend on the plan's current state.
func (r *SubscriptionRepository) CreateChangeRequest(ctx context.Context, subID, reqType string, plan *models.SubscriptionPlan, userID string) (*models.SubscriptionChangeRequest, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	l, err := lockSubscription(ctx, tx, subID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if l.status != "active" {
		return nil, ErrSubscriptionNotActive
	}

	var open string
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM subscription_requests WHERE subscription_id = $1 AND status IN ('pending', 'approved')`, subID).Scan(&open)
	if err == nil {
		return nil, ErrOpenRequestExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	reqID := uuid.New().String()
	var planID, planName, planRecurring interface{}
	var planPrice float64
	if plan != nil {
		planID, planName, planRecurring, planPrice = plan.ID, plan.Name, plan.RecurringType, plan.Price
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO subscription_requests
			(id, store_id, subscription_id, type, current_plan_name,
			 requested_plan_id, requested_plan_name, requested_plan_price, requested_recurring_type,
			 effective_date, status, requested_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
	`, reqID, l.storeID, subID, reqType, l.planName,
		planID, planName, planPrice, planRecurring,
		l.endDate, userID); err != nil {
		return nil, err
	}

	var note string
	var toPlanID, toPlanName string
	if plan != nil {
		toPlanID, toPlanName = plan.ID, plan.Name
		typeLabel := map[string]string{
			"upgrade": "Upgrade", "downgrade": "Downgrade", "plan_change": "Plan change",
		}[reqType]
		note = fmt.Sprintf("%s to %s requested — effective %s, pending admin approval",
			typeLabel, plan.Name, l.endDate.Format("2006-01-02"))
	} else {
		note = fmt.Sprintf("Cancellation requested — effective %s, pending admin approval",
			l.endDate.Format("2006-01-02"))
	}
	if err := insertSubscriptionEvent(ctx, tx, l.storeID, subID, "request_submitted",
		l.planID, l.planName, toPlanID, toPlanName, note, &userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetChangeRequestByID(ctx, reqID)
}

// WithdrawChangeRequest cancels a still-pending request (store user action).
func (r *SubscriptionRepository) WithdrawChangeRequest(ctx context.Context, reqID, userID string) (*models.SubscriptionChangeRequest, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var storeID, subID, status, planName string
	err = tx.QueryRowContext(ctx, `
		SELECT r.store_id, r.subscription_id, r.status, s.plan_name
		FROM subscription_requests r
		JOIN store_subscriptions s ON s.id = r.subscription_id
		WHERE r.id = $1 FOR UPDATE OF r
	`, reqID).Scan(&storeID, &subID, &status, &planName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if status != "pending" {
		return nil, ErrRequestNotPending
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE subscription_requests SET status = 'cancelled', resolved_by = $2, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		reqID, userID); err != nil {
		return nil, err
	}
	if err := insertSubscriptionEvent(ctx, tx, storeID, subID, "request_withdrawn",
		"", planName, "", planName, "Change request withdrawn by store user", &userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetChangeRequestByID(ctx, reqID)
}

// ApproveChangeRequest marks a pending request approved; the change itself is
// applied at the end of the current cycle by ProcessDue.
func (r *SubscriptionRepository) ApproveChangeRequest(ctx context.Context, reqID, userID string) (*models.SubscriptionChangeRequest, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var storeID, subID, reqType, status, planName, reqPlanName string
	var effectiveAt sql.NullTime
	err = tx.QueryRowContext(ctx, `
		SELECT r.store_id, r.subscription_id, r.type, r.status, s.plan_name,
			COALESCE(r.requested_plan_name, ''), r.effective_date
		FROM subscription_requests r
		JOIN store_subscriptions s ON s.id = r.subscription_id
		WHERE r.id = $1 FOR UPDATE OF r
	`, reqID).Scan(&storeID, &subID, &reqType, &status, &planName, &reqPlanName, &effectiveAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if status != "pending" {
		return nil, ErrRequestNotPending
	}

	// The subscription must still be active — approval of a stale request
	// would silently never apply.
	var subStatus string
	if err := tx.QueryRowContext(ctx,
		`SELECT status FROM store_subscriptions WHERE id = $1`, subID).Scan(&subStatus); err != nil {
		return nil, err
	}
	if subStatus != "active" {
		return nil, ErrSubscriptionNotActive
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE subscription_requests
		SET status = 'approved', resolved_by = $2, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, reqID, userID); err != nil {
		return nil, err
	}

	actionLabel := "cancellation"
	if reqType != "cancel" {
		actionLabel = reqType + " to " + reqPlanName
	}
	note := fmt.Sprintf("Request approved — %s takes effect %s", actionLabel,
		effectiveAt.Time.Format("2006-01-02"))
	if err := insertSubscriptionEvent(ctx, tx, storeID, subID, "request_approved",
		"", planName, "", reqPlanName, note, &userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetChangeRequestByID(ctx, reqID)
}

// RejectChangeRequest marks a pending request rejected with an optional note.
func (r *SubscriptionRepository) RejectChangeRequest(ctx context.Context, reqID, note, userID string) (*models.SubscriptionChangeRequest, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var storeID, subID, status, planName string
	err = tx.QueryRowContext(ctx, `
		SELECT r.store_id, r.subscription_id, r.status, s.plan_name
		FROM subscription_requests r
		JOIN store_subscriptions s ON s.id = r.subscription_id
		WHERE r.id = $1 FOR UPDATE OF r
	`, reqID).Scan(&storeID, &subID, &status, &planName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if status != "pending" {
		return nil, ErrRequestNotPending
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE subscription_requests
		SET status = 'rejected', note = $2, resolved_by = $3, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, reqID, nullStr(note), userID); err != nil {
		return nil, err
	}

	eventNote := "Change request rejected"
	if note != "" {
		eventNote = "Change request rejected: " + note
	}
	if err := insertSubscriptionEvent(ctx, tx, storeID, subID, "request_rejected",
		"", planName, "", "", eventNote, &userID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return r.GetChangeRequestByID(ctx, reqID)
}

// cancelOpenRequests resolves any pending/approved request on a subscription
// that an admin action directly replaced. Runs inside the caller's tx.
func cancelOpenRequests(ctx context.Context, tx *sql.Tx, subID, reason, userID string) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE subscription_requests
		SET status = 'cancelled', note = $2, resolved_by = $3, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
		WHERE subscription_id = $1 AND status IN ('pending', 'approved')
	`, subID, reason, nullStr(userID))
	return err
}

// ---------- Payments ----------

const paymentSelect = `
	SELECT p.id, p.store_id, COALESCE(st.name, ''), COALESCE(st.branch, ''),
		p.subscription_id, COALESCE(s.plan_name, ''),
		p.amount, p.method, p.status, p.period_start, p.period_end,
		p.paid_at, COALESCE(p.recorded_by, ''), COALESCE(u.name, ''),
		COALESCE(p.notes, ''), p.created_at
	FROM subscription_payments p
	LEFT JOIN stores st ON st.id = p.store_id
	LEFT JOIN store_subscriptions s ON s.id = p.subscription_id
	LEFT JOIN users u ON u.id = p.recorded_by
`

func scanPayment(row interface{ Scan(...interface{}) error }) (*models.SubscriptionPayment, error) {
	p := &models.SubscriptionPayment{}
	var ps, pe sql.NullTime
	err := row.Scan(
		&p.ID, &p.StoreID, &p.StoreName, &p.StoreBranch,
		&p.SubscriptionID, &p.PlanName,
		&p.Amount, &p.Method, &p.Status, &ps, &pe,
		&p.PaidAt, &p.RecordedBy, &p.RecordedByName,
		&p.Notes, &p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if ps.Valid {
		p.PeriodStart = &ps.Time
	}
	if pe.Valid {
		p.PeriodEnd = &pe.Time
	}
	return p, nil
}

func insertPayment(ctx context.Context, ex execer, storeID, subID string, amount float64, method, status string, periodStart, periodEnd *time.Time, recordedBy *string, notes string) error {
	_, err := ex.ExecContext(ctx, `
		INSERT INTO subscription_payments
			(id, store_id, subscription_id, amount, method, status, period_start, period_end, recorded_by, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, uuid.New().String(), storeID, subID, amount, method, status, periodStart, periodEnd, recordedBy, nullStr(notes))
	return err
}

// ListPayments returns the payment ledger, optionally filtered by store or
// subscription. Newest first.
func (r *SubscriptionRepository) ListPayments(ctx context.Context, storeID, subID string) ([]models.SubscriptionPayment, error) {
	query := paymentSelect
	var conds []string
	var args []interface{}
	if storeID != "" {
		args = append(args, storeID)
		conds = append(conds, fmt.Sprintf("p.store_id = $%d", len(args)))
	}
	if subID != "" {
		args = append(args, subID)
		conds = append(conds, fmt.Sprintf("p.subscription_id = $%d", len(args)))
	}
	if len(conds) > 0 {
		query += "WHERE " + strings.Join(conds, " AND ") + " "
	}
	query += `ORDER BY p.created_at DESC LIMIT 500`

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	payments := []models.SubscriptionPayment{}
	for rows.Next() {
		p, err := scanPayment(rows)
		if err != nil {
			return nil, err
		}
		payments = append(payments, *p)
	}
	return payments, rows.Err()
}

// RecordPayment writes a manual payment for a subscription. When renew is
// set the payment additionally renews the subscription by one billing period
// measured from max(now, end_date) — the only way non-auto-renewing
// subscriptions roll forward.
func (r *SubscriptionRepository) RecordPayment(ctx context.Context, subID string, amount float64, method, notes string, renew bool, userID string) (*models.SubscriptionPayment, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	l, err := lockSubscription(ctx, tx, subID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if renew && l.status != "active" && l.status != "expired" {
		return nil, ErrSubscriptionNotRenewable
	}

	periodStart := l.endDate
	periodEnd := l.endDate
	if renew {
		base := l.endDate
		if base.Before(time.Now()) {
			base = time.Now()
		}
		periodStart = base
		periodEnd = addBillingPeriod(base, l.recurringType)
		if _, err := tx.ExecContext(ctx, `
			UPDATE store_subscriptions
			SET status = 'active', end_date = $2, renewal_count = renewal_count + 1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, subID, periodEnd); err != nil {
			return nil, err
		}
	}

	if err := insertPayment(ctx, tx, l.storeID, subID, amount, method, "paid", &periodStart, &periodEnd, &userID, notes); err != nil {
		return nil, err
	}
	if renew {
		if err := insertSubscriptionEvent(ctx, tx, l.storeID, subID, "renewed",
			l.planID, l.planName, l.planID, l.planName,
			fmt.Sprintf("Renewed via recorded payment of %.2f; next renewal on %s", amount, periodEnd.Format("2006-01-02")),
			&userID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	row := r.db.QueryRowContext(ctx, paymentSelect+`WHERE p.subscription_id = $1 ORDER BY p.created_at DESC LIMIT 1`, subID)
	return scanPayment(row)
}

// SetShowPrice toggles price visibility for store users on the My Plan page.
func (r *SubscriptionRepository) SetShowPrice(ctx context.Context, id string, showPrice bool, userID string) (*models.StoreSubscription, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	l, err := lockSubscription(ctx, tx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE store_subscriptions SET show_price = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		id, showPrice); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	_ = l
	return r.GetSubscriptionByID(ctx, id)
}
