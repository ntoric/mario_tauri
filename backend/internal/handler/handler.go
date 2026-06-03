package handler

import (
	"encoding/json"
	"net/http"

	"cafe-backend/internal/config"
	"cafe-backend/internal/realtime"
	"cafe-backend/internal/repository"
)

type Handler struct {
	Repo     *repository.Repository
	Cfg      *config.Config
	Realtime *realtime.Hub
}

func NewHandler(repo *repository.Repository, cfg *config.Config, realtimeHub *realtime.Hub) *Handler {
	return &Handler{Repo: repo, Cfg: cfg, Realtime: realtimeHub}
}

// JSON helpers to reduce boilerplate and guarantee standardized casing

func (h *Handler) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		// Log error or fall back
		http.Error(w, `{"error": "Internal Server Error"}`, http.StatusInternalServerError)
	}
}

func (h *Handler) writeError(w http.ResponseWriter, status int, errMsg string) {
	h.writeJSON(w, status, map[string]string{"error": errMsg})
}

func (h *Handler) readJSON(r *http.Request, data interface{}) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(data)
}
