package handler

import (
	"context"
	"time"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/repository"
)

// retentionCutoff returns the earliest timestamp still visible to the caller
// for the given store. Superadmin always sees the full history; every other
// role is limited by the store's data_retention_days setting (0 = unlimited).
// Hidden rows are never deleted — they simply stop being returned.
func (h *Handler) retentionCutoff(ctx context.Context, claims *middleware.UserClaims, storeID string) (*time.Time, error) {
	if claims.Role == "superadmin" || storeID == "" {
		return nil, nil
	}
	store, err := h.Repo.Store.GetByID(ctx, storeID)
	if err != nil {
		return nil, err
	}
	if store == nil || store.DataRetentionDays <= 0 {
		return nil, nil
	}
	cutoff := time.Now().AddDate(0, 0, -store.DataRetentionDays)
	return &cutoff, nil
}

// clampStart returns the later of the requested lower bound and the
// retention cutoff, so a client can never widen a range past what the
// store's retention policy allows it to see.
func clampStart(from, cutoff *time.Time) *time.Time {
	if cutoff == nil {
		return from
	}
	if from == nil || from.Before(*cutoff) {
		return cutoff
	}
	return from
}

// clampDateStr applies clampStart to a YYYY-MM-DD lower-bound string used by
// the expense and revenue report endpoints (lexicographic compare works for
// ISO dates).
func clampDateStr(date string, cutoff *time.Time) string {
	if cutoff == nil {
		return date
	}
	c := cutoff.Format("2006-01-02")
	if date == "" || date < c {
		return c
	}
	return date
}

// reportRetention clamps a parsed ReportFilter in place for the caller.
func (h *Handler) reportRetention(ctx context.Context, claims *middleware.UserClaims, storeID string, f *repository.ReportFilter) error {
	cutoff, err := h.retentionCutoff(ctx, claims, storeID)
	if err != nil {
		return err
	}
	f.From = clampStart(f.From, cutoff)
	return nil
}

// visibleAt reports whether a record stamped at ts is still visible to the
// caller under the store's retention policy.
func (h *Handler) visibleAt(ctx context.Context, claims *middleware.UserClaims, storeID string, ts time.Time) (bool, error) {
	cutoff, err := h.retentionCutoff(ctx, claims, storeID)
	if err != nil {
		return false, err
	}
	return cutoff == nil || !ts.Before(*cutoff), nil
}
