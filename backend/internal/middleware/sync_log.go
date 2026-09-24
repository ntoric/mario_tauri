package middleware

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"
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

			// Path stored without the /api prefix (clients replay through
			// their own router); the query string is preserved.
			path := strings.TrimPrefix(r.URL.Path, "/api")
			if r.URL.RawQuery != "" {
				path += "?" + r.URL.RawQuery
			}

			var bodyArg interface{}
			if len(storedBody) > 0 {
				bodyArg = string(storedBody)
			}
			var storeArg interface{}
			if storeID != "" {
				storeArg = storeID
			}

			if _, err := db.ExecContext(r.Context(),
				"INSERT INTO sync_events (method, path, body, store_id) VALUES ($1, $2, $3, $4)",
				m, path, bodyArg, storeArg); err != nil {
				// Never fail the request because of sync logging.
				_ = err
			}
		})
	}
}
