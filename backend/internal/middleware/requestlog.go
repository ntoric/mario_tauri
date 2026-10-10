package middleware

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"cafe-backend/internal/session"
)

// istLocation is the fixed Asia/Kolkata offset used for the daily log
// boundary and cleanup schedule.
var istLocation = time.FixedZone("IST", 5*3600+30*60)

// cleanupHour is the IST hour at which old request logs are purged (3 AM).
const cleanupHour = 3

type requestLogEntry struct {
	Time       string `json:"ts"`
	RequestID  string `json:"req_id,omitempty"`
	Method     string `json:"method"`
	Path       string `json:"path"`
	Query      string `json:"query,omitempty"`
	Status     int    `json:"status"`
	DurationMs int64  `json:"dur_ms"`
	RemoteIP   string `json:"ip"`
	UserAgent  string `json:"ua,omitempty"`
	SessionID  string `json:"session,omitempty"`
	UserID     string `json:"user_id,omitempty"`
	Role       string `json:"role,omitempty"`
	StoreID    string `json:"store_id,omitempty"`
}

// RequestLogger appends one JSON line per HTTP request to a daily log file.
// Files are named requests-YYYY-MM-DD.log where the "day" is anchored at
// 03:00 IST: requests between midnight and 03:00 belong to the previous day's
// file, so each file holds at most 24 hours of traffic and is fully purged by
// the daily cleanup.
type RequestLogger struct {
	dir       string
	sessions  *session.Store
	mu        sync.Mutex
	file      *os.File
	anchorDay string
}

func NewRequestLogger(dir string, sessions *session.Store) (*RequestLogger, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &RequestLogger{dir: dir, sessions: sessions}, nil
}

// anchorDate returns the log day for t: the IST calendar date of the most
// recent 03:00 boundary.
func anchorDate(t time.Time) string {
	ist := t.In(istLocation)
	if ist.Hour() < cleanupHour {
		ist = ist.AddDate(0, 0, -1)
	}
	return ist.Format("2006-01-02")
}

func (rl *RequestLogger) filename(day string) string {
	return filepath.Join(rl.dir, "requests-"+day+".log")
}

// writerFor returns the log file for the anchor day of now, rotating the open
// file when the 03:00 IST boundary has been crossed.
func (rl *RequestLogger) writerFor(now time.Time) (*os.File, error) {
	day := anchorDate(now)
	if rl.file != nil && rl.anchorDay == day {
		return rl.file, nil
	}
	if rl.file != nil {
		rl.file.Close()
		rl.file = nil
	}
	f, err := os.OpenFile(rl.filename(day), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, err
	}
	rl.file = f
	rl.anchorDay = day
	return f, nil
}

// Middleware logs every request (except the health probe) as a JSON line.
// Request bodies are never logged, so credentials and payloads stay out of the
// log files; the JWT claims are recorded for attribution only.
func (rl *RequestLogger) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}

		entry := requestLogEntry{
			Time:       start.In(istLocation).Format(time.RFC3339),
			RequestID:  chimiddleware.GetReqID(r.Context()),
			Method:     r.Method,
			Path:       r.URL.Path,
			Query:      r.URL.RawQuery,
			Status:     status,
			DurationMs: time.Since(start).Milliseconds(),
			RemoteIP:   r.RemoteAddr,
			UserAgent:  r.UserAgent(),
		}

		// Record the session identity for attribution. A truncated token
		// fingerprint is always logged; when the session store is available it
		// is resolved to the real user.
		if tok := bearerToken(r); tok != "" {
			fingerprint := tok
			if len(fingerprint) > 8 {
				fingerprint = fingerprint[:8]
			}
			entry.SessionID = fingerprint
			if rl.sessions != nil {
				if data, err := rl.sessions.Get(r.Context(), tok); err == nil {
					entry.UserID = data.UserID
					entry.Role = data.Role
					entry.StoreID = data.StoreID
				}
			}
		}

		line, err := json.Marshal(entry)
		if err != nil {
			return
		}

		rl.mu.Lock()
		defer rl.mu.Unlock()
		if f, err := rl.writerFor(start); err == nil {
			_, _ = f.Write(append(line, '\n'))
		}
	})
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return h[7:]
	}
	return ""
}

// nextCleanup returns the next 03:00 IST instant after now.
func nextCleanup(now time.Time) time.Time {
	ist := now.In(istLocation)
	next := time.Date(ist.Year(), ist.Month(), ist.Day(), cleanupHour, 0, 0, 0, istLocation)
	if !next.After(ist) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

// purgeAllExcept deletes every requests-*.log file except keepPath.
func (rl *RequestLogger) purgeAllExcept(keepPath string) {
	entries, err := os.ReadDir(rl.dir)
	if err != nil {
		log.Printf("[requestlog] cleanup: cannot read dir %s: %v", rl.dir, err)
		return
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasPrefix(name, "requests-") || !strings.HasSuffix(name, ".log") {
			continue
		}
		p := filepath.Join(rl.dir, name)
		if p == keepPath {
			continue
		}
		if err := os.Remove(p); err != nil {
			log.Printf("[requestlog] cleanup: failed to remove %s: %v", p, err)
		}
	}
}

// purgeOlderThan deletes request log files not modified within maxAge. Used at
// startup so files left behind by downtime do not linger forever.
func (rl *RequestLogger) purgeOlderThan(maxAge time.Duration) {
	entries, err := os.ReadDir(rl.dir)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-maxAge)
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasPrefix(name, "requests-") || !strings.HasSuffix(name, ".log") {
			continue
		}
		info, err := e.Info()
		if err != nil || info.ModTime().After(cutoff) {
			continue
		}
		_ = os.Remove(filepath.Join(rl.dir, name))
	}
}

// StartDailyCleanup removes stale request logs at startup (anything older than
// 24h) and then purges all previous log files every day at 03:00 IST, so at
// most ~24 hours of request history is ever retained.
func (rl *RequestLogger) StartDailyCleanup() {
	go func() {
		rl.purgeOlderThan(24 * time.Hour)
		for {
			next := nextCleanup(time.Now())
			timer := time.NewTimer(time.Until(next))
			<-timer.C
			rl.purgeAllExcept(rl.filename(anchorDate(time.Now())))
			log.Printf("[requestlog] daily cleanup completed at %s", time.Now().In(istLocation).Format(time.RFC3339))
		}
	}()
}
