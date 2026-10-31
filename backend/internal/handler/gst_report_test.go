package handler

import (
	"net/http/httptest"
	"testing"
	"time"

	"cafe-backend/internal/gst"
	"cafe-backend/internal/models"
	"cafe-backend/internal/repository"
)

func TestAggregateRateWise(t *testing.T) {
	bills := []repository.GSTBillRow{
		{ID: "b1", SupplyType: "B2B"},
		{ID: "b2", SupplyType: "B2CS"},
	}
	billsByID := map[string]repository.GSTBillRow{"b1": bills[0], "b2": bills[1]}
	cnByID := map[string]repository.GSTCNRow{"cn1": {ID: "cn1", BillID: "b2", ParentSupplyType: "B2CS"}}

	lines := []repository.GSTLineRow{
		{BillID: "b1", Rate: 5, TaxableValue: 100, CGST: 2.5, SGST: 2.5},
		{BillID: "b2", Rate: 5, TaxableValue: 200, CGST: 5, SGST: 5},
		{BillID: "b2", Rate: 18, TaxableValue: 50, IGST: 9},
	}
	cnLines := []repository.GSTCNLineRow{
		{CreditNoteID: "cn1", Rate: 5, TaxableValue: 50, CGST: 1.25, SGST: 1.25},
	}

	out := aggregateRateWise(lines, cnLines, billsByID, cnByID)
	if len(out) != 2 {
		t.Fatalf("expected 2 rates, got %v", out)
	}
	r5 := out[0]
	if r5.TaxableValue != 250 || r5.CGST != 6.25 || r5.SGST != 6.25 {
		t.Fatalf("bad 5%% bucket: %+v", r5)
	}
	if r5.B2BTaxable != 100 || r5.B2CTaxable != 150 {
		t.Fatalf("bad b2b/b2c split: %+v", r5)
	}
	if out[1].Rate != 18 || out[1].IGST != 9 {
		t.Fatalf("bad 18%% bucket: %+v", out[1])
	}
}

func TestAggregateHSNAndMerge(t *testing.T) {
	lines := []repository.GSTLineRow{
		{BillID: "b1", HSN: "1001", Name: "Rice", Unit: "NOS", Rate: 5, Quantity: 2, TaxableValue: 100, CGST: 2.5, SGST: 2.5},
		{BillID: "b1", HSN: "1001", Name: "Rice", Unit: "NOS", Rate: 5, Quantity: 1, TaxableValue: 50, CGST: 1.25, SGST: 1.25},
		{BillID: "b1", HSN: "996331", Name: "Service", Rate: 5, Quantity: 3, TaxableValue: 90},
	}
	m := aggregateHSN(lines, 1)
	if len(m) != 2 {
		t.Fatalf("expected 2 hsn keys, got %d", len(m))
	}
	var rice, svc *hsnRow
	for _, r := range m {
		if r.HSN == "1001" {
			rice = r
		} else {
			svc = r
		}
	}
	if rice.Quantity != 3 || rice.TaxableValue != 150 || rice.TotalValue != 157.5 {
		t.Fatalf("bad rice row: %+v", rice)
	}
	if svc.UQC != "NA" || svc.Quantity != 0 {
		t.Fatalf("SAC should be NA/0 qty: %+v", svc)
	}

	mergeHSN(m, []repository.GSTCNLineRow{
		{CreditNoteID: "c1", HSN: "1001", Name: "Rice", Unit: "NOS", Rate: 5, Quantity: 1, TaxableValue: 50, CGST: 1.25, SGST: 1.25},
	})
	if rice.Quantity != 2 || rice.TaxableValue != 100 {
		t.Fatalf("CN merge failed: %+v", rice)
	}
}

func TestDocNumberSeries(t *testing.T) {
	nums := []docNumber{
		{"INV/2526/00001", 1, "2526", false},
		{"INV/2526/00002", 2, "2526", true},
		{"INV/2526/00003", 3, "2526", false},
		{"CN/2526/00001", 1, "2526", false},
	}
	docs := docNumberSeries("invoices", "Invoices for outward supply", nums)
	if len(docs) != 2 {
		t.Fatalf("expected 2 series, got %v", docs)
	}
	inv := docs[0]
	if inv.From != "INV/2526/00001" || inv.To != "INV/2526/00003" || inv.Total != 3 || inv.Cancelled != 1 || inv.Net != 2 {
		t.Fatalf("bad invoice series: %+v", inv)
	}
}

// A credit note whose parent bill is outside the report range (not in the
// bills slice) must still classify by its joined parent fields.
func TestCNWithOutOfRangeParent(t *testing.T) {
	billsByID := map[string]repository.GSTBillRow{} // parent bill not fetched
	cn := repository.GSTCNRow{
		ID: "cn9", BillID: "old-bill", CreditNoteNo: "CN/2526/00099",
		ParentInvoiceNo: "INV/2526/00001", ParentSupplyType: "B2B",
		ParentStatus: "active",
	}
	cnByID := map[string]repository.GSTCNRow{"cn9": cn}
	cnLines := []repository.GSTCNLineRow{
		{CreditNoteID: "cn9", Rate: 5, TaxableValue: 50, CGST: 1.25, SGST: 1.25, HSN: "1001", Name: "Rice", Unit: "NOS", Quantity: 1},
	}

	out := aggregateRateWise(nil, cnLines, billsByID, cnByID)
	if len(out) != 1 || out[0].B2BTaxable != -50 {
		t.Fatalf("CN against out-of-range B2B bill not classified B2B: %+v", out)
	}
}

func TestComputeGSTR1Sections(t *testing.T) {
	store := &models.Store{StateCode: "27", GSTIN: "27AAAAA0000A1Z5", SwiggyGSTIN: "27AAFCB7707D1ZQ"}
	at := time.Date(2026, 10, 31, 19, 0, 0, 0, time.UTC) // 1 Nov 00:30 IST
	bills := []repository.GSTBillRow{
		{ID: "b1", InvoiceNo: "INV/2627/00001", InvoiceSeq: 1, FY: "2627", SupplyType: "B2CS", PlaceOfSupply: "27", Status: "active", GeneratedAt: at},
		{ID: "b2", InvoiceNo: "INV/2627/00002", InvoiceSeq: 2, FY: "2627", SupplyType: "ECO", OrderSource: "swiggy", PlaceOfSupply: "27", Status: "active", TaxableValue: 300, GeneratedAt: at},
		{ID: "b3", InvoiceNo: "INV/2627/00003", InvoiceSeq: 3, FY: "2627", SupplyType: "B2B", BuyerGSTIN: "29ABCDE1234F1Z5", PlaceOfSupply: "27", Status: "active", GeneratedAt: at},
		{ID: "b4", InvoiceNo: "INV/2627/00004", InvoiceSeq: 4, FY: "2627", SupplyType: "B2CS", PlaceOfSupply: "27", Status: "cancelled", GeneratedAt: at},
	}
	lines := []repository.GSTLineRow{
		{BillID: "b1", Rate: 5, TaxableValue: 100, CGST: 2.5, SGST: 2.5, HSN: "996331", TaxCategory: "taxable"},
		{BillID: "b1", Rate: 0, TaxableValue: 20, HSN: "996331", TaxCategory: "exempt"},
		{BillID: "b2", Rate: 0, TaxableValue: 300, HSN: "996331", TaxCategory: "taxable"},
		{BillID: "b3", Rate: 0, TaxableValue: 50, HSN: "2201", TaxCategory: "nil_rated"},
		{BillID: "b4", Rate: 5, TaxableValue: 999, CGST: 25, SGST: 25, HSN: "996331", TaxCategory: "taxable"},
	}
	cns := []repository.GSTCNRow{
		{ID: "c1", CreditNoteNo: "CN/2627/00001", Seq: 1, FY: "2627", Status: "active", ParentStatus: "cancelled", ParentSupplyType: "B2CS"},
		{ID: "c2", CreditNoteNo: "CN/2627/00002", Seq: 2, FY: "2627", Status: "cancelled", ParentStatus: "active", ParentSupplyType: "B2CS"},
	}
	d := computeGSTR1(store, bills, lines, cns, nil)

	if len(d.B2CS) != 1 || d.B2CS[0].Rate != 5 || d.B2CS[0].TaxableValue != 100 {
		t.Fatalf("b2cs must hold only the 5%% line: %+v", d.B2CS)
	}
	if len(d.B2B) != 0 {
		t.Fatalf("an all-nil-rated B2B invoice belongs in Table 8, not b2b: %+v", d.B2B)
	}
	nilBy := map[string]nilRow{}
	for _, n := range d.Nil {
		nilBy[n.SupplyType] = n
	}
	if nilBy["INTRAB2C"].Exempt != 20 || nilBy["INTRAB2B"].Nil != 50 {
		t.Fatalf("bad Table 8 rows: %+v", d.Nil)
	}
	if len(d.ECO) != 1 || d.ECO[0].ECOGSTIN != "27AAFCB7707D1ZQ" || d.ECO[0].TaxableValue != 300 {
		t.Fatalf("ECO sale must use the store's Swiggy GSTIN: %+v", d.ECO)
	}
	if len(d.Warnings) != 0 {
		t.Fatalf("unexpected warnings: %v", d.Warnings)
	}
	if len(d.InvoiceDocs) != 1 || d.InvoiceDocs[0].Total != 4 || d.InvoiceDocs[0].Cancelled != 1 {
		t.Fatalf("bad invoice doc summary: %+v", d.InvoiceDocs)
	}
	if len(d.NoteDocs) != 1 || d.NoteDocs[0].Total != 2 || d.NoteDocs[0].Cancelled != 1 {
		t.Fatalf("doc summary must count every credit note issued: %+v", d.NoteDocs)
	}
	if got := istDate(at, "2006-01-02"); got != "2026-11-01" {
		t.Fatalf("invoice date must be the IST day, got %s", got)
	}
}

func TestECOMissingGSTINWarns(t *testing.T) {
	store := &models.Store{StateCode: "27"}
	bills := []repository.GSTBillRow{{ID: "b1", SupplyType: "ECO", OrderSource: "zomato", Status: "active", TaxableValue: 10}}
	d := computeGSTR1(store, bills, nil, nil, nil)
	if len(d.Warnings) != 1 {
		t.Fatalf("expected a missing-GSTIN warning, got %v", d.Warnings)
	}
}

func TestParseISTDateQuery(t *testing.T) {
	r := httptest.NewRequest("GET", "/x?startDate=2026-11-01&endDate=2026-11-30", nil)
	from := parseISTDateQuery(r, "startDate", false)
	to := parseISTDateQuery(r, "endDate", true)
	if from.UTC().Format(time.RFC3339) != "2026-10-31T18:30:00Z" {
		t.Fatalf("start must be IST midnight, got %s", from.UTC())
	}
	if to.In(gst.IST).Format("2006-01-02 15:04") != "2026-11-30 23:59" {
		t.Fatalf("end must cover the whole IST day, got %s", to.In(gst.IST))
	}
}
