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

// PrintHub is a Hub variant for the remote bill-print channel that also
// tracks which device IDs are connected per store. Delivery is scoped per
// store and connections are only accepted for the store's designated printer
// device (enforced by the HTTP handler), so a broadcast here can only ever
// reach devices authorized to print that store's bills.
type PrintHub struct {
	hub     *Hub
	mu      sync.RWMutex
	devices map[string]map[string]int // storeID -> deviceID -> connection count
}

func NewPrintHub() *PrintHub {
	return &PrintHub{
		hub:     NewHub(),
		devices: make(map[string]map[string]int),
	}
}

func (p *PrintHub) Register(storeID, deviceID string, ch chan string) {
	p.hub.Register(storeID, ch)
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, ok := p.devices[storeID]; !ok {
		p.devices[storeID] = make(map[string]int)
	}
	p.devices[storeID][deviceID]++
}

func (p *PrintHub) Unregister(storeID, deviceID string, ch chan string) {
	p.hub.Unregister(storeID, ch)
	p.mu.Lock()
	defer p.mu.Unlock()
	devs, ok := p.devices[storeID]
	if !ok {
		return
	}
	devs[deviceID]--
	if devs[deviceID] <= 0 {
		delete(devs, deviceID)
	}
	if len(devs) == 0 {
		delete(p.devices, storeID)
	}
}

func (p *PrintHub) Broadcast(storeID, message string) {
	p.hub.Broadcast(storeID, message)
}

// IsDeviceConnected reports whether the given device currently holds at least
// one open print channel for the store. Used to tell enqueue callers whether a
// printer is actually listening.
func (p *PrintHub) IsDeviceConnected(storeID, deviceID string) bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.devices[storeID][deviceID] > 0
}
