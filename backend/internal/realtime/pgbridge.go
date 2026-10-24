package realtime

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// pgChannel is the Postgres NOTIFY channel used to relay realtime events
// between backend instances sharing the same database.
const pgChannel = "table_status_events"

// printPgChannel relays remote bill-print events between backend instances.
// It is deliberately separate from pgChannel so bill payloads are only ever
// re-delivered to designated-printer clients — never to ordinary realtime
// subscribers — and so table-status traffic doesn't wake the print channel.
const printPgChannel = "bill_print_events"

// bridgeEvent is the wire payload carried by pg_notify. Src identifies the
// publishing instance so it can drop its own echo.
type bridgeEvent struct {
	Src     string `json:"src"`
	StoreID string `json:"storeId"`
	Msg     string `json:"msg"`
}

// LocalBroadcaster is the subset of hub behavior the bridge needs to
// re-deliver sibling-instance events to this instance's own websocket
// clients. Both *Hub and *PrintHub satisfy it.
type LocalBroadcaster interface {
	BroadcastLocal(storeID, message string)
}

// PgBridge relays hub broadcasts across backend instances through Postgres
// LISTEN/NOTIFY. Clients are spread over several processes (e.g. the mobile
// app and the desktop app reach different backend hosts backed by one
// database), so an order created through one instance must still reach
// websocket clients of the others. Each instance publishes its outgoing
// events on its bridge channel and re-delivers notifications from siblings
// to its local clients — delivery stays scoped to the event's store.
type PgBridge struct {
	hub      LocalBroadcaster
	channel  string
	db       *sql.DB
	connInfo string
	instance string
}

func NewPgBridge(db *sql.DB, connInfo string, hub *Hub) *PgBridge {
	return newPgBridge(db, connInfo, pgChannel, hub)
}

// NewPrintPgBridge builds the bridge for the remote bill-print channel. It
// listens and publishes on printPgChannel only.
func NewPrintPgBridge(db *sql.DB, connInfo string, printHub *PrintHub) *PgBridge {
	return newPgBridge(db, connInfo, printPgChannel, printHub)
}

func newPgBridge(db *sql.DB, connInfo, channel string, hub LocalBroadcaster) *PgBridge {
	return &PgBridge{
		hub:      hub,
		channel:  channel,
		db:       db,
		connInfo: connInfo,
		instance: uuid.NewString(),
	}
}

// Publish is the Hub publisher hook. Local delivery already happened in
// Hub.Broadcast; this only fans the event out to sibling instances.
func (b *PgBridge) Publish(storeID, message string) {
	payload, err := json.Marshal(bridgeEvent{Src: b.instance, StoreID: storeID, Msg: message})
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if _, err := b.db.ExecContext(ctx, "SELECT pg_notify($1, $2)", b.channel, string(payload)); err != nil {
		log.Printf("[realtime] pg_notify failed: %v", err)
	}
}

// Listen consumes pg_notify events and delivers them to this instance's
// websocket clients. It re-LISTENs after connection loss until ctx is done.
func (b *PgBridge) Listen(ctx context.Context) {
	for {
		if err := b.listen(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[realtime] pg listener error: %v — retrying", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}

func (b *PgBridge) listen(ctx context.Context) error {
	conn, err := pgx.Connect(ctx, b.connInfo)
	if err != nil {
		return err
	}
	defer conn.Close(context.Background())

	if _, err := conn.Exec(ctx, "LISTEN "+b.channel); err != nil {
		return err
	}
	log.Printf("[realtime] listening for cross-instance events on Postgres channel %s", b.channel)

	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		var ev bridgeEvent
		if err := json.Unmarshal([]byte(n.Payload), &ev); err != nil {
			continue
		}
		if ev.Src == b.instance || ev.StoreID == "" || ev.Msg == "" {
			continue
		}
		b.hub.BroadcastLocal(ev.StoreID, ev.Msg)
	}
}
