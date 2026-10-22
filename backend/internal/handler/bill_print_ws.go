package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"cafe-backend/internal/middleware"

	"github.com/gorilla/websocket"
)

var billPrintUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// BillPrintWS handles the dedicated websocket stream for remote bill printing.
// Access is strictly gated: the connecting device must be the store's
// designated bill printer (stores.remote_printer_device_id), so a queued bill
// can only ever be delivered to its own store's printer.
func (h *Handler) BillPrintWS(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	deviceID := r.URL.Query().Get("deviceId")
	if _, ok := h.requirePrintDevice(w, r, targetStoreID, deviceID); !ok {
		return
	}

	conn, err := billPrintUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ch := make(chan string, 16)
	h.PrintHub.Register(targetStoreID, deviceID, ch)
	defer h.PrintHub.Unregister(targetStoreID, deviceID, ch)

	go func() {
		for {
			if _, _, readErr := conn.ReadMessage(); readErr != nil {
				return
			}
		}
	}()

	initialMsg, _ := json.Marshal(map[string]string{
		"type":     "connected",
		"storeId":  targetStoreID,
		"deviceId": deviceID,
	})
	_ = conn.WriteMessage(websocket.TextMessage, initialMsg)

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg := <-ch:
			if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
				return
			}
		case <-ticker.C:
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
