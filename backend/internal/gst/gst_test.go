package gst

import (
	"math"
	"strings"
	"testing"
	"time"
)

// makeGSTIN builds a structurally valid GSTIN for the given PAN-like body by
// computing the checksum digit with the package's own algorithm.
func makeGSTIN(body14 string) string {
	return body14 + string(gstinCheckDigit(body14))
}

func TestValidateGSTIN(t *testing.T) {
	valid := makeGSTIN("27ABCDE1234F1Z") // Maharashtra
	if err := ValidateGSTIN(valid); err != nil {
		t.Fatalf("expected valid GSTIN, got %v", err)
	}
	if err := ValidateGSTIN(strings.ToLower(valid) + "  "); err != nil {
		t.Fatalf("expected normalization to pass, got %v", err)
	}

	// Bad checksum
	bad := valid[:14] + "0"
	if valid[14] == '0' {
		bad = valid[:14] + "1"
	}
	if err := ValidateGSTIN(bad); err == nil {
		t.Fatal("expected checksum error")
	}

	// Bad state code (99 not a state)
	if err := ValidateGSTIN(makeGSTIN("99ABCDE1234F1Z")); err == nil {
		t.Fatal("expected state code error")
	}

	for _, s := range []string{"", "27ABCDE1234F1Z", "27ABCDE1234F1Z55", "27ABCDE1234F1A5", "27abcde1234f1z!"} {
		if err := ValidateGSTIN(s); err == nil {
			t.Fatalf("expected error for %q", s)
		}
	}
}

func TestStateTable(t *testing.T) {
	if StateName("27") != "Maharashtra" {
		t.Fatal("bad state name")
	}
	if StateName("99") != "" {
		t.Fatal("expected empty name for unknown code")
	}
	for _, code := range []string{"04", "26", "31", "35", "38"} {
		if !IsUTGST(code) {
			t.Fatalf("expected UTGST for %s", code)
		}
	}
	for _, code := range []string{"01", "07", "27", "34"} {
		if IsUTGST(code) {
			t.Fatalf("unexpected UTGST for %s", code)
		}
	}
	for _, s := range States {
		if !ValidStateCode(s.Code) {
			t.Fatalf("state %s not found", s.Code)
		}
	}
}

func TestValidRate(t *testing.T) {
	for _, r := range []float64{0, 0.25, 3, 5, 12, 18, 28, 40} {
		if !ValidRate(r) {
			t.Fatalf("rate %v should be valid", r)
		}
	}
	for _, r := range []float64{1, 2.5, 7, 18.5, 100, -5} {
		if ValidRate(r) {
			t.Fatalf("rate %v should be invalid", r)
		}
	}
}

func TestFYCode(t *testing.T) {
	cases := []struct {
		at   time.Time
		want string
	}{
		{time.Date(2025, 4, 1, 0, 0, 0, 0, IST), "2526"},
		{time.Date(2026, 3, 31, 23, 59, 0, 0, IST), "2526"},
		{time.Date(2026, 4, 1, 0, 0, 0, 0, IST), "2627"},
		{time.Date(2025, 1, 15, 12, 0, 0, 0, IST), "2425"},
		// A UTC time late on 31 Mar that is already 1 Apr in IST.
		{time.Date(2026, 3, 31, 20, 0, 0, 0, time.UTC), "2627"},
	}
	for _, c := range cases {
		if got := FYCode(c.at); got != c.want {
			t.Fatalf("FYCode(%v) = %q, want %q", c.at, got, c.want)
		}
	}
	end := FYEnd("2526")
	if end.Year() != 2026 || end.Month() != time.March || end.Day() != 31 {
		t.Fatalf("bad FYEnd: %v", end)
	}
	dl := CreditNoteDeadline("2526")
	if dl.Year() != 2026 || dl.Month() != time.November || dl.Day() != 30 {
		t.Fatalf("bad deadline: %v", dl)
	}
	if !time.Now().Before(CreditNoteDeadline(FYCode(time.Now()))) {
		t.Fatal("current-FY credit note deadline should be in the future")
	}
}

func TestFormatDocNo(t *testing.T) {
	s, err := FormatDocNo("INV", "2526", 1)
	if err != nil || s != "INV/2526/00001" {
		t.Fatalf("got %q %v", s, err)
	}
	if _, err := FormatDocNo("INV", "2526", 10000000); err == nil {
		t.Fatal("expected overflow error >16 chars")
	}
	if !ValidPrefix("INV") || !ValidPrefix("CN-1") || !ValidPrefix("A") {
		t.Fatal("valid prefixes rejected")
	}
	for _, p := range []string{"", "TOOLONG", "inv", "I V", "IN/V"} {
		if ValidPrefix(p) {
			t.Fatalf("prefix %q should be invalid", p)
		}
	}
}

func store() StoreProfile {
	return StoreProfile{
		RegistrationType: RegistrationRegular,
		TaxEnabled:       true,
		StateCode:        "27",
		GSTIN:            makeGSTIN("27ABCDE1234F1Z"),
	}
}

func TestComputeExclusiveIntra(t *testing.T) {
	res, err := Compute(Input{
		Store: store(),
		Lines: []LineInput{
			{ItemID: "a", Name: "Dosa", HSN: "996331", Quantity: 2, UnitPrice: 100, TaxRate: 5},
		},
		OrderSource: "pos",
	})
	if err != nil {
		t.Fatal(err)
	}
	l := res.Lines[0]
	if l.TaxableValue != 200 || l.CGST != 5 || l.SGST != 5 || l.IGST != 0 {
		t.Fatalf("bad line: %+v", l)
	}
	if l.CGSTRate != 2.5 || l.Unit != "NA" {
		t.Fatalf("bad rates/unit: %+v", l)
	}
	if res.Total != 210 || res.TotalTax != 10 || res.RoundOff != 0 {
		t.Fatalf("bad totals: %+v", res)
	}
	if res.InterState || res.UTGST || res.PlaceOfSupply != "27" {
		t.Fatalf("bad place of supply: %+v", res)
	}
	if res.SupplyType != "B2CS" || res.DocumentType != "tax_invoice" {
		t.Fatalf("bad types: %+v", res)
	}
}

func TestComputeInclusiveIntra(t *testing.T) {
	s := store()
	s.PricesIncludeTax = true
	res, err := Compute(Input{
		Store: s,
		Lines: []LineInput{
			{ItemID: "a", Name: "Tea", HSN: "2101", Quantity: 1, UnitPrice: 105, TaxRate: 5},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	l := res.Lines[0]
	// 105 inclusive at 5% → taxable 100, CGST 2.5, SGST 2.5, total == menu 105.
	if l.TaxableValue != 100 || l.CGST != 2.5 || l.SGST != 2.5 {
		t.Fatalf("bad inclusive line: %+v", l)
	}
	if l.Total != 105 || res.Total != 105 {
		t.Fatalf("inclusive total should equal menu price: %+v", res)
	}
}

func TestOutOfStateB2BBuyerStaysIntraState(t *testing.T) {
	buyer := makeGSTIN("29ABCDE1234F1Z") // Karnataka buyer at a Maharashtra store
	res, err := Compute(Input{
		Store: store(),
		Lines: []LineInput{
			{ItemID: "a", Name: "Thali", HSN: "9963", Quantity: 1, UnitPrice: 1000, TaxRate: 18},
		},
		Buyer: Buyer{GSTIN: buyer},
	})
	if err != nil {
		t.Fatal(err)
	}
	l := res.Lines[0]
	if l.IGST != 0 || l.CGST != 90 || l.SGST != 90 {
		t.Fatalf("restaurant service must be CGST+SGST: %+v", l)
	}
	if res.InterState || res.PlaceOfSupply != "27" {
		t.Fatalf("place of supply must be the store state: %+v", res)
	}
	if res.SupplyType != "B2B" {
		t.Fatalf("expected B2B, got %s", res.SupplyType)
	}
}

func TestDiscountAllocation(t *testing.T) {
	res, err := Compute(Input{
		Store: store(),
		Lines: []LineInput{
			{Name: "a", HSN: "1001", Quantity: 1, UnitPrice: 33.33, TaxRate: 5},
			{Name: "b", HSN: "1001", Quantity: 1, UnitPrice: 33.33, TaxRate: 5},
			{Name: "c", HSN: "1001", Quantity: 1, UnitPrice: 33.34, TaxRate: 5},
		},
		Discount: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	sum := 0.0
	for _, l := range res.Lines {
		sum = round2(sum + l.Discount)
	}
	if sum != 10 {
		t.Fatalf("discount sum %.2f != 10", sum)
	}
	if res.Discount != 10 {
		t.Fatalf("res.Discount %.2f != 10", res.Discount)
	}

	if _, err := Compute(Input{
		Store:    store(),
		Lines:    []LineInput{{Name: "a", Quantity: 1, UnitPrice: 10}},
		Discount: 11,
	}); err == nil {
		t.Fatal("expected discount>gross error")
	}
	if _, err := Compute(Input{
		Store: store(),
		Lines: []LineInput{{Name: "a", Quantity: -1, UnitPrice: 10}},
	}); err == nil {
		t.Fatal("expected negative quantity error")
	}
}

func TestComposition(t *testing.T) {
	s := store()
	s.RegistrationType = RegistrationComposition
	res, err := Compute(Input{
		Store: s,
		Lines: []LineInput{{Name: "a", HSN: "1001", Quantity: 1, UnitPrice: 100, TaxRate: 5}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.ChargesTax || res.TotalTax != 0 || res.Total != 100 {
		t.Fatalf("composition should charge no tax: %+v", res)
	}
	if res.DocumentType != "bill_of_supply" {
		t.Fatalf("expected bill_of_supply, got %s", res.DocumentType)
	}
}

func TestECOOrder(t *testing.T) {
	res, err := Compute(Input{
		Store:       store(),
		Lines:       []LineInput{{Name: "a", HSN: "1001", Quantity: 1, UnitPrice: 100, TaxRate: 5}},
		OrderSource: "swiggy",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.ChargesTax || res.TotalTax != 0 {
		t.Fatalf("ECO should charge no tax: %+v", res)
	}
	if res.SupplyType != "ECO" {
		t.Fatalf("expected ECO, got %s", res.SupplyType)
	}
}

func TestTaxDisabled(t *testing.T) {
	s := store()
	s.TaxEnabled = false
	res, err := Compute(Input{
		Store: s,
		Lines: []LineInput{{Name: "a", HSN: "1001", Quantity: 1, UnitPrice: 100, TaxRate: 5}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.ChargesTax || res.TotalTax != 0 || res.Total != 100 {
		t.Fatalf("disabled tax: %+v", res)
	}
}

func TestNonTaxableCategories(t *testing.T) {
	for _, cat := range []string{"nil_rated", "exempt", "non_gst"} {
		res, err := Compute(Input{
			Store: store(),
			Lines: []LineInput{{Name: "a", HSN: "1001", Quantity: 1, UnitPrice: 100, TaxRate: 5, TaxCategory: cat}},
		})
		if err != nil {
			t.Fatal(err)
		}
		if res.Lines[0].TaxRate != 0 || res.TotalTax != 0 {
			t.Fatalf("category %s should force rate 0: %+v", cat, res.Lines[0])
		}
	}
}

func TestUTGSTStore(t *testing.T) {
	s := store()
	s.StateCode = "04" // Chandigarh
	s.GSTIN = makeGSTIN("04ABCDE1234F1Z")
	res, err := Compute(Input{
		Store: s,
		Lines: []LineInput{{Name: "a", HSN: "1001", Quantity: 1, UnitPrice: 100, TaxRate: 5}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !res.UTGST || res.InterState {
		t.Fatalf("expected UTGST intra: %+v", res)
	}
	if res.Lines[0].SGST != 2.5 {
		t.Fatalf("expected SGST(UT) amount: %+v", res.Lines[0])
	}
}

func TestRoundOff(t *testing.T) {
	// 19.99 taxable at 18% intra → tax 3.5982 → CGST=SGST=1.80, exact 23.59
	res, err := Compute(Input{
		Store: store(),
		Lines: []LineInput{{Name: "a", HSN: "1001", Quantity: 1, UnitPrice: 19.99, TaxRate: 18}},
	})
	if err != nil {
		t.Fatal(err)
	}
	exact := res.TaxableValue + res.TotalTax
	if res.Total != math.Round(exact) {
		t.Fatalf("total %.2f != round(%.2f)", res.Total, exact)
	}
	if math.Abs(res.RoundOff-(res.Total-exact)) > 0.001 {
		t.Fatalf("bad round off: %+v", res)
	}
}

func TestLargeOutOfStateB2CStaysB2CS(t *testing.T) {
	// B2CL needs an inter-state supply, which a restaurant never makes.
	lines := []LineInput{{Name: "bulk", HSN: "9963", Quantity: 1, UnitPrice: 100001, TaxRate: 18}}
	res, err := Compute(Input{Store: store(), Lines: lines, Buyer: Buyer{StateCode: "29"}})
	if err != nil {
		t.Fatal(err)
	}
	if res.SupplyType != "B2CS" || res.InterState {
		t.Fatalf("expected intra-state B2CS, got %s interstate=%v", res.SupplyType, res.InterState)
	}
}

func TestInvalidBuyerGSTIN(t *testing.T) {
	_, err := Compute(Input{
		Store: store(),
		Lines: []LineInput{{Name: "a", Quantity: 1, UnitPrice: 10}},
		Buyer: Buyer{GSTIN: "29ABCDE1234F1Z"}, // bad checksum
	})
	if err == nil {
		t.Fatal("expected buyer GSTIN error")
	}
}

func TestDocumentTypeUnregistered(t *testing.T) {
	s := store()
	s.RegistrationType = RegistrationUnregistered
	s.GSTIN = ""
	res, err := Compute(Input{
		Store: s,
		Lines: []LineInput{{Name: "a", HSN: "1001", Quantity: 1, UnitPrice: 100, TaxRate: 5}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.DocumentType != "bill" {
		t.Fatalf("expected bill, got %s", res.DocumentType)
	}
}
