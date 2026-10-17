package handler

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"

	"github.com/go-chi/chi/v5"
)

var (
	supportCategories = map[string]bool{
		"general": true, "bug": true, "billing": true,
		"feature": true, "account": true, "other": true,
	}
	supportPriorities = map[string]bool{
		"low": true, "medium": true, "high": true,
	}
	supportStatuses = map[string]bool{
		"open": true, "in_progress": true, "resolved": true, "closed": true,
	}
)

// canAccessTicket reports whether the caller may view/reply to a ticket:
// superadmin always; other roles only when the ticket's store is theirs.
func (h *Handler) canAccessTicket(w http.ResponseWriter, r *http.Request, claims *middleware.UserClaims, ticketID string) bool {
	if claims.Role == "superadmin" {
		return true
	}
	return h.requireRecordStoreAccess(w, r, claims, "support_tickets", ticketID)
}

// CreateSupportTicket handles POST /api/support/tickets
func (h *Handler) CreateSupportTicket(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var req models.CreateSupportTicketRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	req.Subject = strings.TrimSpace(req.Subject)
	req.Message = strings.TrimSpace(req.Message)
	if req.Subject == "" {
		h.writeError(w, http.StatusBadRequest, "Subject is required")
		return
	}
	if req.Message == "" {
		h.writeError(w, http.StatusBadRequest, "Message is required")
		return
	}
	if req.Category == "" {
		req.Category = "general"
	}
	if !supportCategories[req.Category] {
		h.writeError(w, http.StatusBadRequest, "Invalid category")
		return
	}
	if req.Priority == "" {
		req.Priority = "medium"
	}
	if !supportPriorities[req.Priority] {
		h.writeError(w, http.StatusBadRequest, "Invalid priority")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, req.StoreID)
	if !ok {
		return
	}

	ticket, err := h.Repo.SupportTicket.Create(r.Context(), storeID, claims.ID, req)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, map[string]interface{}{"ticket": ticket})
}

// GetSupportTickets handles GET /api/support/tickets?storeId=
// Lists the caller's store tickets ("my support requests").
func (h *Handler) GetSupportTickets(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	tickets, err := h.Repo.SupportTicket.ListByStore(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{"tickets": tickets})
}

// GetAllSupportTickets handles GET /api/admin/support/tickets?status=
// Superadmin inbox of every store's requests.
func (h *Handler) GetAllSupportTickets(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	tickets, err := h.Repo.SupportTicket.ListAll(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{"tickets": tickets})
}

// GetSupportTicket handles GET /api/support/tickets/{id}
// Returns the ticket with its full message thread.
func (h *Handler) GetSupportTicket(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	ticketID := chi.URLParam(r, "id")
	if !h.canAccessTicket(w, r, claims, ticketID) {
		return
	}

	ticket, err := h.Repo.SupportTicket.GetByID(r.Context(), ticketID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			h.writeError(w, http.StatusNotFound, "Ticket not found")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	messages, err := h.Repo.SupportTicket.ListMessages(r.Context(), ticketID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, models.SupportTicketDetail{
		Ticket:   ticket,
		Messages: messages,
	})
}

// CreateSupportMessage handles POST /api/support/tickets/{id}/messages
func (h *Handler) CreateSupportMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	ticketID := chi.URLParam(r, "id")
	if !h.canAccessTicket(w, r, claims, ticketID) {
		return
	}

	var req models.CreateSupportMessageRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" {
		h.writeError(w, http.StatusBadRequest, "Message is required")
		return
	}

	msg, err := h.Repo.SupportTicket.AddMessage(r.Context(), ticketID, claims.ID, claims.Role, req.Message)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Return the updated ticket too — workflow side-effects may have moved its status.
	ticket, err := h.Repo.SupportTicket.GetByID(r.Context(), ticketID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusCreated, map[string]interface{}{
		"message": msg,
		"ticket":  ticket,
	})
}

// UpdateSupportTicketStatus handles PATCH /api/support/tickets/{id}/status (superadmin)
func (h *Handler) UpdateSupportTicketStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	ticketID := chi.URLParam(r, "id")

	var req models.UpdateSupportTicketStatusRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if !supportStatuses[req.Status] {
		h.writeError(w, http.StatusBadRequest, "Invalid status")
		return
	}

	if err := h.Repo.SupportTicket.UpdateStatus(r.Context(), ticketID, req.Status); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			h.writeError(w, http.StatusNotFound, "Ticket not found")
		} else {
			h.writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	ticket, err := h.Repo.SupportTicket.GetByID(r.Context(), ticketID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{"ticket": ticket})
}
