package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"

	"cafe-backend/internal/cashfree"
	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

var nonDigitRe = regexp.MustCompile(`\D`)

// cashfreePhone normalizes a phone number for Cashfree: digits only, last 10.
// Falls back to a sandbox-friendly placeholder when the store has none.
func cashfreePhone(raw string) string {
	d := nonDigitRe.ReplaceAllString(raw, "")
	if len(d) > 10 {
		d = d[len(d)-10:]
	}
	if len(d) < 10 {
		return "9999999999"
	}
	return d
}

// decryptSetting decodes a possibly-encrypted global_settings value. Values
// without the encryption prefix (legacy plaintext) pass through unchanged; a
// decryption failure logs and yields "" so a bad key degrades to "not
// configured" instead of breaking requests.
func (h *Handler) decryptSetting(v string) string {
	if h.Secrets == nil || v == "" {
		return v
	}
	out, err := h.Secrets.Decrypt(v)
	if err != nil {
		log.Printf("failed to decrypt stored credential: %v", err)
		return ""
	}
	return out
}

// encryptSetting encodes a credential for storage in global_settings.
func (h *Handler) encryptSetting(v string) (string, error) {
	if h.Secrets == nil || v == "" {
		return v, nil
	}
	return h.Secrets.Encrypt(v)
}

// cashfreeRuntime is the effective gateway config for one request: values
// saved in Developer Settings override the environment defaults, and the
// enabled flag gates the feature entirely.
type cashfreeRuntime struct {
	client    *cashfree.Client // nil when disabled
	returnURL string
	notifyURL string
}

// resolveCashfree resolves the effective Cashfree configuration. Environment
// variables supply the base defaults; settings saved via Developer Settings
// take precedence per field, and the saved enabled flag wins over "env
// credentials are present".
func (h *Handler) resolveCashfree(ctx context.Context) *cashfreeRuntime {
	appID, secretKey, env := h.Cfg.CashfreeAppID, h.Cfg.CashfreeSecretKey, h.Cfg.CashfreeEnv
	returnURL, notifyURL := h.Cfg.CashfreeReturnURL, h.Cfg.CashfreeNotifyURL
	enabled := h.Cashfree != nil && h.Cashfree.Enabled()

	cfg, hasEnabled, err := h.Repo.Cashfree.Get(ctx)
	if err != nil {
		log.Printf("cashfree settings read failed, using env config: %v", err)
	} else if cfg != nil {
		if hasEnabled {
			enabled = cfg.Enabled
		}
		if v := h.decryptSetting(cfg.AppID); v != "" {
			appID = v
		}
		if v := h.decryptSetting(cfg.SecretKey); v != "" {
			secretKey = v
		}
		if cfg.Env != "" {
			env = cfg.Env
		}
		if cfg.ReturnURL != "" {
			returnURL = cfg.ReturnURL
		}
		if cfg.NotifyURL != "" {
			notifyURL = cfg.NotifyURL
		}
	}

	rt := &cashfreeRuntime{returnURL: returnURL, notifyURL: notifyURL}
	if enabled {
		rt.client = cashfree.NewClient(appID, secretKey, env)
	}
	return rt
}

// requireCashfree gates handlers on the gateway being configured and enabled.
// It writes the error response and returns nil on failure.
func (h *Handler) requireCashfree(w http.ResponseWriter, r *http.Request) *cashfreeRuntime {
	rt := h.resolveCashfree(r.Context())
	if !rt.client.Enabled() {
		h.writeError(w, http.StatusServiceUnavailable, "Online payments are not configured")
		return nil
	}
	return rt
}

// CreatePlanPaymentOrder handles POST /api/subscriptions/my/pay — creates a
// Cashfree order for the store's plan renewal (or a chosen plan when there is
// no renewable subscription) and returns the payment_session_id used to open
// the checkout.
func (h *Handler) CreatePlanPaymentOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if !canManagePlanRequests(claims.Role) {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}
	rt := h.requireCashfree(w, r)
	if rt == nil {
		return
	}

	var req models.CreatePaymentOrderPayload
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	storeID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}
	allowed, err := h.planPageAllowed(r.Context(), claims, storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "My Plan page is not enabled for this store")
		return
	}

	h.processDueQuietly(r)

	sub, err := h.Repo.Subscription.GetCurrentForStore(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Resolve which plan is being paid for. planId empty = renew the current
	// plan (subscription snapshot is used, so a deleted plan still renews).
	planID, planName, recurring := "", "", ""
	var amount float64
	if strings.TrimSpace(req.PlanID) != "" {
		plan, err := h.Repo.Subscription.GetPlanByID(r.Context(), req.PlanID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if plan == nil {
			h.writeError(w, http.StatusBadRequest, "Invalid planId — plan not found")
			return
		}
		if !plan.IsActive {
			h.writeError(w, http.StatusBadRequest, "Plan is inactive and cannot be purchased")
			return
		}
		planID, planName, recurring, amount = plan.ID, plan.Name, plan.RecurringType, plan.Price
	} else {
		if sub == nil {
			h.writeError(w, http.StatusBadRequest, "planId is required — store has no current plan to renew")
			return
		}
		planID, planName, recurring, amount = sub.PlanID, sub.PlanName, sub.RecurringType, sub.PlanPrice
	}
	if amount <= 0 {
		h.writeError(w, http.StatusBadRequest, "Plan price must be greater than zero to pay online")
		return
	}

	// Renewing an active subscription for a *different* plan is a paid plan
	// change — allowed; it applies immediately once the payment succeeds.
	var subID string
	if sub != nil && (sub.Status == "active" || sub.Status == "expired") {
		subID = sub.ID
	}

	store, err := h.Repo.Store.GetByID(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if store == nil {
		h.writeError(w, http.StatusBadRequest, "Store not found")
		return
	}
	customer := cashfree.CustomerDetails{
		CustomerID:    "store_" + storeID,
		CustomerName:  store.Name,
		CustomerPhone: cashfreePhone(store.Phone),
	}
	if u, err := h.Repo.User.GetByID(r.Context(), claims.ID); err == nil && u != nil {
		customer.CustomerEmail = u.Email
		if u.Name != "" {
			customer.CustomerName = u.Name
		}
	}

	orderID := "ord_" + uuid.New().String()
	meta := &cashfree.OrderMeta{
		ReturnURL: rt.returnURL,
		NotifyURL: rt.notifyURL,
	}
	cfOrder, err := rt.client.CreateOrder(r.Context(), &cashfree.CreateOrderRequest{
		OrderID:         orderID,
		OrderAmount:     amount,
		OrderCurrency:   "INR",
		OrderNote:       fmt.Sprintf("%s plan for %s", planName, store.Name),
		CustomerDetails: customer,
		OrderMeta:       meta,
	})
	if err != nil {
		log.Printf("cashfree create order failed (store %s): %v", storeID, err)
		h.writeError(w, http.StatusBadGateway, "Could not create payment order: "+err.Error())
		return
	}

	order, err := h.Repo.Subscription.CreatePaymentOrder(r.Context(), &models.PaymentOrder{
		ID:               orderID,
		StoreID:          storeID,
		SubscriptionID:   subID,
		PlanID:           planID,
		PlanName:         planName,
		PlanPrice:        amount,
		RecurringType:    recurring,
		Amount:           amount,
		Currency:         "INR",
		PaymentSessionID: cfOrder.PaymentSessionID,
		CreatedBy:        claims.ID,
	})
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, models.CreatePaymentOrderResponse{
		Order:            order,
		PaymentSessionID: cfOrder.PaymentSessionID,
		Mode:             rt.client.Mode(),
	})
}

// VerifyPlanPayment handles POST /api/subscriptions/my/pay/{orderId}/verify —
// reconciles a checkout result against the gateway. When the order is paid
// the subscription is renewed/created idempotently and the ledger row is
// returned along with it.
func (h *Handler) VerifyPlanPayment(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if h.requireCashfree(w, r) == nil {
		return
	}
	orderID := chi.URLParam(r, "orderId")

	order, err := h.Repo.Subscription.GetPaymentOrder(r.Context(), orderID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if order == nil {
		h.writeError(w, http.StatusNotFound, "Payment order not found")
		return
	}
	allowed, err := h.authorizeStore(r.Context(), claims, order.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return
	}

	order, sub, payment, status, err := h.reconcilePaymentOrder(r, orderID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if order == nil {
		h.writeError(w, http.StatusNotFound, "Payment order not found")
		return
	}
	h.writeJSON(w, http.StatusOK, models.VerifyPaymentOrderResponse{
		Status: status, Order: order, Subscription: sub, Payment: payment,
	})
}

// reconcilePaymentOrder asks Cashfree for the ground truth on an order and
// fulfills it when paid. Returns the (possibly updated) order, the resulting
// subscription/payment, and a UI-friendly status string.
func (h *Handler) reconcilePaymentOrder(r *http.Request, orderID string) (*models.PaymentOrder, *models.StoreSubscription, *models.SubscriptionPayment, string, error) {
	order, err := h.Repo.Subscription.GetPaymentOrder(r.Context(), orderID)
	if err != nil || order == nil {
		return order, nil, nil, "", err
	}
	if order.Status == "paid" {
		sub, _ := h.Repo.Subscription.GetCurrentForStore(r.Context(), order.StoreID)
		return order, sub, nil, "paid", nil
	}
	if order.Status != "created" {
		return order, nil, nil, order.Status, nil
	}

	rt := h.resolveCashfree(r.Context())
	if !rt.client.Enabled() {
		return nil, nil, nil, "", cashfree.ErrNotConfigured
	}
	cfOrder, err := rt.client.GetOrder(r.Context(), orderID)
	if err != nil {
		return nil, nil, nil, "", err
	}
	switch strings.ToUpper(cfOrder.OrderStatus) {
	case "PAID":
		var cfPaymentID string
		payments, err := rt.client.GetOrderPayments(r.Context(), orderID)
		if err != nil {
			return nil, nil, nil, "", err
		}
		if p := cashfree.SuccessfulPayment(payments); p != nil {
			cfPaymentID = string(p.CFPaymentID)
		}
		order, sub, payment, err := h.Repo.Subscription.FulfillPaymentOrder(r.Context(), orderID, cfPaymentID)
		if err != nil {
			return nil, nil, nil, "", err
		}
		if order == nil {
			return nil, nil, nil, "", errors.New("payment order not found")
		}
		return order, sub, payment, "paid", nil
	case "EXPIRED":
		_ = h.Repo.Subscription.SetPaymentOrderStatus(r.Context(), orderID, "expired")
		order, _ = h.Repo.Subscription.GetPaymentOrder(r.Context(), orderID)
		return order, nil, nil, "expired", nil
	default: // ACTIVE — payment attempt pending or not started
		return order, nil, nil, "pending", nil
	}
}

// CashfreeWebhook handles POST /api/webhooks/cashfree — Cashfree's
// server-to-server payment notifications. The signature header is verified
// before anything is trusted; fulfillment re-checks the order state with the
// gateway API so a forged-but-signed payload can't fabricate a success.
func (h *Handler) CashfreeWebhook(w http.ResponseWriter, r *http.Request) {
	rt := h.resolveCashfree(r.Context())
	if !rt.client.Enabled() {
		h.writeError(w, http.StatusServiceUnavailable, "Webhooks not configured")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "Unreadable body")
		return
	}
	timestamp := r.Header.Get("x-webhook-timestamp")
	signature := r.Header.Get("x-webhook-signature")
	if !rt.client.VerifyWebhookSignature(raw, timestamp, signature) {
		h.writeError(w, http.StatusUnauthorized, "Invalid signature")
		return
	}

	var payload struct {
		Type string `json:"type"`
		Data struct {
			Order struct {
				OrderID string `json:"order_id"`
			} `json:"order"`
			Payment struct {
				CFPaymentID   int64  `json:"cf_payment_id"`
				PaymentStatus string `json:"payment_status"`
			} `json:"payment"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid payload")
		return
	}
	orderID := payload.Data.Order.OrderID
	if orderID == "" {
		h.writeJSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}

	switch payload.Type {
	case "PAYMENT_SUCCESS_WEBHOOK":
		if _, _, _, status, err := h.reconcilePaymentOrder(r, orderID); err != nil {
			log.Printf("cashfree webhook reconcile failed for %s: %v", orderID, err)
			h.writeError(w, http.StatusInternalServerError, "Reconciliation failed")
			return
		} else {
			log.Printf("cashfree webhook: order %s reconciled as %s", orderID, status)
		}
	case "PAYMENT_FAILED_WEBHOOK":
		// The order stays 'created' — the same session can be retried.
		log.Printf("cashfree webhook: payment failed for order %s", orderID)
	default:
		log.Printf("cashfree webhook: ignoring event type %s for order %s", payload.Type, orderID)
	}
	h.writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GetPaymentConfig handles GET /api/subscriptions/my/payment-config — the
// non-secret availability flag the My Plan page uses to show or hide online
// payment options. Any authenticated user may read it.
func (h *Handler) GetPaymentConfig(w http.ResponseWriter, r *http.Request) {
	if _, ok := middleware.GetUserFromContext(r.Context()); !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	rt := h.resolveCashfree(r.Context())
	h.writeJSON(w, http.StatusOK, models.PaymentConfigResponse{
		Enabled: rt.client.Enabled(),
		Mode:    rt.client.Mode(),
	})
}

// GetCashfreeConfig handles GET /api/system/cashfree-config (superadmin only).
// It reports the effective configuration — values saved in settings merged
// over environment fallbacks.
func (h *Handler) GetCashfreeConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	cfg, hasEnabled, err := h.Repo.Cashfree.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := models.CashfreeConfig{
		Enabled:   h.Cashfree != nil && h.Cashfree.Enabled(),
		AppID:     h.Cfg.CashfreeAppID,
		SecretKey: h.Cfg.CashfreeSecretKey,
		Env:       h.Cfg.CashfreeEnv,
		ReturnURL: h.Cfg.CashfreeReturnURL,
		NotifyURL: h.Cfg.CashfreeNotifyURL,
		Source:    "env",
	}
	if resp.AppID == "" && resp.SecretKey == "" {
		resp.Source = "none"
	}
	if cfg != nil {
		if hasEnabled {
			resp.Enabled = cfg.Enabled
			resp.Source = "settings"
		}
		if v := h.decryptSetting(cfg.AppID); v != "" {
			resp.AppID = v
			resp.Source = "settings"
		}
		if v := h.decryptSetting(cfg.SecretKey); v != "" {
			resp.SecretKey = v
			resp.Source = "settings"
		}
		if cfg.Env != "" {
			resp.Env = cfg.Env
			resp.Source = "settings"
		}
		if cfg.ReturnURL != "" {
			resp.ReturnURL = cfg.ReturnURL
		}
		if cfg.NotifyURL != "" {
			resp.NotifyURL = cfg.NotifyURL
		}
	}
	if resp.Env == "" {
		resp.Env = "sandbox"
	}

	h.writeJSON(w, http.StatusOK, resp)
}

// UpdateCashfreeConfig handles POST /api/system/cashfree-config (superadmin
// only). Saved values take precedence over environment variables — leaving a
// field blank falls back to the env value, and the enabled flag alone can
// switch online payments on/off.
func (h *Handler) UpdateCashfreeConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.CashfreeConfigRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	req.AppID = strings.TrimSpace(req.AppID)
	req.SecretKey = strings.TrimSpace(req.SecretKey)
	req.Env = strings.ToLower(strings.TrimSpace(req.Env))
	if req.Env != "production" && req.Env != "sandbox" {
		req.Env = "sandbox"
	}
	req.ReturnURL = strings.TrimSpace(req.ReturnURL)
	req.NotifyURL = strings.TrimSpace(req.NotifyURL)
	if req.Enabled && req.AppID == "" && h.Cfg.CashfreeAppID == "" {
		h.writeError(w, http.StatusBadRequest, "Cashfree App ID is required to enable online payments")
		return
	}
	if req.Enabled && req.SecretKey == "" && h.Cfg.CashfreeSecretKey == "" {
		h.writeError(w, http.StatusBadRequest, "Cashfree Secret Key is required to enable online payments")
		return
	}

	// Credentials are encrypted before they touch the database.
	if v, err := h.encryptSetting(req.AppID); err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to encrypt credentials")
		return
	} else {
		req.AppID = v
	}
	if v, err := h.encryptSetting(req.SecretKey); err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to encrypt credentials")
		return
	} else {
		req.SecretKey = v
	}

	if err := h.Repo.Cashfree.Save(r.Context(), req, claims.ID); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Cashfree configuration saved successfully",
	})
}
