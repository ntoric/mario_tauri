package handler

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"cafe-backend/internal/gst"
	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
	"cafe-backend/internal/repository"
)

// ==========================================
// GST REPORT AGGREGATION (pure helpers — unit tested)
// ==========================================

type taxAmounts struct {
	TaxableValue float64 `json:"taxableValue"`
	CGST         float64 `json:"cgst"`
	SGST         float64 `json:"sgst"`
	IGST         float64 `json:"igst"`
	Cess         float64 `json:"cess"`
}

func (a *taxAmounts) add(taxable, cgst, sgst, igst, cess float64) {
	a.TaxableValue = round2(a.TaxableValue + taxable)
	a.CGST = round2(a.CGST + cgst)
	a.SGST = round2(a.SGST + sgst)
	a.IGST = round2(a.IGST + igst)
	a.Cess = round2(a.Cess + cess)
}

func (a *taxAmounts) sub(other taxAmounts) {
	a.add(-other.TaxableValue, -other.CGST, -other.SGST, -other.IGST, -other.Cess)
}

func round2(x float64) float64 { return math.Round(x*100) / 100 }

// rateRow is one rateWise / GSTR-1 rates entry.
type rateRow struct {
	Rate         float64 `json:"rate"`
	B2BTaxable   float64 `json:"b2bTaxable,omitempty"`
	B2CTaxable   float64 `json:"b2cTaxable,omitempty"`
	TaxableValue float64 `json:"taxableValue"`
	IGST         float64 `json:"igst"`
	CGST         float64 `json:"cgst"`
	SGST         float64 `json:"sgst"`
	Cess         float64 `json:"cess"`
}

// aggregateRateWise nets bill lines against credit-note lines per rate.
// billByID maps bill IDs to their header (for the B2B split).
func aggregateRateWise(lines []repository.GSTLineRow, cnLines []repository.GSTCNLineRow, billsByID map[string]repository.GSTBillRow, cnByID map[string]repository.GSTCNRow) []rateRow {
	byRate := map[float64]*rateRow{}
	get := func(rate float64) *rateRow {
		if r, ok := byRate[rate]; ok {
			return r
		}
		r := &rateRow{Rate: rate}
		byRate[rate] = r
		return r
	}
	for _, l := range lines {
		r := get(l.Rate)
		r.TaxableValue = round2(r.TaxableValue + l.TaxableValue)
		r.CGST = round2(r.CGST + l.CGST)
		r.SGST = round2(r.SGST + l.SGST)
		r.IGST = round2(r.IGST + l.IGST)
		r.Cess = round2(r.Cess + l.Cess)
		if b, ok := billsByID[l.BillID]; ok && b.SupplyType == "B2B" {
			r.B2BTaxable = round2(r.B2BTaxable + l.TaxableValue)
		} else {
			r.B2CTaxable = round2(r.B2CTaxable + l.TaxableValue)
		}
	}
	for _, l := range cnLines {
		r := get(l.Rate)
		r.TaxableValue = round2(r.TaxableValue - l.TaxableValue)
		r.CGST = round2(r.CGST - l.CGST)
		r.SGST = round2(r.SGST - l.SGST)
		r.IGST = round2(r.IGST - l.IGST)
		r.Cess = round2(r.Cess - l.Cess)
		if cn, ok := cnByID[l.CreditNoteID]; ok && cn.ParentSupplyType == "B2B" {
			r.B2BTaxable = round2(r.B2BTaxable - l.TaxableValue)
		} else {
			r.B2CTaxable = round2(r.B2CTaxable - l.TaxableValue)
		}
	}
	out := make([]rateRow, 0, len(byRate))
	for _, r := range byRate {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Rate < out[j].Rate })
	return out
}

// hsnRow is one HSN summary row in the GSTR-1 HSN section.
type hsnRow struct {
	HSN          string  `json:"hsn"`
	Description  string  `json:"description"`
	UQC          string  `json:"uqc"`
	Quantity     float64 `json:"quantity"`
	Rate         float64 `json:"rate"`
	TaxableValue float64 `json:"taxableValue"`
	IGST         float64 `json:"igst"`
	CGST         float64 `json:"cgst"`
	SGST         float64 `json:"sgst"`
	Cess         float64 `json:"cess"`
	TotalValue   float64 `json:"totalValue"`
}

// aggregateHSN groups lines by HSN+rate; sign -1 subtracts (credit notes).
func aggregateHSN(lines []repository.GSTLineRow, sign float64) map[string]*hsnRow {
	out := map[string]*hsnRow{}
	for _, l := range lines {
		key := l.HSN + "|" + strconv.FormatFloat(l.Rate, 'f', -1, 64)
		r, ok := out[key]
		if !ok {
			uqc := l.Unit
			if uqc == "" {
				if strings.HasPrefix(l.HSN, "99") {
					uqc = "NA"
				} else {
					uqc = "NOS"
				}
			}
			r = &hsnRow{HSN: l.HSN, Description: l.Name, UQC: uqc, Rate: l.Rate}
			out[key] = r
		}
		if r.UQC != "NA" {
			r.Quantity = round2(r.Quantity + sign*l.Quantity)
		}
		r.TaxableValue = round2(r.TaxableValue + sign*l.TaxableValue)
		r.CGST = round2(r.CGST + sign*l.CGST)
		r.SGST = round2(r.SGST + sign*l.SGST)
		r.IGST = round2(r.IGST + sign*l.IGST)
		r.Cess = round2(r.Cess + sign*l.Cess)
		r.TotalValue = round2(r.TotalValue + sign*(l.TaxableValue+l.CGST+l.SGST+l.IGST+l.Cess))
	}
	return out
}

// mergeHSN subtracts CN-line aggregates (already keyed hsn|rate) into a base map.
func mergeHSN(base map[string]*hsnRow, cnLines []repository.GSTCNLineRow) {
	for _, l := range cnLines {
		key := l.HSN + "|" + strconv.FormatFloat(l.Rate, 'f', -1, 64)
		r, ok := base[key]
		if !ok {
			uqc := l.Unit
			if uqc == "" {
				if strings.HasPrefix(l.HSN, "99") {
					uqc = "NA"
				} else {
					uqc = "NOS"
				}
			}
			r = &hsnRow{HSN: l.HSN, Description: l.Name, UQC: uqc, Rate: l.Rate}
			base[key] = r
		}
		if r.UQC != "NA" {
			r.Quantity = round2(r.Quantity - l.Quantity)
		}
		r.TaxableValue = round2(r.TaxableValue - l.TaxableValue)
		r.CGST = round2(r.CGST - l.CGST)
		r.SGST = round2(r.SGST - l.SGST)
		r.IGST = round2(r.IGST - l.IGST)
		r.Cess = round2(r.Cess - l.Cess)
		r.TotalValue = round2(r.TotalValue - (l.TaxableValue + l.CGST + l.SGST + l.IGST + l.Cess))
	}
}

func hsnRowsSorted(m map[string]*hsnRow) []hsnRow {
	out := make([]hsnRow, 0, len(m))
	for _, r := range m {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].HSN != out[j].HSN {
			return out[i].HSN < out[j].HSN
		}
		return out[i].Rate < out[j].Rate
	})
	return out
}

// filterActiveCNs keeps the credit notes that affect tax: active notes whose
// parent bill is not cancelled. A cancelled bill's values are already
// excluded from the reports, so subtracting its credit notes would
// double-count the reversal.
func filterActiveCNs(cns []repository.GSTCNRow) ([]repository.GSTCNRow, map[string]bool) {
	var out []repository.GSTCNRow
	keep := map[string]bool{}
	for _, c := range cns {
		if c.ParentStatus == "cancelled" || (c.Status != "" && c.Status != "active") {
			continue
		}
		out = append(out, c)
		keep[c.ID] = true
	}
	return out, keep
}

func filterCNLines(cnLines []repository.GSTCNLineRow, keep map[string]bool) []repository.GSTCNLineRow {
	out := make([]repository.GSTCNLineRow, 0, len(cnLines))
	for _, l := range cnLines {
		if keep[l.CreditNoteID] {
			out = append(out, l)
		}
	}
	return out
}

// invoiceRates returns the per-rate split of a bill's lines.
func invoiceRates(lines []repository.GSTLineRow) []rateRow {
	byRate := map[float64]*rateRow{}
	for _, l := range lines {
		r, ok := byRate[l.Rate]
		if !ok {
			r = &rateRow{Rate: l.Rate}
			byRate[l.Rate] = r
		}
		r.TaxableValue = round2(r.TaxableValue + l.TaxableValue)
		r.CGST = round2(r.CGST + l.CGST)
		r.SGST = round2(r.SGST + l.SGST)
		r.IGST = round2(r.IGST + l.IGST)
		r.Cess = round2(r.Cess + l.Cess)
	}
	out := make([]rateRow, 0, len(byRate))
	for _, r := range byRate {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Rate < out[j].Rate })
	return out
}

// docSeries summarizes a document number series for GSTR-1 doc_issue.
type docSeries struct {
	DocType   string `json:"docType"`
	Nature    string `json:"nature"`
	FY        string `json:"fy"`
	From      string `json:"from"`
	To        string `json:"to"`
	Total     int    `json:"total"`
	Cancelled int    `json:"cancelled"`
	Net       int    `json:"net"`
}

// docNumber is one issued document for the GSTR-1 document summary.
type docNumber struct {
	No        string
	Seq       int
	FY        string
	Cancelled bool
}

func docNumberSeries(docType, nature string, numbers []docNumber) []docSeries {
	type key struct{ prefix, fy string }
	byKey := map[key][]docNumber{}
	var order []key
	for _, n := range numbers {
		prefix := n.No
		if i := strings.Index(n.No, "/"); i >= 0 {
			prefix = n.No[:i]
		}
		k := key{prefix, n.FY}
		if _, ok := byKey[k]; !ok {
			order = append(order, k)
		}
		byKey[k] = append(byKey[k], n)
	}
	var out []docSeries
	for _, k := range order {
		group := byKey[k]
		sort.SliceStable(group, func(i, j int) bool { return group[i].Seq < group[j].Seq })
		ds := docSeries{DocType: docType, Nature: nature, FY: k.fy, From: group[0].No, To: group[len(group)-1].No}
		for _, g := range group {
			ds.Total++
			if g.Cancelled {
				ds.Cancelled++
			}
		}
		ds.Net = ds.Total - ds.Cancelled
		out = append(out, ds)
	}
	return out
}

// ==========================================
// HANDLERS
// ==========================================

// parseISTDateQuery parses a GST report bound. A bare YYYY-MM-DD is an IST
// calendar day (an end bound covers the whole day); RFC3339 values are used
// as given.
func parseISTDateQuery(r *http.Request, key string, endOfDay bool) *time.Time {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return nil
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return &t
	}
	t, err := time.ParseInLocation("2006-01-02", raw, gst.IST)
	if err != nil {
		return nil
	}
	if endOfDay {
		t = t.AddDate(0, 0, 1).Add(-time.Nanosecond)
	}
	return &t
}

// gstReportContext fetches the store and the GST report row set.
func (h *Handler) gstReportContext(w http.ResponseWriter, r *http.Request) (*models.Store, []repository.GSTBillRow, []repository.GSTLineRow, []repository.GSTCNRow, []repository.GSTCNLineRow, int, bool) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return nil, nil, nil, nil, nil, 0, false
	}
	storeID, ok := h.requireStoreAccess(w, r, claims, r.URL.Query().Get("storeId"))
	if !ok {
		return nil, nil, nil, nil, nil, 0, false
	}
	store, err := h.Repo.Store.GetByID(r.Context(), storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return nil, nil, nil, nil, nil, 0, false
	}
	if store == nil {
		h.writeError(w, http.StatusNotFound, "Store not found")
		return nil, nil, nil, nil, nil, 0, false
	}
	if !store.TaxEnabled {
		h.writeError(w, http.StatusForbidden, "Tax is disabled for this store")
		return nil, nil, nil, nil, nil, 0, false
	}
	cutoff, err := h.retentionCutoff(r.Context(), claims, storeID)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return nil, nil, nil, nil, nil, 0, false
	}
	bills, lines, cns, cnLines, legacy, err := h.Repo.Bill.FetchGSTReportData(
		r.Context(), storeID,
		clampStart(parseISTDateQuery(r, "startDate", false), cutoff), parseISTDateQuery(r, "endDate", true))
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return nil, nil, nil, nil, nil, 0, false
	}
	return store, bills, lines, cns, cnLines, legacy, true
}

func linesOf(billID string, lines []repository.GSTLineRow) []repository.GSTLineRow {
	out := make([]repository.GSTLineRow, 0, 4)
	for _, l := range lines {
		if l.BillID == billID {
			out = append(out, l)
		}
	}
	return out
}

func cnLinesOf(cnID string, cnLines []repository.GSTCNLineRow) []repository.GSTCNLineRow {
	out := make([]repository.GSTCNLineRow, 0, 4)
	for _, l := range cnLines {
		if l.CreditNoteID == cnID {
			out = append(out, l)
		}
	}
	return out
}

// GetGSTSummary handles GET /api/reports/gst/summary.
func (h *Handler) GetGSTSummary(w http.ResponseWriter, r *http.Request) {
	store, bills, lines, cns, cnLines, legacy, ok := h.gstReportContext(w, r)
	if !ok {
		return
	}

	billsByID := map[string]repository.GSTBillRow{}
	cnByID := map[string]repository.GSTCNRow{}
	var active []repository.GSTBillRow
	cancelled := 0
	for _, b := range bills {
		billsByID[b.ID] = b
		if b.Status == "cancelled" {
			cancelled++
			continue
		}
		active = append(active, b)
	}
	cns, keepCN := filterActiveCNs(cns)
	cnLines = filterCNLines(cnLines, keepCN)
	for _, c := range cns {
		cnByID[c.ID] = c
	}

	var inv taxAmounts
	invoiceValue := 0.0
	for _, b := range active {
		inv.add(b.TaxableValue, b.CGST, b.SGST, b.IGST, b.Cess)
		invoiceValue = round2(invoiceValue + b.Total)
	}
	var cnTotals taxAmounts
	cnTotal := 0.0
	for _, c := range cns {
		cnTotals.add(c.TaxableValue, c.CGST, c.SGST, c.IGST, c.Cess)
		cnTotal = round2(cnTotal + c.Total)
	}
	net := inv
	net.sub(cnTotals)
	netTax := round2(net.CGST + net.SGST + net.IGST + net.Cess)

	activeIDs := map[string]bool{}
	for _, b := range active {
		activeIDs[b.ID] = true
	}
	var activeLines []repository.GSTLineRow
	for _, l := range lines {
		if activeIDs[l.BillID] {
			activeLines = append(activeLines, l)
		}
	}
	rateWise := aggregateRateWise(activeLines, cnLines, billsByID, cnByID)

	// GSTR-3B style split: 3.1(a) taxable outward (excl. ECO & non-taxable
	// categories), 3.1(c) nil/exempt, 3.1(e) non-GST, 3.1.1(ii) ECO supplies.
	var outward, nilExempt, nonGST, eco taxAmounts
	ecoBillIDs := map[string]bool{}
	for _, b := range active {
		if b.SupplyType == "ECO" {
			ecoBillIDs[b.ID] = true
		}
	}
	addNonTaxable := func(kind string, amt float64) {
		if kind == "non_gst" {
			nonGST.add(amt, 0, 0, 0, 0)
		} else {
			nilExempt.add(amt, 0, 0, 0, 0)
		}
	}
	for _, l := range activeLines {
		b := billsByID[l.BillID]
		kind := nilKind(l.TaxCategory, l.Rate)
		switch {
		case ecoBillIDs[l.BillID] || b.OrderSource != "" && b.OrderSource != gst.SourcePOS:
			eco.add(l.TaxableValue, l.CGST, l.SGST, l.IGST, l.Cess)
		case kind != "":
			addNonTaxable(kind, l.TaxableValue)
		default:
			outward.add(l.TaxableValue, l.CGST, l.SGST, l.IGST, l.Cess)
		}
	}
	// Net credit notes out of the same buckets as their bill lines.
	for _, l := range cnLines {
		cn := cnByID[l.CreditNoteID]
		kind := nilKind(l.TaxCategory, l.Rate)
		switch {
		case cn.ParentSupplyType == "ECO":
			eco.sub(taxAmounts{l.TaxableValue, l.CGST, l.SGST, l.IGST, l.Cess})
		case kind != "":
			addNonTaxable(kind, -l.TaxableValue)
		default:
			outward.sub(taxAmounts{l.TaxableValue, l.CGST, l.SGST, l.IGST, l.Cess})
		}
	}

	resp := map[string]interface{}{
		"registrationType":    store.GSTRegistrationType,
		"legacyBillsExcluded": legacy,
		"invoices": map[string]interface{}{
			"count": len(active), "cancelledCount": cancelled,
			"taxableValue": inv.TaxableValue, "cgst": inv.CGST, "sgst": inv.SGST,
			"igst": inv.IGST, "cess": inv.Cess,
			"totalTax":     round2(inv.CGST + inv.SGST + inv.IGST + inv.Cess),
			"invoiceValue": invoiceValue,
		},
		"creditNotes": map[string]interface{}{
			"count": len(cns), "taxableValue": cnTotals.TaxableValue,
			"cgst": cnTotals.CGST, "sgst": cnTotals.SGST, "igst": cnTotals.IGST,
			"cess": cnTotals.Cess, "total": cnTotal,
		},
		"net": map[string]interface{}{
			"taxableValue": net.TaxableValue, "cgst": net.CGST, "sgst": net.SGST,
			"igst": net.IGST, "cess": net.Cess, "totalTax": netTax,
		},
		"rateWise": rateWise,
		"gstr3b": map[string]interface{}{
			"outwardTaxable": outward,
			"nilExempt":      nilExempt,
			"nonGst":         nonGST,
			"ecoSupplies":    eco,
		},
	}
	if store.GSTRegistrationType == gst.RegistrationComposition {
		turnover := invoiceValue
		half := round2(turnover * 0.025)
		resp["composition"] = map[string]interface{}{
			"turnover": turnover, "cgst": half, "sgst": half, "total": round2(2 * half),
		}
	}
	h.writeJSON(w, http.StatusOK, resp)
}

// GetGSTR1 handles GET /api/reports/gst/gstr1.
func (h *Handler) GetGSTR1(w http.ResponseWriter, r *http.Request) {
	store, bills, lines, cns, cnLines, legacy, ok := h.gstReportContext(w, r)
	if !ok {
		return
	}
	report := buildGSTR1(store, bills, lines, cns, cnLines, legacy,
		parseISTDateQuery(r, "startDate", false), parseISTDateQuery(r, "endDate", true))
	h.writeJSON(w, http.StatusOK, report)
}

// nilKind returns the GSTR-1 Table 8 bucket for a line — "nil", "exempt" or
// "non_gst" — or "" for a taxable line with a positive rate. A "taxable"
// line at 0% is a nil-rated supply.
func nilKind(category string, rate float64) string {
	switch category {
	case gst.TaxCategoryNilRated:
		return "nil"
	case gst.TaxCategoryExempt:
		return "exempt"
	case gst.TaxCategoryNonGST:
		return "non_gst"
	}
	if rate == 0 {
		return "nil"
	}
	return ""
}

// nilRow is one GSTR-1 Table 8 row (nil rated / exempt / non-GST).
type nilRow struct {
	SupplyType string  `json:"supplyType"` // INTRB2B, INTRAB2B, INTRB2C, INTRAB2C
	Nil        float64 `json:"nilRated"`
	Exempt     float64 `json:"exempt"`
	NonGST     float64 `json:"nonGst"`
}

var nilSupplyTypes = []string{"INTRB2B", "INTRAB2B", "INTRB2C", "INTRAB2C"}

func nilSupplyType(interState, b2b bool) string {
	switch {
	case interState && b2b:
		return "INTRB2B"
	case b2b:
		return "INTRAB2B"
	case interState:
		return "INTRB2C"
	}
	return "INTRAB2C"
}

// ecoRow is one GSTR-1 Table 14(b) row: supplies made through an
// e-commerce operator that pays the tax u/s 9(5).
type ecoRow struct {
	OrderSource  string  `json:"orderSource"`
	ECOGSTIN     string  `json:"ecoGstin"`
	TaxableValue float64 `json:"taxableValue"`
	InvoiceCount int     `json:"invoiceCount"`
}

type gstr1Invoice struct {
	Bill  repository.GSTBillRow
	Rates []rateRow
}

type gstr1Note struct {
	CN    repository.GSTCNRow
	Rates []rateRow
}

type b2csRow struct {
	SupplyType string
	POS        string
	Rate       float64
	taxAmounts
}

// gstr1Data is the GSTR-1 computed once and rendered both as the in-app
// report and as the GST portal offline-tool JSON.
type gstr1Data struct {
	B2B, B2CL   []gstr1Invoice
	CDNR, CDNUR []gstr1Note
	B2CS        []b2csRow
	HSNB2B      []hsnRow
	HSNB2C      []hsnRow
	Nil         []nilRow
	ECO         []ecoRow
	InvoiceDocs []docSeries
	NoteDocs    []docSeries
	Warnings    []string
}

func istDate(t time.Time, layout string) string { return t.In(gst.IST).Format(layout) }

func computeGSTR1(store *models.Store, bills []repository.GSTBillRow, lines []repository.GSTLineRow,
	allCNs []repository.GSTCNRow, allCNLines []repository.GSTCNLineRow) gstr1Data {

	var d gstr1Data
	var active []repository.GSTBillRow
	for _, b := range bills {
		if b.Status != "cancelled" {
			active = append(active, b)
		}
	}
	cns, keepCN := filterActiveCNs(allCNs)
	cnLines := filterCNLines(allCNLines, keepCN)

	inter := func(pos string) bool { return pos != "" && store.StateCode != "" && pos != store.StateCode }

	nils := map[string]*nilRow{}
	addNil := func(splyTy, kind string, amt float64) {
		n, ok := nils[splyTy]
		if !ok {
			n = &nilRow{SupplyType: splyTy}
			nils[splyTy] = n
		}
		switch kind {
		case "exempt":
			n.Exempt = round2(n.Exempt + amt)
		case "non_gst":
			n.NonGST = round2(n.NonGST + amt)
		default:
			n.Nil = round2(n.Nil + amt)
		}
	}

	type csKey struct {
		supply, pos string
		rate        float64
	}
	cs := map[csKey]*b2csRow{}
	var csOrder []csKey
	addCS := func(pos string, rate float64, sign float64, l taxAmounts) {
		supply := "INTRA"
		if inter(pos) {
			supply = "INTER"
		}
		k := csKey{supply, pos, rate}
		row, ok := cs[k]
		if !ok {
			row = &b2csRow{SupplyType: supply, POS: pos, Rate: rate}
			cs[k] = row
			csOrder = append(csOrder, k)
		}
		row.add(sign*l.TaxableValue, sign*l.CGST, sign*l.SGST, sign*l.IGST, sign*l.Cess)
	}

	ecoByGSTIN := map[string]*ecoRow{}
	var ecoOrder []string
	ecoFor := func(source, gstin string) *ecoRow {
		if gstin == "" {
			gstin = repository.ECOGSTINFor(store, source)
		}
		key := source + "|" + gstin
		e, ok := ecoByGSTIN[key]
		if !ok {
			e = &ecoRow{OrderSource: source, ECOGSTIN: gstin}
			ecoByGSTIN[key] = e
			ecoOrder = append(ecoOrder, key)
		}
		return e
	}

	var b2bLines, b2cLines []repository.GSTLineRow
	for _, b := range active {
		bl := linesOf(b.ID, lines)
		if b.SupplyType == "B2B" {
			b2bLines = append(b2bLines, bl...)
		} else {
			b2cLines = append(b2cLines, bl...)
		}
		if b.SupplyType == "ECO" {
			e := ecoFor(b.OrderSource, b.EcoGSTIN)
			e.TaxableValue = round2(e.TaxableValue + b.TaxableValue)
			e.InvoiceCount++
			continue
		}
		var taxable []repository.GSTLineRow
		for _, l := range bl {
			if k := nilKind(l.TaxCategory, l.Rate); k != "" {
				addNil(nilSupplyType(inter(b.PlaceOfSupply), b.SupplyType == "B2B"), k, l.TaxableValue)
				continue
			}
			taxable = append(taxable, l)
		}
		switch b.SupplyType {
		case "B2B":
			if len(taxable) > 0 {
				d.B2B = append(d.B2B, gstr1Invoice{b, invoiceRates(taxable)})
			}
		case "B2CL":
			if len(taxable) > 0 {
				d.B2CL = append(d.B2CL, gstr1Invoice{b, invoiceRates(taxable)})
			}
		default: // B2CS
			for _, l := range taxable {
				addCS(b.PlaceOfSupply, l.Rate, 1, taxAmounts{l.TaxableValue, l.CGST, l.SGST, l.IGST, l.Cess})
			}
		}
	}

	// Credit notes: cdnr for B2B bills, cdnur for B2CL, netted into b2cs /
	// Table 8 / Table 14 otherwise.
	var b2bCNLines, b2cCNLines []repository.GSTCNLineRow
	for _, c := range cns {
		cl := cnLinesOf(c.ID, cnLines)
		if c.ParentSupplyType == "B2B" {
			b2bCNLines = append(b2bCNLines, cl...)
		} else {
			b2cCNLines = append(b2cCNLines, cl...)
		}
		if c.ParentSupplyType == "ECO" {
			e := ecoFor(c.ParentOrderSource, c.ParentEcoGSTIN)
			e.TaxableValue = round2(e.TaxableValue - c.TaxableValue)
			continue
		}
		var taxable []repository.GSTCNLineRow
		for _, l := range cl {
			if k := nilKind(l.TaxCategory, l.Rate); k != "" {
				addNil(nilSupplyType(inter(c.PlaceOfSupply), c.ParentSupplyType == "B2B"), k, -l.TaxableValue)
				continue
			}
			taxable = append(taxable, l)
		}
		switch c.ParentSupplyType {
		case "B2B":
			if len(taxable) > 0 {
				d.CDNR = append(d.CDNR, gstr1Note{c, invoiceRatesCN(taxable)})
			}
		case "B2CL":
			if len(taxable) > 0 {
				d.CDNUR = append(d.CDNUR, gstr1Note{c, invoiceRatesCN(taxable)})
			}
		default:
			for _, l := range taxable {
				addCS(c.PlaceOfSupply, l.Rate, -1, taxAmounts{l.TaxableValue, l.CGST, l.SGST, l.IGST, l.Cess})
			}
		}
	}

	sort.Slice(csOrder, func(i, j int) bool {
		if csOrder[i].pos != csOrder[j].pos {
			return csOrder[i].pos < csOrder[j].pos
		}
		return csOrder[i].rate < csOrder[j].rate
	})
	for _, k := range csOrder {
		d.B2CS = append(d.B2CS, *cs[k])
	}
	for _, st := range nilSupplyTypes {
		if n, ok := nils[st]; ok {
			d.Nil = append(d.Nil, *n)
		}
	}
	for _, k := range ecoOrder {
		e := ecoByGSTIN[k]
		d.ECO = append(d.ECO, *e)
		if e.ECOGSTIN == "" {
			d.Warnings = append(d.Warnings, "Set the "+ecoLabel(e.OrderSource)+" GSTIN in Tax settings — it is required to report these sales in GSTR-1 Table 14.")
		}
	}

	hsnB2b := aggregateHSN(b2bLines, 1)
	mergeHSN(hsnB2b, b2bCNLines)
	hsnB2c := aggregateHSN(b2cLines, 1)
	mergeHSN(hsnB2c, b2cCNLines)
	d.HSNB2B = hsnRowsSorted(hsnB2b)
	d.HSNB2C = hsnRowsSorted(hsnB2c)

	// Document summary counts every document issued in the period,
	// including cancelled ones and credit notes on cancelled bills.
	var invNumbers, cnNumbers []docNumber
	for _, b := range bills {
		invNumbers = append(invNumbers, docNumber{b.InvoiceNo, b.InvoiceSeq, b.FY, b.Status == "cancelled"})
	}
	for _, c := range allCNs {
		cnNumbers = append(cnNumbers, docNumber{c.CreditNoteNo, c.Seq, c.FY, c.Status == "cancelled"})
	}
	d.InvoiceDocs = docNumberSeries("invoices", "Invoices for outward supply", invNumbers)
	d.NoteDocs = docNumberSeries("credit_notes", "Credit Note", cnNumbers)
	return d
}

func ecoLabel(source string) string {
	switch source {
	case gst.SourceSwiggy:
		return "Swiggy"
	case gst.SourceZomato:
		return "Zomato"
	}
	return "e-commerce operator"
}

func buildGSTR1(store *models.Store, bills []repository.GSTBillRow, lines []repository.GSTLineRow,
	cns []repository.GSTCNRow, cnLines []repository.GSTCNLineRow, legacy int,
	from, to *time.Time) map[string]interface{} {

	d := computeGSTR1(store, bills, lines, cns, cnLines)

	b2b := []map[string]interface{}{}
	for _, inv := range d.B2B {
		b := inv.Bill
		b2b = append(b2b, map[string]interface{}{
			"buyerGstin":    b.BuyerGSTIN,
			"buyerName":     b.BuyerName,
			"invoiceNo":     b.InvoiceNo,
			"invoiceDate":   istDate(b.GeneratedAt, "2006-01-02"),
			"invoiceValue":  b.Total,
			"placeOfSupply": b.PlaceOfSupply,
			"reverseCharge": "N",
			"invoiceType":   "Regular",
			"rates":         inv.Rates,
		})
	}
	b2cl := []map[string]interface{}{}
	for _, inv := range d.B2CL {
		b := inv.Bill
		b2cl = append(b2cl, map[string]interface{}{
			"invoiceNo":     b.InvoiceNo,
			"invoiceDate":   istDate(b.GeneratedAt, "2006-01-02"),
			"invoiceValue":  b.Total,
			"placeOfSupply": b.PlaceOfSupply,
			"reverseCharge": "N",
			"invoiceType":   "Regular",
			"rates":         inv.Rates,
		})
	}
	note := func(n gstr1Note) map[string]interface{} {
		c := n.CN
		return map[string]interface{}{
			"noteNo":              c.CreditNoteNo,
			"noteDate":            istDate(c.IssuedAt, "2006-01-02"),
			"noteType":            "C",
			"originalInvoiceNo":   c.ParentInvoiceNo,
			"originalInvoiceDate": istDate(c.ParentGeneratedAt, "2006-01-02"),
			"placeOfSupply":       c.PlaceOfSupply,
			"noteValue":           c.Total,
			"rates":               n.Rates,
		}
	}
	cdnr := []map[string]interface{}{}
	for _, n := range d.CDNR {
		e := note(n)
		e["buyerGstin"] = n.CN.BuyerGSTIN
		cdnr = append(cdnr, e)
	}
	cdnur := []map[string]interface{}{}
	for _, n := range d.CDNUR {
		e := note(n)
		e["type"] = "B2CL"
		cdnur = append(cdnur, e)
	}
	b2cs := []map[string]interface{}{}
	for _, r := range d.B2CS {
		b2cs = append(b2cs, map[string]interface{}{
			"supplyType":    r.SupplyType,
			"placeOfSupply": r.POS,
			"rate":          r.Rate,
			"taxableValue":  r.TaxableValue, "igst": r.IGST,
			"cgst": r.CGST, "sgst": r.SGST, "cess": r.Cess,
		})
	}

	period := map[string]interface{}{}
	if from != nil {
		period["from"] = istDate(*from, "2006-01-02")
	}
	if to != nil {
		period["to"] = istDate(*to, "2006-01-02")
	}
	nilRows := d.Nil
	if nilRows == nil {
		nilRows = []nilRow{}
	}
	eco := d.ECO
	if eco == nil {
		eco = []ecoRow{}
	}
	warnings := d.Warnings
	if warnings == nil {
		warnings = []string{}
	}

	return map[string]interface{}{
		"gstin":               store.GSTIN,
		"period":              period,
		"legacyBillsExcluded": legacy,
		"b2b":                 b2b,
		"b2cl":                b2cl,
		"b2cs":                b2cs,
		"cdnr":                cdnr,
		"cdnur":               cdnur,
		"nil":                 nilRows,
		"hsnB2b":              d.HSNB2B,
		"hsnB2c":              d.HSNB2C,
		"docs":                append(append([]docSeries{}, d.InvoiceDocs...), d.NoteDocs...),
		"eco":                 eco,
		"warnings":            warnings,
	}
}

func invoiceRatesCN(lines []repository.GSTCNLineRow) []rateRow {
	byRate := map[float64]*rateRow{}
	for _, l := range lines {
		r, ok := byRate[l.Rate]
		if !ok {
			r = &rateRow{Rate: l.Rate}
			byRate[l.Rate] = r
		}
		r.TaxableValue = round2(r.TaxableValue + l.TaxableValue)
		r.CGST = round2(r.CGST + l.CGST)
		r.SGST = round2(r.SGST + l.SGST)
		r.IGST = round2(r.IGST + l.IGST)
		r.Cess = round2(r.Cess + l.Cess)
	}
	out := make([]rateRow, 0, len(byRate))
	for _, r := range byRate {
		out = append(out, *r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Rate < out[j].Rate })
	return out
}

// GetGSTR1PortalJSON handles GET /api/reports/gst/gstr1/portal-json — the
// GST portal offline-tool format. The range must be exactly one calendar
// month (the return period).
func (h *Handler) GetGSTR1PortalJSON(w http.ResponseWriter, r *http.Request) {
	from := parseISTDateQuery(r, "startDate", false)
	to := parseISTDateQuery(r, "endDate", true)
	if from == nil || to == nil {
		h.writeError(w, http.StatusBadRequest, "startDate and endDate are required for the GSTR-1 JSON")
		return
	}
	f, t := from.In(gst.IST), to.In(gst.IST)
	if f.Year() != t.Year() || f.Month() != t.Month() || t.Before(f) {
		h.writeError(w, http.StatusBadRequest, "GSTR-1 JSON covers one return month — pick a single month (e.g. Last month)")
		return
	}

	store, bills, lines, cns, cnLines, _, ok := h.gstReportContext(w, r)
	if !ok {
		return
	}
	d := computeGSTR1(store, bills, lines, cns, cnLines)
	for _, e := range d.ECO {
		if e.ECOGSTIN == "" {
			h.writeError(w, http.StatusBadRequest, "Set the "+ecoLabel(e.OrderSource)+" GSTIN in Tax settings before exporting — it is required for GSTR-1 Table 14.")
			return
		}
	}

	itemList := func(rates []rateRow, intra bool) []map[string]interface{} {
		var itms []map[string]interface{}
		for i, rt := range rates {
			det := map[string]interface{}{
				"txval": rt.TaxableValue, "rt": rt.Rate, "csamt": rt.Cess,
				"iamt": 0.0, "camt": 0.0, "samt": 0.0,
			}
			if intra {
				det["camt"], det["samt"] = rt.CGST, rt.SGST
			} else {
				det["iamt"] = rt.IGST
			}
			itms = append(itms, map[string]interface{}{"num": i + 1, "itm_det": det})
		}
		return itms
	}
	isIntra := func(pos string) bool { return pos == "" || pos == store.StateCode }

	out := map[string]interface{}{
		"gstin":   store.GSTIN,
		"fp":      f.Format("012006"),
		"version": "GST3.2",
		"hash":    "hash",
	}

	if len(d.B2B) > 0 {
		byGSTIN := map[string][]map[string]interface{}{}
		var order []string
		for _, inv := range d.B2B {
			b := inv.Bill
			if _, ok := byGSTIN[b.BuyerGSTIN]; !ok {
				order = append(order, b.BuyerGSTIN)
			}
			byGSTIN[b.BuyerGSTIN] = append(byGSTIN[b.BuyerGSTIN], map[string]interface{}{
				"inum": b.InvoiceNo, "idt": istDate(b.GeneratedAt, "02-01-2006"),
				"val": b.Total, "pos": b.PlaceOfSupply,
				"rchrg": "N", "inv_typ": "R",
				"itms": itemList(inv.Rates, isIntra(b.PlaceOfSupply)),
			})
		}
		var arr []map[string]interface{}
		for _, g := range order {
			arr = append(arr, map[string]interface{}{"ctin": g, "inv": byGSTIN[g]})
		}
		out["b2b"] = arr
	}
	if len(d.B2CL) > 0 {
		var arr []map[string]interface{}
		for _, inv := range d.B2CL {
			b := inv.Bill
			arr = append(arr, map[string]interface{}{
				"pos": b.PlaceOfSupply,
				"inv": []map[string]interface{}{{
					"inum": b.InvoiceNo, "idt": istDate(b.GeneratedAt, "02-01-2006"),
					"val": b.Total, "itms": itemList(inv.Rates, false),
				}},
			})
		}
		out["b2cl"] = arr
	}
	if len(d.B2CS) > 0 {
		var arr []map[string]interface{}
		for _, row := range d.B2CS {
			e := map[string]interface{}{
				"sply_ty": row.SupplyType, "pos": row.POS, "typ": "OE",
				"txval": row.TaxableValue, "rt": row.Rate, "csamt": row.Cess,
				"iamt": row.IGST, "camt": row.CGST, "samt": row.SGST,
			}
			arr = append(arr, e)
		}
		out["b2cs"] = arr
	}
	if len(d.CDNR) > 0 {
		byGSTIN := map[string][]map[string]interface{}{}
		var order []string
		for _, n := range d.CDNR {
			c := n.CN
			if _, ok := byGSTIN[c.BuyerGSTIN]; !ok {
				order = append(order, c.BuyerGSTIN)
			}
			byGSTIN[c.BuyerGSTIN] = append(byGSTIN[c.BuyerGSTIN], map[string]interface{}{
				"ntty": "C", "nt_num": c.CreditNoteNo, "nt_dt": istDate(c.IssuedAt, "02-01-2006"),
				"pos": c.PlaceOfSupply, "rchrg": "N", "inv_typ": "R",
				"val": c.Total, "itms": itemList(n.Rates, isIntra(c.PlaceOfSupply)),
			})
		}
		var arr []map[string]interface{}
		for _, g := range order {
			arr = append(arr, map[string]interface{}{"ctin": g, "nt": byGSTIN[g]})
		}
		out["cdnr"] = arr
	}
	if len(d.CDNUR) > 0 {
		var arr []map[string]interface{}
		for _, n := range d.CDNUR {
			c := n.CN
			arr = append(arr, map[string]interface{}{
				"typ": "B2CL", "ntty": "C", "nt_num": c.CreditNoteNo,
				"nt_dt": istDate(c.IssuedAt, "02-01-2006"), "pos": c.PlaceOfSupply,
				"val": c.Total, "itms": itemList(n.Rates, false),
			})
		}
		out["cdnur"] = arr
	}
	if len(d.Nil) > 0 {
		var inv []map[string]interface{}
		for _, n := range d.Nil {
			inv = append(inv, map[string]interface{}{
				"sply_ty": n.SupplyType, "nil_amt": n.Nil, "expt_amt": n.Exempt, "ngsup_amt": n.NonGST,
			})
		}
		out["nil"] = map[string]interface{}{"inv": inv}
	}
	if len(d.ECO) > 0 {
		// Table 14(b): supplies through an ECO that pays tax u/s 9(5). The
		// restaurant reports the value only; the operator pays the tax.
		byGSTIN := map[string]float64{}
		var order []string
		for _, e := range d.ECO {
			if _, ok := byGSTIN[e.ECOGSTIN]; !ok {
				order = append(order, e.ECOGSTIN)
			}
			byGSTIN[e.ECOGSTIN] = round2(byGSTIN[e.ECOGSTIN] + e.TaxableValue)
		}
		var paytx []map[string]interface{}
		for _, g := range order {
			paytx = append(paytx, map[string]interface{}{
				"etin": g, "suppval": byGSTIN[g], "igst": 0, "cgst": 0, "sgst": 0, "cess": 0,
			})
		}
		out["supeco"] = map[string]interface{}{"paytx": paytx}
	}

	hsnPortal := func(rows []hsnRow) []map[string]interface{} {
		var arr []map[string]interface{}
		for i, hr := range rows {
			arr = append(arr, map[string]interface{}{
				"num": i + 1, "hsn_sc": hr.HSN, "desc": hr.Description,
				"uqc": hr.UQC, "qty": hr.Quantity, "rt": hr.Rate,
				"txval": hr.TaxableValue, "iamt": hr.IGST,
				"camt": hr.CGST, "samt": hr.SGST, "csamt": hr.Cess,
			})
		}
		return arr
	}
	if hb, hc := hsnPortal(d.HSNB2B), hsnPortal(d.HSNB2C); len(hb) > 0 || len(hc) > 0 {
		hsn := map[string]interface{}{}
		if len(hb) > 0 {
			hsn["hsn_b2b"] = hb
		}
		if len(hc) > 0 {
			hsn["hsn_b2c"] = hc
		}
		out["hsn"] = hsn
	}

	var docDet []map[string]interface{}
	addDocs := func(num int, typ string, ds []docSeries) {
		if len(ds) == 0 {
			return
		}
		var docsArr []map[string]interface{}
		for i, x := range ds {
			docsArr = append(docsArr, map[string]interface{}{
				"num": i + 1, "from": x.From, "to": x.To,
				"totnum": x.Total, "cancel": x.Cancelled, "net_issue": x.Net,
			})
		}
		docDet = append(docDet, map[string]interface{}{"doc_num": num, "doc_typ": typ, "docs": docsArr})
	}
	addDocs(1, "Invoices for outward supply", d.InvoiceDocs)
	addDocs(5, "Credit Note", d.NoteDocs)
	if len(docDet) > 0 {
		out["doc_issue"] = map[string]interface{}{"doc_det": docDet}
	}

	h.writeJSON(w, http.StatusOK, out)
}

// GetGSTSalesRegister handles GET /api/reports/gst/sales-register —
// paginated GST bill list with range totals.
func (h *Handler) GetGSTSalesRegister(w http.ResponseWriter, r *http.Request) {
	_, bills, _, _, _, legacy, ok := h.gstReportContext(w, r)
	if !ok {
		return
	}
	filter := parseReportFilter(r)

	// Search on invoice number or buyer GSTIN.
	search := strings.ToLower(filter.Search)
	var rows []map[string]interface{}
	var totals taxAmounts
	var totalVal, roundOffSum float64
	for _, b := range bills {
		if search != "" &&
			!strings.Contains(strings.ToLower(b.InvoiceNo), search) &&
			!strings.Contains(strings.ToLower(b.BuyerGSTIN), search) {
			continue
		}
		if b.Status != "cancelled" {
			totals.add(b.TaxableValue, b.CGST, b.SGST, b.IGST, b.Cess)
			totalVal = round2(totalVal + b.Total)
			roundOffSum = round2(roundOffSum + b.RoundOff)
		}
		rows = append(rows, map[string]interface{}{
			"billId":        b.ID,
			"invoiceNo":     b.InvoiceNo,
			"invoiceDate":   istDate(b.GeneratedAt, "2006-01-02"),
			"documentType":  b.DocumentType,
			"supplyType":    b.SupplyType,
			"buyerGstin":    b.BuyerGSTIN,
			"buyerName":     b.BuyerName,
			"placeOfSupply": b.PlaceOfSupply,
			"taxableValue":  b.TaxableValue,
			"cgst":          b.CGST, "sgst": b.SGST, "igst": b.IGST,
			"cess": b.Cess, "roundOff": b.RoundOff, "total": b.Total,
			"status": b.Status, "orderSource": b.OrderSource,
		})
	}

	total := len(rows)
	if !filter.All {
		start := (filter.Page - 1) * filter.PageSize
		if start > total {
			start = total
		}
		end := start + filter.PageSize
		if end > total {
			end = total
		}
		rows = rows[start:end]
	} else {
		filter.Page = 1
		filter.PageSize = total
	}
	if rows == nil {
		rows = []map[string]interface{}{}
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"rows": rows, "total": total, "page": filter.Page, "pageSize": filter.PageSize,
		"legacyBillsExcluded": legacy,
		"totals": map[string]interface{}{
			"taxableValue": totals.TaxableValue, "cgst": totals.CGST,
			"sgst": totals.SGST, "igst": totals.IGST, "cess": totals.Cess,
			"roundOff": roundOffSum, "total": totalVal,
			"totalTax": round2(totals.CGST + totals.SGST + totals.IGST + totals.Cess),
		},
	})
}
