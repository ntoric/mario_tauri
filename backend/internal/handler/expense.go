package handler

import (
	"log"
	"net/http"
	"time"

	"cafe-backend/internal/models"

	"github.com/google/uuid"
)

// Expense Category Handlers

func (h *Handler) GetExpenseCategories(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	categories, err := h.Repo.ExpenseCategory.GetAll(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch expense categories")
		return
	}

	h.writeJSON(w, http.StatusOK, categories)
}

func (h *Handler) CreateExpenseCategory(w http.ResponseWriter, r *http.Request) {
	var req models.ExpenseCategory
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.StoreID == "" || req.Name == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID and name are required")
		return
	}

	req.ID = uuid.New().String()
	req.IsActive = true
	req.CreatedAt = time.Now()

	if err := h.Repo.ExpenseCategory.Create(r.Context(), req); err != nil {
		log.Printf("[ExpenseCategory Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to create expense category")
		return
	}

	h.writeJSON(w, http.StatusCreated, req)
}

func (h *Handler) UpdateExpenseCategory(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/expense-categories/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Category ID is required")
		return
	}

	var req models.ExpenseCategory
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.ID = id
	if err := h.Repo.ExpenseCategory.Update(r.Context(), req); err != nil {
		log.Printf("[ExpenseCategory Update] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to update expense category")
		return
	}

	h.writeJSON(w, http.StatusOK, req)
}

func (h *Handler) DeleteExpenseCategory(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/expense-categories/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Category ID is required")
		return
	}

	if err := h.Repo.ExpenseCategory.Delete(r.Context(), id); err != nil {
		log.Printf("[ExpenseCategory Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete expense category")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Expense category deleted successfully"})
}

// Expense Handlers

func (h *Handler) GetExpenses(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	startDate := r.URL.Query().Get("startDate")
	endDate := r.URL.Query().Get("endDate")

	expenses, err := h.Repo.Expense.GetAll(r.Context(), storeID, startDate, endDate)
	if err != nil {
		log.Printf("[Expense GetAll] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch expenses")
		return
	}

	h.writeJSON(w, http.StatusOK, expenses)
}

func (h *Handler) GetExpense(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/expenses/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Expense ID is required")
		return
	}

	expense, err := h.Repo.Expense.GetByID(r.Context(), id)
	if err != nil {
		log.Printf("[Expense GetByID] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch expense")
		return
	}

	if expense == nil {
		h.writeError(w, http.StatusNotFound, "Expense not found")
		return
	}

	h.writeJSON(w, http.StatusOK, expense)
}

func (h *Handler) CreateExpense(w http.ResponseWriter, r *http.Request) {
	var req models.Expense
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.StoreID == "" || req.Title == "" || req.Amount == 0 {
		h.writeError(w, http.StatusBadRequest, "Store ID, title, and amount are required")
		return
	}

	if req.ExpenseDate.IsZero() {
		req.ExpenseDate = time.Now()
	}

	req.ID = uuid.New().String()
	req.IsActive = true
	req.CreatedAt = time.Now()
	req.UpdatedAt = time.Now()

	if err := h.Repo.Expense.Create(r.Context(), req); err != nil {
		log.Printf("[Expense Create] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to create expense")
		return
	}

	h.writeJSON(w, http.StatusCreated, req)
}

func (h *Handler) UpdateExpense(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/expenses/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Expense ID is required")
		return
	}

	var req models.Expense
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.ID = id
	req.UpdatedAt = time.Now()

	if err := h.Repo.Expense.Update(r.Context(), req); err != nil {
		log.Printf("[Expense Update] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to update expense")
		return
	}

	h.writeJSON(w, http.StatusOK, req)
}

func (h *Handler) DeleteExpense(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Path[len("/api/expenses/"):]
	if id == "" {
		h.writeError(w, http.StatusBadRequest, "Expense ID is required")
		return
	}

	if err := h.Repo.Expense.Delete(r.Context(), id); err != nil {
		log.Printf("[Expense Delete] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to delete expense")
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Expense deleted successfully"})
}

// Expense Report Handlers

func (h *Handler) GetExpenseReportByCategory(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	startDate := r.URL.Query().Get("startDate")
	endDate := r.URL.Query().Get("endDate")

	reports, err := h.Repo.Expense.GetReportByCategory(r.Context(), storeID, startDate, endDate)
	if err != nil {
		log.Printf("[Expense Report ByCategory] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch expense report")
		return
	}

	h.writeJSON(w, http.StatusOK, reports)
}

func (h *Handler) GetExpenseSummaryByDate(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	startDate := r.URL.Query().Get("startDate")
	endDate := r.URL.Query().Get("endDate")

	summaries, err := h.Repo.Expense.GetSummaryByDate(r.Context(), storeID, startDate, endDate)
	if err != nil {
		log.Printf("[Expense Summary ByDate] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch expense summary")
		return
	}

	h.writeJSON(w, http.StatusOK, summaries)
}

// Revenue Report Handlers

func (h *Handler) GetRevenueReport(w http.ResponseWriter, r *http.Request) {
	storeID := r.URL.Query().Get("storeId")
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "Store ID is required")
		return
	}

	startDate := r.URL.Query().Get("startDate")
	endDate := r.URL.Query().Get("endDate")

	report, err := h.Repo.RevenueReport.GetRevenueReport(r.Context(), storeID, startDate, endDate)
	if err != nil {
		log.Printf("[Revenue Report] Database error: %v", err)
		h.writeError(w, http.StatusInternalServerError, "Failed to fetch revenue report")
		return
	}

	h.writeJSON(w, http.StatusOK, report)
}
