package realtime

import "sync"

type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[chan string]struct{}
}

const GlobalChannel = "__all__"

func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]map[chan string]struct{}),
	}
}

func (h *Hub) Register(storeID string, ch chan string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[storeID]; !ok {
		h.clients[storeID] = make(map[chan string]struct{})
	}
	h.clients[storeID][ch] = struct{}{}
}

func (h *Hub) Unregister(storeID string, ch chan string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	storeClients, ok := h.clients[storeID]
	if !ok {
		return
	}
	delete(storeClients, ch)
	if len(storeClients) == 0 {
		delete(h.clients, storeID)
	}
}

func (h *Hub) Broadcast(storeID, message string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for ch := range h.clients[storeID] {
		select {
		case ch <- message:
		default:
		}
	}
}

func (h *Hub) BroadcastAll(message string) {
	h.Broadcast(GlobalChannel, message)
}
