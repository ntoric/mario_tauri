// Package syncutil resolves which entity a mutation targets, shared by the
// sync-log middleware (cloud-originated writes) and the /sync/apply replay
// path (client-originated writes) so last-write-wins ordering and store
// scoping agree on both paths.
package syncutil

import (
	"encoding/json"
	"strings"
)

// entityTables maps the first path segment to its table for syncable
// entities. Entities absent here (config, reports, sections) are not
// tracked for last-write-wins ordering.
var entityTables = map[string]string{
	"orders":             "orders",
	"items":              "items",
	"categories":         "categories",
	"tables":             "tables",
	"users":              "users",
	"expenses":           "expenses",
	"expense-categories": "expense_categories",
	"item-expenses":      "item_expenses",
	"stores":             "stores",
	"bills":              "bills",
}

// EntityTarget resolves (table, id) for the row a mutation writes. The id
// comes from the second path segment when it looks like a client-generated
// id ("/orders/abc-123/cancel" → orders/abc-123); for creates and action
// endpoints the body's "id" field is used instead. Returns empty strings
// when the request doesn't target a single row.
func EntityTarget(path string, body []byte) (table, id string) {
	p := strings.SplitN(path, "?", 2)[0]
	segs := strings.FieldsFunc(p, func(r rune) bool { return r == '/' })
	if len(segs) == 0 {
		return "", ""
	}
	table, ok := entityTables[segs[0]]
	if !ok {
		return "", ""
	}
	if len(segs) > 1 && looksLikeID(segs[1]) {
		id = segs[1]
	}
	if id == "" && len(body) > 0 {
		var parsed map[string]interface{}
		if json.Unmarshal(body, &parsed) == nil {
			if v, ok := parsed["id"].(string); ok && looksLikeID(v) {
				id = v
			}
		}
	}
	if id == "" {
		return "", ""
	}
	return table, id
}

// EntityKey returns the canonical "<table>/<id>" key used in sync_entity_ts.
func EntityKey(path string, body []byte) string {
	table, id := EntityTarget(path, body)
	if table == "" {
		return ""
	}
	return table + "/" + id
}

// looksLikeID distinguishes entity ids (client-generated UUIDs with 4
// dashes) from action segments like "parcel", "save-ebill" or "sections".
func looksLikeID(s string) bool {
	return len(s) >= 20 && strings.Count(s, "-") >= 2
}
