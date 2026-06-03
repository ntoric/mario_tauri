package realtime

import (
	"sync"
	"testing"
	"time"
)

func TestNewHub(t *testing.T) {
	hub := NewHub()
	if hub == nil {
		t.Fatal("NewHub() returned nil")
	}
	if hub.clients == nil {
		t.Fatal("clients map is nil")
	}
}

func TestHub_RegisterAndBroadcast(t *testing.T) {
	hub := NewHub()
	ch := make(chan string, 1)

	hub.Register("store-1", ch)

	hub.Broadcast("store-1", "order_created")

	select {
	case msg := <-ch:
		if msg != "order_created" {
			t.Errorf("received %q, want %q", msg, "order_created")
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("did not receive broadcast message")
	}
}

func TestHub_BroadcastToCorrectStore(t *testing.T) {
	hub := NewHub()
	ch1 := make(chan string, 1)
	ch2 := make(chan string, 1)

	hub.Register("store-1", ch1)
	hub.Register("store-2", ch2)

	hub.Broadcast("store-1", "msg-for-store-1")

	select {
	case msg := <-ch1:
		if msg != "msg-for-store-1" {
			t.Errorf("ch1 received %q, want %q", msg, "msg-for-store-1")
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("ch1 did not receive message")
	}

	select {
	case msg := <-ch2:
		t.Errorf("ch2 should not have received message, got %q", msg)
	case <-time.After(50 * time.Millisecond):
		// Expected: no message for store-2
	}
}

func TestHub_MultipleClientsPerStore(t *testing.T) {
	hub := NewHub()
	ch1 := make(chan string, 1)
	ch2 := make(chan string, 1)

	hub.Register("store-1", ch1)
	hub.Register("store-1", ch2)

	hub.Broadcast("store-1", "refresh")

	for i, ch := range []chan string{ch1, ch2} {
		select {
		case msg := <-ch:
			if msg != "refresh" {
				t.Errorf("ch%d received %q, want %q", i+1, msg, "refresh")
			}
		case <-time.After(100 * time.Millisecond):
			t.Errorf("ch%d did not receive message", i+1)
		}
	}
}

func TestHub_Unregister(t *testing.T) {
	hub := NewHub()
	ch := make(chan string, 1)

	hub.Register("store-1", ch)
	hub.Unregister("store-1", ch)

	hub.Broadcast("store-1", "should-not-receive")

	select {
	case msg := <-ch:
		t.Errorf("unregistered channel received message: %q", msg)
	case <-time.After(50 * time.Millisecond):
		// Expected
	}
}

func TestHub_UnregisterCleansUpEmptyStore(t *testing.T) {
	hub := NewHub()
	ch := make(chan string, 1)

	hub.Register("store-1", ch)
	hub.Unregister("store-1", ch)

	hub.mu.RLock()
	_, exists := hub.clients["store-1"]
	hub.mu.RUnlock()

	if exists {
		t.Error("store-1 entry should be removed when last client unregisters")
	}
}

func TestHub_UnregisterNonexistentStore(t *testing.T) {
	hub := NewHub()
	ch := make(chan string, 1)

	// Should not panic
	hub.Unregister("nonexistent-store", ch)
}

func TestHub_BroadcastAll(t *testing.T) {
	hub := NewHub()
	ch := make(chan string, 1)

	hub.Register(GlobalChannel, ch)

	hub.BroadcastAll("global-msg")

	select {
	case msg := <-ch:
		if msg != "global-msg" {
			t.Errorf("received %q, want %q", msg, "global-msg")
		}
	case <-time.After(100 * time.Millisecond):
		t.Fatal("did not receive BroadcastAll message")
	}
}

func TestHub_BroadcastDropsOnFullChannel(t *testing.T) {
	hub := NewHub()
	// Unbuffered channel - simulate a slow consumer
	ch := make(chan string)

	hub.Register("store-1", ch)

	// Broadcast should not block even if channel is full
	done := make(chan struct{})
	go func() {
		hub.Broadcast("store-1", "dropped-msg")
		close(done)
	}()

	select {
	case <-done:
		// Broadcast returned without blocking
	case <-time.After(100 * time.Millisecond):
		t.Fatal("Broadcast blocked on full channel")
	}
}

func TestHub_ConcurrentAccess(t *testing.T) {
	hub := NewHub()
	var wg sync.WaitGroup

	// Spawn concurrent registrations, broadcasts, and unregistrations
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			ch := make(chan string, 10)
			hub.Register("store-concurrent", ch)
			hub.Broadcast("store-concurrent", "msg")
			hub.Unregister("store-concurrent", ch)
		}(i)
	}

	wg.Wait()
}
