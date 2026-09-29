package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// Regression test for the RouteCtx-inheritance bug: a replayed request built
// on the parent's context inherited chi's RouteMethod ("POST" from
// /sync/apply), so PUT/PATCH events routed as POST and returned 405.
func TestReplayRequestRoutesWithOwnMethod(t *testing.T) {
	r := chi.NewRouter()

	var gotMethod, gotID string
	r.Put("/api/orders/{id}", func(w http.ResponseWriter, req *http.Request) {
		gotMethod = req.Method
		gotID = chi.URLParam(req, "id")
		w.WriteHeader(http.StatusOK)
	})
	r.Post("/api/sync/apply", func(w http.ResponseWriter, req *http.Request) {
		replay, err := newReplayRequest(req.Context(), "PUT", "/orders/abc-123", []byte("{}"))
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		replay.Header.Set("X-Sync-Origin", "client")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, replay)
		w.WriteHeader(rec.Code)
	})

	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/sync/apply", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("replayed PUT returned %d, want 200", rec.Code)
	}
	if gotMethod != http.MethodPut || gotID != "abc-123" {
		t.Fatalf("PUT handler saw method=%q id=%q, want PUT abc-123", gotMethod, gotID)
	}
}
