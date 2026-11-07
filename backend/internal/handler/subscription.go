package handler

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
	"cafe-backend/internal/repository"

	"github.com/go-chi/chi/v5"
)

var subscriptionRecurringTypes = map[string]bool{
	"monthly": true, "quarterly": true, "biannually": true, "yearly": true,
}

var subscriptionStatuses = map[string]bool{
	"active": true, "expired": true, "cancelled": true, "replaced": true,
}

// requireSuperadmin gates subscription management endpoints to the superadmin
// role and returns the caller's claims.
func (h *Handler) requireSuperadmin(w http.ResponseWriter, r *http.Request) (*middleware.UserClaims, bool) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return nil, false
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return nil, false
	}
	return claims, true
}

// parseSubscriptionDate accepts "YYYY-MM-DD", RFC3339, or empty (now).
func parseSubscriptionDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Now(), nil
	}
	for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02 15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, errors.New("invalid date format (use YYYY-MM-DD)")
}

// sanitizePlanFeatures trims and bounds the free-form feature list.
func sanitizePlanFeatures(features []string) []string {
	out := make([]string, 0, len(features))
	for _, f := range features {
		f = strings.TrimSpace(f)
		if f == "" {
			continue
		}
		if len(f) > 200 {
			f = f[:200]
		}
		out = append(out, f)
		if len(out) >= 50 {
			break
		}
	}
	return out
}

// validatePlanRequest normalizes a plan payload and returns an error message
// ("" when valid).
func validatePlanRequest(req *models.SubscriptionPlanRequest) string {
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return "Plan name is required"
	}
	if req.Price < 0 {
		return "Price cannot be negative"
	}
	if req.RecurringType == "" {
		req.RecurringType = "monthly"
	}
	if !subscriptionRecurringTypes[req.RecurringType] {
		return "Invalid recurring type (monthly, quarterly, biannually, yearly)"
	}
	req.Features = sanitizePlanFeatures(req.Features)
	return ""
}

// processDueQuietly rolls the billing clock forward; failures are logged so a
// sweep error never blocks the read endpoints.
func (h *Handler) processDueQuietly(r *http.Request) {
	if err := h.Repo.Subscription.ProcessDue(r.Context()); err != nil {
		log.Printf("subscription due-processing failed: %v", err)
	}
}

// ---------- Plans ----------

// GetSubscriptionPlans handles GET /api/subscription-plans — superadmin sees
// every plan; other authenticated roles only see plans that can currently be
// assigned (needed for the My Plan upgrade/downgrade picker).
func (h *Handler) GetSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	activeOnly := claims.Role != "superadmin"
	plans, err := h.Repo.Subscription.ListPlans(r.Context(), activeOnly)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, plans)
}

// CreateSubscriptionPlan handles POST /api/subscription-plans
func (h *Handler) CreateSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}

	var req models.SubscriptionPlanRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if errMsg := validatePlanRequest(&req); errMsg != "" {
		h.writeError(w, http.StatusBadRequest, errMsg)
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	plan := &models.SubscriptionPlan{
		Name:          req.Name,
		Price:         req.Price,
		Features:      req.Features,
		RecurringType: req.RecurringType,
		IsActive:      isActive,
	}
	created, err := h.Repo.Subscription.CreatePlan(r.Context(), plan)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusCreated, created)
}

// UpdateSubscriptionPlan handles PUT /api/subscription-plans/{id}
func (h *Handler) UpdateSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var req models.SubscriptionPlanRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if errMsg := validatePlanRequest(&req); errMsg != "" {
		h.writeError(w, http.StatusBadRequest, errMsg)
		return
	}

	existing, err := h.Repo.Subscription.GetPlanByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if existing == nil {
		h.writeError(w, http.StatusNotFound, "Plan not found")
		return
	}

	isActive := existing.IsActive
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	updated, err := h.Repo.Subscription.UpdatePlan(r.Context(), &models.SubscriptionPlan{
		ID:            id,
		Name:          req.Name,
		Price:         req.Price,
		Features:      req.Features,
		RecurringType: req.RecurringType,
		IsActive:      isActive,
	})
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, updated)
}

// DeleteSubscriptionPlan handles DELETE /api/subscription-plans/{id}
func (h *Handler) DeleteSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	id := chi.URLParam(r, "id")

	err := h.Repo.Subscription.DeletePlan(r.Context(), id)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrPlanInUse):
			h.writeError(w, http.StatusConflict, "Plan is used by store subscriptions — deactivate it instead")
		case errors.Is(err, sql.ErrNoRows):
			h.writeError(w, http.StatusNotFound, "Plan not found")
		default:
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Plan deleted"})
}

// ---------- Store subscriptions ----------

// GetSubscriptions handles GET /api/subscriptions?storeId=&status=
func (h *Handler) GetSubscriptions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}

	status := r.URL.Query().Get("status")
	if status != "" && status != "all" && !subscriptionStatuses[status] {
		h.writeError(w, http.StatusBadRequest, "Invalid status filter")
		return
	}

	h.processDueQuietly(r)

	subs, err := h.Repo.Subscription.ListSubscriptions(r.Context(), r.URL.Query().Get("storeId"), status)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, subs)
}

// CreateSubscription handles POST /api/subscriptions
func (h *Handler) CreateSubscription(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}

	var req models.CreateSubscriptionRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if strings.TrimSpace(req.StoreID) == "" {
		h.writeError(w, http.StatusBadRequest, "storeId is required")
		return
	}
	if strings.TrimSpace(req.PlanID) == "" {
		h.writeError(w, http.StatusBadRequest, "planId is required")
		return
	}
	start, err := parseSubscriptionDate(req.StartDate)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	store, err := h.Repo.Store.GetByID(r.Context(), req.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if store == nil {
		h.writeError(w, http.StatusBadRequest, "Invalid storeId — store not found")
		return
	}
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
		h.writeError(w, http.StatusBadRequest, "Plan is inactive and cannot be assigned")
		return
	}

	autoRenew := true
	if req.AutoRenew != nil {
		autoRenew = *req.AutoRenew
	}
	showPrice := req.ShowPrice != nil && *req.ShowPrice
	sub, err := h.Repo.Subscription.CreateSubscription(r.Context(), req.StoreID, plan, start, autoRenew, showPrice, claims.ID)
	if err != nil {
		if errors.Is(err, repository.ErrActiveSubscriptionExists) {
			h.writeError(w, http.StatusConflict, "Store already has an active subscription — change or cancel it first")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	h.writeJSON(w, http.StatusCreated, sub)
}

// UpdateSubscription handles PATCH /api/subscriptions/{id} — toggles auto-renewal.
func (h *Handler) UpdateSubscription(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var req models.UpdateSubscriptionRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if req.AutoRenew == nil && req.ShowPrice == nil {
		h.writeError(w, http.StatusBadRequest, "Nothing to update — autoRenew and/or showPrice expected")
		return
	}

	var sub *models.StoreSubscription
	var err error
	if req.AutoRenew != nil {
		sub, err = h.Repo.Subscription.SetAutoRenew(r.Context(), id, *req.AutoRenew, claims.ID)
		if err != nil {
			if errors.Is(err, repository.ErrSubscriptionNotActive) {
				h.writeError(w, http.StatusBadRequest, "Only active subscriptions can be updated")
			} else {
				h.writeError(w, http.StatusInternalServerError, err.Error())
			}
			return
		}
	}
	if req.ShowPrice != nil {
		sub, err = h.Repo.Subscription.SetShowPrice(r.Context(), id, *req.ShowPrice, claims.ID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if sub == nil {
		h.writeError(w, http.StatusNotFound, "Subscription not found")
		return
	}
	h.writeJSON(w, http.StatusOK, sub)
}

// CancelSubscription handles POST /api/subscriptions/{id}/cancel
func (h *Handler) CancelSubscription(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	sub, err := h.Repo.Subscription.CancelSubscription(r.Context(), id, claims.ID)
	if err != nil {
		if errors.Is(err, repository.ErrSubscriptionNotActive) {
			h.writeError(w, http.StatusBadRequest, "Only active subscriptions can be cancelled")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	if sub == nil {
		h.writeError(w, http.StatusNotFound, "Subscription not found")
		return
	}
	h.writeJSON(w, http.StatusOK, sub)
}

// RenewSubscription handles POST /api/subscriptions/{id}/renew — extends the
// period by one billing cycle (also reactivates an expired subscription).
func (h *Handler) RenewSubscription(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	sub, err := h.Repo.Subscription.RenewSubscription(r.Context(), id, claims.ID)
	if err != nil {
		if errors.Is(err, repository.ErrSubscriptionNotRenewable) {
			h.writeError(w, http.StatusBadRequest, "Only active or expired subscriptions can be renewed")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	if sub == nil {
		h.writeError(w, http.StatusNotFound, "Subscription not found")
		return
	}
	h.writeJSON(w, http.StatusOK, sub)
}

// ChangeSubscriptionPlan handles POST /api/subscriptions/{id}/change-plan —
// ends the current period and starts a new one on the target plan
// (upgrade/downgrade is classified by price comparison).
func (h *Handler) ChangeSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var req models.ChangePlanRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if strings.TrimSpace(req.PlanID) == "" {
		h.writeError(w, http.StatusBadRequest, "planId is required")
		return
	}
	start, err := parseSubscriptionDate(req.StartDate)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	current, err := h.Repo.Subscription.GetSubscriptionByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if current == nil {
		h.writeError(w, http.StatusNotFound, "Subscription not found")
		return
	}
	if current.Status != "active" {
		h.writeError(w, http.StatusBadRequest, "Only active subscriptions can change plan")
		return
	}
	if current.PlanID == req.PlanID {
		h.writeError(w, http.StatusBadRequest, "Store is already on this plan")
		return
	}
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
		h.writeError(w, http.StatusBadRequest, "Plan is inactive and cannot be assigned")
		return
	}

	sub, err := h.Repo.Subscription.ChangePlan(r.Context(), id, plan, start, req.AutoRenew, req.ShowPrice, claims.ID)
	if err != nil {
		if errors.Is(err, repository.ErrSubscriptionNotActive) {
			h.writeError(w, http.StatusBadRequest, "Only active subscriptions can change plan")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	h.writeJSON(w, http.StatusOK, sub)
}

// planPageAllowed reports whether the My Plan page (and its endpoints) is
// visible to the caller for the given store: always for superadmin, for other
// roles only when the store's my_plan_enabled flag is set.
func (h *Handler) planPageAllowed(ctx context.Context, claims *middleware.UserClaims, storeID string) (bool, error) {
	if claims.Role == "superadmin" {
		return true, nil
	}
	s, err := h.Repo.Store.GetByID(ctx, storeID)
	if err != nil || s == nil {
		return false, err
	}
	return s.MyPlanEnabled, nil
}

// GetMySubscription handles GET /api/subscriptions/my?storeId= — the caller's
// own store's subscription, available to every authenticated role (the
// storeId is verified through the standard store-access check).
func (h *Handler) GetMySubscription(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
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

	var plan *models.SubscriptionPlan
	if sub != nil && sub.PlanID != "" {
		plan, err = h.Repo.Subscription.GetPlanByID(r.Context(), sub.PlanID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	var pending *models.SubscriptionChangeRequest
	if sub != nil && sub.Status == "active" {
		pending, err = h.Repo.Subscription.GetOpenRequestForSubscription(r.Context(), sub.ID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	h.writeJSON(w, http.StatusOK, models.MySubscriptionResponse{Subscription: sub, Plan: plan, PendingRequest: pending})
}

// GetMySubscriptionHistory handles GET /api/subscriptions/my/history?storeId=
// — billing periods and audit events for the caller's own store (any role,
// store-scoped like GetMySubscription).
func (h *Handler) GetMySubscriptionHistory(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
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

	periods, err := h.Repo.Subscription.ListSubscriptions(r.Context(), storeID, "")
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	events, err := h.Repo.Subscription.ListEvents(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	payments, err := h.Repo.Subscription.ListPayments(r.Context(), storeID, "")
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, models.MySubscriptionHistoryResponse{Periods: periods, Events: events, Payments: payments})
}

// GetSubscriptionHistory handles GET /api/subscriptions/history?storeId=
func (h *Handler) GetSubscriptionHistory(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}

	h.processDueQuietly(r)

	events, err := h.Repo.Subscription.ListEvents(r.Context(), r.URL.Query().Get("storeId"))
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, events)
}

// ---------- Change requests ----------

// canManagePlanRequests reports whether the role may file/withdraw plan change
// requests for a store (staff is view-only).
func canManagePlanRequests(role string) bool {
	return role == "superadmin" || role == "business_owner" || role == "business_admin"
}

// SubmitSubscriptionRequest handles POST /api/subscriptions/my/requests —
// files an upgrade/downgrade (action=change_plan) or cancel request that
// takes effect at the end of the current cycle once superadmin approves.
func (h *Handler) SubmitSubscriptionRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if !canManagePlanRequests(claims.Role) {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}

	var req struct {
		StoreID string `json:"storeId"`
		models.SubmitChangeRequestPayload
	}
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

	sub, err := h.Repo.Subscription.GetCurrentForStore(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if sub == nil || sub.Status != "active" {
		h.writeError(w, http.StatusBadRequest, "No active subscription to change")
		return
	}

	reqType := ""
	var plan *models.SubscriptionPlan
	switch req.Action {
	case "change_plan":
		if strings.TrimSpace(req.PlanID) == "" {
			h.writeError(w, http.StatusBadRequest, "planId is required")
			return
		}
		if req.PlanID == sub.PlanID {
			h.writeError(w, http.StatusBadRequest, "Store is already on this plan")
			return
		}
		plan, err = h.Repo.Subscription.GetPlanByID(r.Context(), req.PlanID)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if plan == nil {
			h.writeError(w, http.StatusBadRequest, "Invalid planId — plan not found")
			return
		}
		if !plan.IsActive {
			h.writeError(w, http.StatusBadRequest, "Plan is inactive and cannot be requested")
			return
		}
		switch {
		case plan.Price > sub.PlanPrice:
			reqType = "upgrade"
		case plan.Price < sub.PlanPrice:
			reqType = "downgrade"
		default:
			reqType = "plan_change"
		}
	case "cancel":
		reqType = "cancel"
	default:
		h.writeError(w, http.StatusBadRequest, "action must be change_plan or cancel")
		return
	}

	created, err := h.Repo.Subscription.CreateChangeRequest(r.Context(), sub.ID, reqType, plan, claims.ID)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrOpenRequestExists):
			h.writeError(w, http.StatusConflict, "A change request is already open for this subscription")
		case errors.Is(err, repository.ErrSubscriptionNotActive):
			h.writeError(w, http.StatusBadRequest, "Subscription is no longer active")
		default:
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	if created == nil {
		h.writeError(w, http.StatusNotFound, "Subscription not found")
		return
	}
	h.writeJSON(w, http.StatusCreated, created)
}

// WithdrawSubscriptionRequest handles POST /api/subscriptions/my/requests/{id}/cancel
// — the store user withdraws their still-pending request.
func (h *Handler) WithdrawSubscriptionRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if !canManagePlanRequests(claims.Role) {
		h.writeError(w, http.StatusForbidden, "Not authorized")
		return
	}
	id := chi.URLParam(r, "id")

	// Resolve the request first so its store_id can be access-checked.
	existing, err := h.Repo.Subscription.GetChangeRequestByID(r.Context(), id)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if existing == nil {
		h.writeError(w, http.StatusNotFound, "Request not found")
		return
	}
	allowed, err := h.authorizeStore(r.Context(), claims, existing.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "Not authorized for this store")
		return
	}
	allowed, err = h.planPageAllowed(r.Context(), claims, existing.StoreID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !allowed {
		h.writeError(w, http.StatusForbidden, "My Plan page is not enabled for this store")
		return
	}

	updated, err := h.Repo.Subscription.WithdrawChangeRequest(r.Context(), id, claims.ID)
	if err != nil {
		if errors.Is(err, repository.ErrRequestNotPending) {
			h.writeError(w, http.StatusBadRequest, "Only pending requests can be withdrawn")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	h.writeJSON(w, http.StatusOK, updated)
}

// GetSubscriptionRequests handles GET /api/subscription-requests?status=&storeId=
// — the superadmin approval inbox.
func (h *Handler) GetSubscriptionRequests(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	h.processDueQuietly(r)

	requests, err := h.Repo.Subscription.ListChangeRequests(r.Context(),
		r.URL.Query().Get("storeId"), r.URL.Query().Get("status"))
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, requests)
}

// ApproveSubscriptionRequest handles POST /api/subscription-requests/{id}/approve
// — schedules the requested change for the end of the current cycle.
func (h *Handler) ApproveSubscriptionRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	updated, err := h.Repo.Subscription.ApproveChangeRequest(r.Context(), id, claims.ID)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrRequestNotPending):
			h.writeError(w, http.StatusBadRequest, "Request is no longer pending")
		case errors.Is(err, repository.ErrSubscriptionNotActive):
			h.writeError(w, http.StatusBadRequest, "The subscription is no longer active — reject this request instead")
		default:
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	if updated == nil {
		h.writeError(w, http.StatusNotFound, "Request not found")
		return
	}
	h.writeJSON(w, http.StatusOK, updated)
}

// RejectSubscriptionRequest handles POST /api/subscription-requests/{id}/reject.
func (h *Handler) RejectSubscriptionRequest(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var req models.RejectChangeRequestPayload
	// Body is optional — decode errors are tolerated.
	_ = h.readJSON(r, &req)

	updated, err := h.Repo.Subscription.RejectChangeRequest(r.Context(), id, strings.TrimSpace(req.Note), claims.ID)
	if err != nil {
		if errors.Is(err, repository.ErrRequestNotPending) {
			h.writeError(w, http.StatusBadRequest, "Request is no longer pending")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	if updated == nil {
		h.writeError(w, http.StatusNotFound, "Request not found")
		return
	}
	h.writeJSON(w, http.StatusOK, updated)
}

// ---------- Payments ----------

var subscriptionPaymentMethods = map[string]bool{
	"auto": true, "cash": true, "upi": true, "bank_transfer": true, "card": true, "other": true,
}

// GetSubscriptionPayments handles GET /api/subscription-payments?storeId=&subscriptionId=
// — the superadmin billing ledger.
func (h *Handler) GetSubscriptionPayments(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireSuperadmin(w, r); !ok {
		return
	}
	payments, err := h.Repo.Subscription.ListPayments(r.Context(),
		r.URL.Query().Get("storeId"), r.URL.Query().Get("subscriptionId"))
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	h.writeJSON(w, http.StatusOK, payments)
}

// RecordSubscriptionPayment handles POST /api/subscriptions/{id}/payments —
// records a manual payment; renew=true also renews the subscription by one
// period (the only way non-auto-renewing subscriptions roll forward).
func (h *Handler) RecordSubscriptionPayment(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.requireSuperadmin(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	var req models.RecordPaymentPayload
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if req.Amount < 0 {
		h.writeError(w, http.StatusBadRequest, "Amount cannot be negative")
		return
	}
	if req.Method == "" {
		req.Method = "manual"
	}
	if !subscriptionPaymentMethods[req.Method] && req.Method != "manual" {
		h.writeError(w, http.StatusBadRequest, "Invalid payment method")
		return
	}

	payment, err := h.Repo.Subscription.RecordPayment(r.Context(), id, req.Amount, req.Method, req.Notes, req.Renew, claims.ID)
	if err != nil {
		if errors.Is(err, repository.ErrSubscriptionNotRenewable) {
			h.writeError(w, http.StatusBadRequest, "Only active or expired subscriptions can be renewed")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	if payment == nil {
		h.writeError(w, http.StatusNotFound, "Subscription not found")
		return
	}
	h.writeJSON(w, http.StatusCreated, payment)
}
