package middleware

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"cafe-backend/internal/syncutil"
)

// syncOriginHeader marks requests that were replayed from a client outbox via
// /api/sync/apply — they must not be enqueued again (prevents circular sync).
const syncOriginHeader = "X-Sync-Origin"

type syncStatusWriter struct {
	http.ResponseWriter
	status int
	buf    bytes.Buffer
}

func (w *syncStatusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *syncStatusWriter) Write(b []byte) (int, error) {
	if w.buf.Len() < 1<<20 { // cap capture at 1 MiB
		w.buf.Write(b)
	}
	return w.ResponseWriter.Write(b)
}

// SyncLogMiddleware records every successful mutating request into the
// sync_events table so offline-first clients can poll and replay the changes.
// Requests carrying X-Sync-Origin (replayed client events) are skipped to
// prevent echo loops.
func SyncLogMiddleware(db *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			m := r.Method
			if m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions ||
				strings.HasPrefix(r.URL.Path, "/api/sync") ||
				strings.HasPrefix(r.URL.Path, "/api/auth") ||
				strings.HasPrefix(r.URL.Path, "/api/ws") ||
				r.Header.Get(syncOriginHeader) != "" {
				next.ServeHTTP(w, r)
				return
			}

			var reqBody []byte
			if r.Body != nil {
				reqBody, _ = io.ReadAll(io.LimitReader(r.Body, 4<<20))
				r.Body = io.NopCloser(bytes.NewReader(reqBody))
			}

			sw := &syncStatusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(sw, r)

			if sw.status < 200 || sw.status >= 300 {
				return
			}

			// Merge the created entity's id back into the stored request body
			// so replays on the client converge on the same primary key.
			storedBody := reqBody
			var parsed map[string]interface{}
			if len(reqBody) > 0 && json.Unmarshal(reqBody, &parsed) == nil {
				var resp map[string]interface{}
				if json.Unmarshal(sw.buf.Bytes(), &resp) == nil {
					if id, ok := resp["id"].(string); ok && id != "" {
						if _, has := parsed["id"]; !has {
							parsed["id"] = id
						}
					}
				}
				if merged, err := json.Marshal(parsed); err == nil {
					storedBody = merged
				}
			}

			// Path stored without the /api prefix (clients replay through
			// their own router); the query string is preserved.
			path := strings.TrimPrefix(r.URL.Path, "/api")
			if r.URL.RawQuery != "" {
				path += "?" + r.URL.RawQuery
			}

			storeID := r.URL.Query().Get("storeId")
			if storeID == "" {
				storeID = r.URL.Query().Get("store_id")
			}
			if storeID == "" && parsed != nil {
				if v, ok := parsed["storeId"].(string); ok {
					storeID = v
				} else if v, ok := parsed["store_id"].(string); ok {
					storeID = v
				}
			}
			if storeID == "" {
				if claims, ok := GetUserFromContext(r.Context()); ok {
					storeID = claims.StoreID
				}
			}

			entityKey := syncutil.EntityKey(path, storedBody)
			if storeID == "" && entityKey != "" {
				// Resolve the mutated row's store (e.g. a superadmin whose
				// token carries no store_id) so the event doesn't broadcast
				// to every store's clients.
				storeID = resolveStoreID(r, db, entityKey)
			}

			var bodyArg interface{}
			if len(storedBody) > 0 {
				bodyArg = string(storedBody)
			}
			var storeArg interface{}
			if storeID != "" {
				storeArg = storeID
			}

			ts := time.Now().UTC()
			if _, err := db.ExecContext(r.Context(),
				"INSERT INTO sync_events (method, path, body, store_id, created_at) VALUES ($1, $2, $3, $4, $5)",
				m, path, bodyArg, storeArg, ts); err != nil {
				// Never fail the request because of sync logging.
				_ = err
			}
			if entityKey != "" {
				markEntityTS(r, db, entityKey, ts)
			}
		})
	}
}

// markEntityTS records the mutation's origin time for the entity, used by
// /sync/apply to drop replays that are older than the row's last write.
func markEntityTS(r *http.Request, db *sql.DB, entityKey string, ts time.Time) {
	_, _ = db.ExecContext(r.Context(),
		`INSERT INTO sync_entity_ts (entity_key, last_ts) VALUES ($1, $2)
		 ON CONFLICT (entity_key) DO UPDATE SET last_ts = EXCLUDED.last_ts
		 WHERE EXCLUDED.last_ts > sync_entity_ts.last_ts`,
		entityKey, ts)
}

// resolveStoreID finds the store owning a mutated row ("<table>/<id>") so
// sync_events stay store-scoped even when the caller's JWT has no store_id.
func resolveStoreID(r *http.Request, db *sql.DB, entityKey string) string {
	table, id, _ := strings.Cut(entityKey, "/")
	if table == "stores" {
		return id
	}
	var storeID string
	if err := db.QueryRowContext(r.Context(),
		fmt.Sprintf("SELECT store_id FROM %s WHERE id = $1", table), id,
	).Scan(&storeID); err != nil {
		return ""
	}
	return storeID
}
