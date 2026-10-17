package handler

import (
	"net/http"
	"strconv"
	"strings"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/repository"
)

// parseReportFilter reads the shared query params for the top-selling
// reports: startDate/endDate, search, sort, dir, page, pageSize, all.
func parseReportFilter(r *http.Request) repository.ReportFilter {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(q.Get("pageSize"))
	if pageSize <= 0 {
		pageSize = 25
	}
	if pageSize > maxListLimit {
		pageSize = maxListLimit
	}

	return repository.ReportFilter{
		From:     parseTimeQuery(r, "startDate"),
		To:       parseTimeQuery(r, "endDate"),
		Search:   strings.TrimSpace(q.Get("search")),
		Sort:     q.Get("sort"),
		Dir:      q.Get("dir"),
		Page:     page,
		PageSize: pageSize,
		All:      q.Get("all") == "true",
	}
}

// GetTopSellingItems handles GET /api/reports/top-selling-items
// Returns a server-side paginated item-by-date sales report.
func (h *Handler) GetTopSellingItems(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := parseReportFilter(r)

	report, err := h.Repo.Report.GetTopSellingItems(r.Context(), storeID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if filter.All {
		report.Page = 1
		report.PageSize = report.Total
	}

	h.writeJSON(w, http.StatusOK, report)
}

// GetTopSellingCategories handles GET /api/reports/top-selling-categories
// Returns a server-side paginated category-by-date sales report.
func (h *Handler) GetTopSellingCategories(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := parseReportFilter(r)

	report, err := h.Repo.Report.GetTopSellingCategories(r.Context(), storeID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if filter.All {
		report.Page = 1
		report.PageSize = report.Total
	}

	h.writeJSON(w, http.StatusOK, report)
}

// GetSalesProfitReport handles GET /api/reports/sales-profit
// Returns a server-side paginated per-item sales profit report.
func (h *Handler) GetSalesProfitReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := parseReportFilter(r)

	report, err := h.Repo.Report.GetSalesProfit(r.Context(), storeID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if filter.All {
		report.Page = 1
		report.PageSize = report.Total
	}

	h.writeJSON(w, http.StatusOK, report)
}

// GetMenuProfitReport handles GET /api/reports/menu-profit
// Returns a server-side paginated menu item profit breakdown.
func (h *Handler) GetMenuProfitReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := parseReportFilter(r)

	report, err := h.Repo.Report.GetMenuProfit(r.Context(), storeID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if filter.All {
		report.Page = 1
		report.PageSize = report.Total
	}

	h.writeJSON(w, http.StatusOK, report)
}

// GetExpenseCategoryReport handles GET /api/reports/expenses-by-category
// Returns a server-side paginated expense report grouped by category.
func (h *Handler) GetExpenseCategoryReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := parseReportFilter(r)

	report, err := h.Repo.Report.GetExpensesByCategory(r.Context(), storeID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if filter.All {
		report.Page = 1
		report.PageSize = report.Total
	}

	h.writeJSON(w, http.StatusOK, report)
}

// GetExpenseDateReport handles GET /api/reports/expenses-by-date
// Returns a server-side paginated expense report grouped by date.
func (h *Handler) GetExpenseDateReport(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := parseReportFilter(r)

	report, err := h.Repo.Report.GetExpensesByDate(r.Context(), storeID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if filter.All {
		report.Page = 1
		report.PageSize = report.Total
	}

	h.writeJSON(w, http.StatusOK, report)
}

// GetRevenueEntries handles GET /api/reports/revenue-entries
// Returns a server-side paginated list of bill revenue entries for the
// profit report.
func (h *Handler) GetRevenueEntries(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := parseReportFilter(r)

	report, err := h.Repo.Report.GetRevenueEntries(r.Context(), storeID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if filter.All {
		report.Page = 1
		report.PageSize = report.Total
	}

	h.writeJSON(w, http.StatusOK, report)
}

// GetExpenseEntries handles GET /api/reports/expense-entries
// Returns a server-side paginated list of expense entries for the profit
// report.
func (h *Handler) GetExpenseEntries(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return
	}

	filter := parseReportFilter(r)

	report, err := h.Repo.Report.GetExpenseEntries(r.Context(), storeID, filter)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if filter.All {
		report.Page = 1
		report.PageSize = report.Total
	}

	h.writeJSON(w, http.StatusOK, report)
}
