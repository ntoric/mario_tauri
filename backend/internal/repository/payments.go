package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"cafe-backend/internal/models"

	"github.com/google/uuid"
)

// Payment-order errors mapped to HTTP statuses by the handler layer.
var (
	ErrPaymentOrderNotPayable = errors.New("payment order can no longer be fulfilled")
)

// ---------- Payment orders (gateway checkout sessions) ----------

const paymentOrderSelect = `
	SELECT o.id, o.gateway, o.store_id, COALESCE(st.name, ''),
		COALESCE(o.subscription_id, ''), COALESCE(o.plan_id, ''),
		o.plan_name, o.plan_price, o.recurring_type, o.amount, o.currency,
		o.status, COALESCE(o.payment_session_id, ''), COALESCE(o.cf_payment_id, ''),
		COALESCE(o.payment_id, ''), COALESCE(o.created_by, ''), o.created_at, o.updated_at
	FROM payment_orders o
	LEFT JOIN stores st ON st.id = o.store_id
`

func scanPaymentOrder(row interface{ Scan(...interface{}) error }) (*models.PaymentOrder, error) {
	o := &models.PaymentOrder{}
	var paymentID string
	err := row.Scan(
		&o.ID, &o.Gateway, &o.StoreID, &o.StoreName,
		&o.SubscriptionID, &o.PlanID, &o.PlanName, &o.PlanPrice, &o.RecurringType,
		&o.Amount, &o.Currency, &o.Status, &o.PaymentSessionID, &o.CFPaymentID,
		&paymentID, &o.CreatedBy, &o.CreatedAt, &o.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return o, nil
}

// CreatePaymentOrder records a checkout session before redirecting the user
// to the gateway. subscriptionID is the subscription this order renews (may
// be empty for a fresh subscription).
func (r *SubscriptionRepository) CreatePaymentOrder(ctx context.Context, o *models.PaymentOrder) (*models.PaymentOrder, error) {
	if o.ID == "" {
		o.ID = "ord_" + uuid.New().String()
	}
	if o.Gateway == "" {
		o.Gateway = "cashfree"
	}
	if o.Currency == "" {
		o.Currency = "INR"
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO payment_orders
			(id, gateway, store_id, subscription_id, plan_id, plan_name, plan_price,
			 recurring_type, amount, currency, status, payment_session_id, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'created', $11, $12)
	`, o.ID, o.Gateway, o.StoreID, nullStr(o.SubscriptionID), nullStr(o.PlanID),
		o.PlanName, o.PlanPrice, o.RecurringType, o.Amount, o.Currency,
		nullStr(o.PaymentSessionID), nullStr(o.CreatedBy))
	if err != nil {
		return nil, err
	}
	return r.GetPaymentOrder(ctx, o.ID)
}

// GetPaymentOrder returns one order or nil when it does not exist.
func (r *SubscriptionRepository) GetPaymentOrder(ctx context.Context, id string) (*models.PaymentOrder, error) {
	o, err := scanPaymentOrder(r.db.QueryRowContext(ctx, paymentOrderSelect+`WHERE o.id = $1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return o, err
}

// SetPaymentOrderStatus moves a non-paid order to failed/expired. Paid orders
// are never downgraded — fulfillment already committed.
func (r *SubscriptionRepository) SetPaymentOrderStatus(ctx context.Context, id, status string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE payment_orders SET status = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1 AND status = 'created'
	`, id, status)
	return err
}

// FulfillPaymentOrder applies a successfully-paid gateway order in one
// transaction: it renews the matching subscription (or starts a new period on
// the ordered plan), writes the payment ledger row, links it to the order and
// marks the order paid. Safe to call repeatedly — a paid order returns its
// stored result without re-applying.
func (r *SubscriptionRepository) FulfillPaymentOrder(ctx context.Context, orderID, cfPaymentID string) (*models.PaymentOrder, *models.StoreSubscription, *models.SubscriptionPayment, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, nil, err
	}
	defer tx.Rollback()

	// Lock the order row — this is the idempotency anchor.
	var o models.PaymentOrder
	var paymentID string
	err = tx.QueryRowContext(ctx, `
		SELECT id, gateway, store_id, COALESCE(subscription_id, ''), COALESCE(plan_id, ''),
			plan_name, plan_price, recurring_type, amount, currency, status,
			COALESCE(cf_payment_id, ''), COALESCE(payment_id, ''), COALESCE(created_by, '')
		FROM payment_orders WHERE id = $1 FOR UPDATE
	`, orderID).Scan(
		&o.ID, &o.Gateway, &o.StoreID, &o.SubscriptionID, &o.PlanID,
		&o.PlanName, &o.PlanPrice, &o.RecurringType, &o.Amount, &o.Currency,
		&o.Status, &o.CFPaymentID, &paymentID, &o.CreatedBy,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, nil, nil
	}
	if err != nil {
		return nil, nil, nil, err
	}

	if o.Status == "paid" {
		// Already fulfilled — re-read and return.
		if err := tx.Commit(); err != nil {
			return nil, nil, nil, err
		}
		order, _ := r.GetPaymentOrder(ctx, orderID)
		sub, _ := r.GetCurrentForStore(ctx, o.StoreID)
		var payment *models.SubscriptionPayment
		if paymentID != "" {
			payment, _ = scanPayment(r.db.QueryRowContext(ctx, paymentSelect+`WHERE p.id = $1`, paymentID))
		}
		return order, sub, payment, nil
	}
	if o.Status != "created" {
		return nil, nil, nil, ErrPaymentOrderNotPayable
	}

	// Serialize with admin subscription mutations via the store row lock.
	if _, err := tx.ExecContext(ctx, `SELECT id FROM stores WHERE id = $1 FOR UPDATE`, o.StoreID); err != nil {
		return nil, nil, nil, err
	}

	// The store's current subscription state decides how the paid plan is
	// applied — orders are fulfilled against live state, not the snapshot
	// taken when checkout started.
	var activeID string
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM store_subscriptions WHERE store_id = $1 AND status = 'active' ORDER BY end_date DESC LIMIT 1`,
		o.StoreID).Scan(&activeID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, nil, nil, err
	}

	now := time.Now()
	actor := o.CreatedBy
	var subID, fromPlanID, fromPlanName, toPlanID, toPlanName string
	var periodStart, periodEnd time.Time
	var eventAction, eventNote string

	if activeID != "" {
		l, err := lockSubscription(ctx, tx, activeID)
		if err != nil {
			return nil, nil, nil, err
		}
		samePlan := l.planID == o.PlanID
		if samePlan {
			// Renew: extend one billing period from max(now, end_date).
			base := l.endDate
			if base.Before(now) {
				base = now
			}
			periodStart, periodEnd = base, addBillingPeriod(base, l.recurringType)
			if _, err := tx.ExecContext(ctx, `
				UPDATE store_subscriptions
				SET status = 'active', end_date = $2, renewal_count = renewal_count + 1, updated_at = CURRENT_TIMESTAMP
				WHERE id = $1
			`, l.id, periodEnd); err != nil {
				return nil, nil, nil, err
			}
			subID = l.id
			fromPlanID, fromPlanName = l.planID, l.planName
			toPlanID, toPlanName = l.planID, l.planName
			eventAction = "renewed"
			eventNote = fmt.Sprintf("Renewed via online payment (order %s); next renewal on %s", o.ID, periodEnd.Format("2006-01-02"))
		} else {
			// Paid plan change: close the active period and open one on the
			// plan the customer actually paid for.
			if _, err := tx.ExecContext(ctx, `
				UPDATE store_subscriptions SET status = 'replaced', end_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1
			`, l.id, now); err != nil {
				return nil, nil, nil, err
			}
			if err := cancelOpenRequests(ctx, tx, l.id, "Superseded by paid plan change", actor); err != nil {
				return nil, nil, nil, err
			}
			if err := insertSubscriptionEvent(ctx, tx, o.StoreID, l.id, "replaced",
				l.planID, l.planName, o.PlanID, o.PlanName,
				fmt.Sprintf("Superseded by paid plan change to %s (order %s)", o.PlanName, o.ID), strPtr(actor)); err != nil {
				return nil, nil, nil, err
			}
			subID = uuid.New().String()
			periodStart, periodEnd = now, addBillingPeriod(now, o.RecurringType)
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO store_subscriptions
					(id, store_id, plan_id, plan_name, plan_price, recurring_type, status, start_date, end_date, auto_renew, show_price, created_by)
				VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, $11)
			`, subID, o.StoreID, nullStr(o.PlanID), o.PlanName, o.PlanPrice, o.RecurringType,
				periodStart, periodEnd, l.autoRenew, l.showPrice, nullStr(actor)); err != nil {
				return nil, nil, nil, err
			}
			fromPlanID, fromPlanName = l.planID, l.planName
			toPlanID, toPlanName = o.PlanID, o.PlanName
			eventAction = planChangeAction(o.PlanPrice, l.planPrice)
			eventNote = fmt.Sprintf("Plan changed from %s to %s via online payment (order %s); next renewal on %s",
				l.planName, o.PlanName, o.ID, periodEnd.Format("2006-01-02"))
		}
	} else {
		// No active subscription. An expired period on the same plan is
		// reactivated in place; anything else gets a fresh period.
		var l *subLock
		var expiredID string
		err := tx.QueryRowContext(ctx, `
			SELECT id FROM store_subscriptions
			WHERE store_id = $1 AND status = 'expired' AND COALESCE(plan_id, '') = $2
			ORDER BY end_date DESC LIMIT 1
		`, o.StoreID, o.PlanID).Scan(&expiredID)
		if err == nil {
			l, err = lockSubscription(ctx, tx, expiredID)
			if err != nil {
				return nil, nil, nil, err
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return nil, nil, nil, err
		}

		if l != nil {
			periodStart, periodEnd = now, addBillingPeriod(now, l.recurringType)
			if _, err := tx.ExecContext(ctx, `
				UPDATE store_subscriptions
				SET status = 'active', end_date = $2, renewal_count = renewal_count + 1, updated_at = CURRENT_TIMESTAMP
				WHERE id = $1
			`, l.id, periodEnd); err != nil {
				return nil, nil, nil, err
			}
			subID = l.id
			fromPlanID, fromPlanName = l.planID, l.planName
			toPlanID, toPlanName = l.planID, l.planName
			eventAction = "renewed"
			eventNote = fmt.Sprintf("Reactivated via online payment (order %s); next renewal on %s", o.ID, periodEnd.Format("2006-01-02"))
		} else {
			subID = uuid.New().String()
			periodStart, periodEnd = now, addBillingPeriod(now, o.RecurringType)
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO store_subscriptions
					(id, store_id, plan_id, plan_name, plan_price, recurring_type, status, start_date, end_date, auto_renew, created_by)
				VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, true, $9)
			`, subID, o.StoreID, nullStr(o.PlanID), o.PlanName, o.PlanPrice, o.RecurringType,
				periodStart, periodEnd, nullStr(actor)); err != nil {
				return nil, nil, nil, err
			}
			fromPlanID, fromPlanName = "", ""
			toPlanID, toPlanName = o.PlanID, o.PlanName
			eventAction = "created"
			eventNote = fmt.Sprintf("Subscription started on plan %s via online payment (order %s); expires on %s",
				o.PlanName, o.ID, periodEnd.Format("2006-01-02"))
		}
	}

	// Ledger entry — method 'cashfree' identifies gateway-collected payments.
	notes := fmt.Sprintf("Cashfree order %s", o.ID)
	if cfPaymentID != "" {
		notes = fmt.Sprintf("Cashfree order %s; payment %s", o.ID, cfPaymentID)
	}
	newPaymentID, err := insertPayment(ctx, tx, o.StoreID, subID, o.Amount, "cashfree", "paid",
		&periodStart, &periodEnd, strPtr(actor), notes)
	if err != nil {
		return nil, nil, nil, err
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE payment_orders
		SET status = 'paid', cf_payment_id = $2, payment_id = $3, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, orderID, nullStr(cfPaymentID), newPaymentID); err != nil {
		return nil, nil, nil, err
	}

	if err := insertSubscriptionEvent(ctx, tx, o.StoreID, subID, eventAction,
		fromPlanID, fromPlanName, toPlanID, toPlanName, eventNote, strPtr(actor)); err != nil {
		return nil, nil, nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, nil, err
	}

	order, _ := r.GetPaymentOrder(ctx, orderID)
	sub, _ := r.GetSubscriptionByID(ctx, subID)
	var payment *models.SubscriptionPayment
	payment, _ = scanPayment(r.db.QueryRowContext(ctx,
		paymentSelect+`WHERE p.subscription_id = $1 ORDER BY p.created_at DESC LIMIT 1`, subID))
	return order, sub, payment, nil
}

// planChangeAction classifies a paid plan change the same way ChangePlan does.
func planChangeAction(newPrice, oldPrice float64) string {
	switch {
	case newPrice > oldPrice:
		return "upgraded"
	case newPrice < oldPrice:
		return "downgraded"
	default:
		return "plan_changed"
	}
}
