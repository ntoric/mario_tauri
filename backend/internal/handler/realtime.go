package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"cafe-backend/internal/middleware"

	"github.com/gorilla/websocket"
)

var tableStatusUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Handler) broadcastTableStatusUpdate(storeID, reason string) {
	if h.Realtime == nil || storeID == "" {
		return
	}

	msg, err := json.Marshal(map[string]string{
		"type":    "table_status_update",
		"storeId": storeID,
		"reason":  reason,
	})
	if err != nil {
		return
	}

	h.Realtime.Broadcast(storeID, string(msg))
}

// TableStatusWS handles websocket stream for table status updates.
func (h *Handler) TableStatusWS(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	targetStoreID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	conn, err := tableStatusUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ch := make(chan string, 8)
	h.Realtime.Register(targetStoreID, ch)
	defer h.Realtime.Unregister(targetStoreID, ch)

	go func() {
		for {
			_, raw, readErr := conn.ReadMessage()
			if readErr != nil {
				return
			}

			var msg map[string]interface{}
			if err := json.Unmarshal(raw, &msg); err != nil {
				continue
			}
		}
	}()

	initialMsg, _ := json.Marshal(map[string]string{
		"type":    "connected",
		"storeId": targetStoreID,
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
