package queue

import "time"

var istZone = time.FixedZone("IST", 5*3600+30*60)

// InQuietHours reports whether now falls in the nightly pause window
// (00:30-07:30 IST). All background pollers skip their work during this
// window; the request-log cleanup is exempt and keeps running.
func InQuietHours(now time.Time) bool {
	t := now.In(istZone)
	mins := t.Hour()*60 + t.Minute()
	return mins >= 30 && mins < 7*60+30
}
