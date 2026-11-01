// Package gst implements India GST (Goods and Services Tax) primitives for the
// POS backend: GSTIN validation, the state/UT code table, the GST rate list,
// financial-year helpers, GST-compliant document numbering, and the invoice
// tax computation engine. It has no database dependencies.
package gst

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
	_ "time/tzdata"
)

// ------------------------------------
// States / Union Territories
// ------------------------------------

// State is a GST state/UT code entry.
type State struct {
	Code  string `json:"code"`
	Name  string `json:"name"`
	IsUT  bool   `json:"isUT"`
	UTGST bool   `json:"utgst"` // levy UTGST instead of SGST on intra-state supplies
}

// States is the official GST state/UT code table.
var States = []State{
	{"01", "Jammu and Kashmir", true, false},
	{"02", "Himachal Pradesh", false, false},
	{"03", "Punjab", false, false},
	{"04", "Chandigarh", true, true},
	{"05", "Uttarakhand", false, false},
	{"06", "Haryana", false, false},
	{"07", "Delhi", true, false},
	{"08", "Rajasthan", false, false},
	{"09", "Uttar Pradesh", false, false},
	{"10", "Bihar", false, false},
	{"11", "Sikkim", false, false},
	{"12", "Arunachal Pradesh", false, false},
	{"13", "Nagaland", false, false},
	{"14", "Manipur", false, false},
	{"15", "Mizoram", false, false},
	{"16", "Tripura", false, false},
	{"17", "Meghalaya", false, false},
	{"18", "Assam", false, false},
	{"19", "West Bengal", false, false},
	{"20", "Jharkhand", false, false},
	{"21", "Odisha", false, false},
	{"22", "Chhattisgarh", false, false},
	{"23", "Madhya Pradesh", false, false},
	{"24", "Gujarat", false, false},
	{"26", "Dadra and Nagar Haveli and Daman and Diu", true, true},
	{"27", "Maharashtra", false, false},
	{"29", "Karnataka", false, false},
	{"30", "Goa", false, false},
	{"31", "Lakshadweep", true, true},
	{"32", "Kerala", false, false},
	{"33", "Tamil Nadu", false, false},
	{"34", "Puducherry", true, false},
	{"35", "Andaman and Nicobar Islands", true, true},
	{"36", "Telangana", false, false},
	{"37", "Andhra Pradesh", false, false},
	{"38", "Ladakh", true, true},
	{"97", "Other Territory", false, false},
	{"96", "Foreign Country", false, false},
}

var stateByCode = func() map[string]State {
	m := make(map[string]State, len(States))
	for _, s := range States {
		m[s.Code] = s
	}
	return m
}()

// StateName returns the name for a GST state code, or "" for an unknown code.
func StateName(code string) string {
	return stateByCode[strings.TrimSpace(code)].Name
}

// IsUTGST reports whether the code levies UTGST on intra-state supplies.
func IsUTGST(code string) bool {
	return stateByCode[strings.TrimSpace(code)].UTGST
}

// ValidStateCode reports whether the code exists in the GST state table.
func ValidStateCode(code string) bool {
	_, ok := stateByCode[strings.TrimSpace(code)]
	return ok
}

// ------------------------------------
// GSTIN validation
// ------------------------------------

var gstinPattern = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`)

const gstinCharset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

// gstinCheckDigit computes the expected 15th character of a GSTIN.
func gstinCheckDigit(first14 string) byte {
	sum := 0
	for i := 0; i < 14; i++ {
		v := strings.IndexByte(gstinCharset, first14[i])
		factor := 1
		if i%2 == 1 {
			factor = 2
		}
		p := v * factor
		sum += p/36 + p%36
	}
	check := (36 - sum%36) % 36
	return gstinCharset[check]
}

// ValidateGSTIN normalizes (uppercase/trim) and validates a GSTIN: format,
// known state code prefix, and checksum digit.
func ValidateGSTIN(s string) error {
	s = strings.ToUpper(strings.TrimSpace(s))
	if len(s) != 15 {
		return errors.New("GSTIN must be 15 characters")
	}
	if !gstinPattern.MatchString(s) {
		return errors.New("invalid GSTIN format")
	}
	if !ValidStateCode(s[:2]) {
		return fmt.Errorf("invalid GSTIN state code %q", s[:2])
	}
	if gstinCheckDigit(s) != s[14] {
		return errors.New("invalid GSTIN checksum digit")
	}
	return nil
}

var ecoGSTINPattern = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][ZC][0-9A-Z]$`)

// ValidateECOGSTIN validates an e-commerce operator's GSTIN. Operators may
// quote either their regular GSTIN or their TCS registration, which has "C"
// instead of "Z" in the 14th position.
func ValidateECOGSTIN(s string) error {
	s = strings.ToUpper(strings.TrimSpace(s))
	if len(s) != 15 {
		return errors.New("GSTIN must be 15 characters")
	}
	if !ecoGSTINPattern.MatchString(s) {
		return errors.New("invalid GSTIN format")
	}
	if !ValidStateCode(s[:2]) {
		return fmt.Errorf("invalid GSTIN state code %q", s[:2])
	}
	if gstinCheckDigit(s) != s[14] {
		return errors.New("invalid GSTIN checksum digit")
	}
	return nil
}

// NormalizeGSTIN uppercases and trims a GSTIN string.
func NormalizeGSTIN(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}

// ------------------------------------
// Rates, categories, registration types, order sources
// ------------------------------------

// AllowedRates is the set of GST slab rates (plus the special 0.25% rate).
var AllowedRates = []float64{0, 0.25, 3, 5, 12, 18, 28, 40}

// ValidRate reports whether r is an allowed GST rate.
func ValidRate(r float64) bool {
	for _, a := range AllowedRates {
		if r == a {
			return true
		}
	}
	return false
}

// Tax categories for line items. Anything other than "taxable" is outside
// the GST levy and forces the effective rate to 0.
const (
	TaxCategoryTaxable  = "taxable"
	TaxCategoryNilRated = "nil_rated"
	TaxCategoryExempt   = "exempt"
	TaxCategoryNonGST   = "non_gst"
)

var taxCategories = map[string]bool{
	TaxCategoryTaxable:  true,
	TaxCategoryNilRated: true,
	TaxCategoryExempt:   true,
	TaxCategoryNonGST:   true,
}

// ValidTaxCategory reports whether c is a known tax category.
func ValidTaxCategory(c string) bool { return taxCategories[c] }

// Registration types for a store.
const (
	RegistrationRegular      = "regular"
	RegistrationComposition  = "composition"
	RegistrationUnregistered = "unregistered"
)

var registrationTypes = map[string]bool{
	RegistrationRegular:      true,
	RegistrationComposition:  true,
	RegistrationUnregistered: true,
}

// ValidRegistrationType reports whether t is a known registration type.
func ValidRegistrationType(t string) bool { return registrationTypes[t] }

// Order sources. Non-"pos" sources are e-commerce operator (ECO) supplies on
// which the operator collects the tax — the restaurant bill charges no GST.
const (
	SourcePOS    = "pos"
	SourceSwiggy = "swiggy"
	SourceZomato = "zomato"
	SourceOther  = "other_eco"
)

var orderSources = map[string]bool{
	SourcePOS:    true,
	SourceSwiggy: true,
	SourceZomato: true,
	SourceOther:  true,
}

// ValidOrderSource reports whether s is a known order source.
func ValidOrderSource(s string) bool { return orderSources[s] }

// ------------------------------------
// Financial year / document numbering
// ------------------------------------

// IST is the Indian timezone; falls back to a fixed +05:30 zone when the
// system tzdata is missing (time/tzdata is blank-imported so it never is).
var IST = func() *time.Location {
	if loc, err := time.LoadLocation("Asia/Kolkata"); err == nil {
		return loc
	}
	return time.FixedZone("IST", 5*3600+30*60)
}()

// FYCode returns the Indian financial-year code (April–March) containing t,
// formatted as the 4-digit start/end year pair, e.g. "2526" for FY 2025-26.
func FYCode(t time.Time) string {
	t = t.In(IST)
	start := t.Year()
	if t.Month() < time.April {
		start--
	}
	return fmt.Sprintf("%02d%02d", start%100, (start+1)%100)
}

// FYEnd returns the last instant (23:59:59 IST, 31 March) of the financial
// year identified by code (e.g. "2526").
func FYEnd(fy string) time.Time {
	if len(fy) != 4 {
		return time.Time{}
	}
	endYear := 2000 + atoi2(fy[2:4])
	return time.Date(endYear, time.March, 31, 23, 59, 59, 0, IST)
}

// CreditNoteDeadline returns the last instant a credit note may be issued
// against an invoice of the given financial year: 30 November 23:59:59 IST
// following the FY end (Section 34(2) CGST Act).
func CreditNoteDeadline(fy string) time.Time {
	end := FYEnd(fy)
	if end.IsZero() {
		return time.Time{}
	}
	return time.Date(end.Year(), time.November, 30, 23, 59, 59, 0, IST)
}

func atoi2(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

var prefixPattern = regexp.MustCompile(`^[A-Z0-9-]{1,5}$`)

// ValidPrefix reports whether p is a valid document-series prefix.
func ValidPrefix(p string) bool { return prefixPattern.MatchString(p) }

// FormatDocNo formats a GST-compliant document number (Rule 46: max 16
// chars) as PREFIX/FY/seq with the sequence zero-padded to 5 digits.
// Returns an error when the result would exceed 16 characters.
func FormatDocNo(prefix, fy string, seq int) (string, error) {
	s := fmt.Sprintf("%s/%s/%05d", prefix, fy, seq)
	if len(s) > 16 {
		return "", fmt.Errorf("document number %q exceeds 16 characters", s)
	}
	return s, nil
}

// ------------------------------------
// Tax computation engine
// ------------------------------------

// StoreProfile describes the issuing store's GST posture.
type StoreProfile struct {
	RegistrationType string
	TaxEnabled       bool
	PricesIncludeTax bool
	StateCode        string
	GSTIN            string
}

// LineInput is one invoice line to compute.
type LineInput struct {
	ItemID      string
	Name        string
	HSN         string
	Quantity    float64
	UnitPrice   float64
	TaxRate     float64
	TaxCategory string
}

// Buyer identifies the bill recipient for place-of-supply / B2B detection.
type Buyer struct {
	GSTIN     string
	Name      string
	Address   string
	StateCode string
}

// Input is a full bill to compute.
type Input struct {
	Store       StoreProfile
	Lines       []LineInput
	Discount    float64
	Buyer       Buyer
	OrderSource string
}

// Line is a computed invoice line.
type Line struct {
	ItemID       string  `json:"itemId"`
	Name         string  `json:"name"`
	HSN          string  `json:"hsn"`
	Unit         string  `json:"unit"`
	TaxCategory  string  `json:"taxCategory"`
	Quantity     float64 `json:"quantity"`
	UnitPrice    float64 `json:"unitPrice"`
	Gross        float64 `json:"gross"`
	Discount     float64 `json:"discount"`
	TaxableValue float64 `json:"taxableValue"`
	TaxRate      float64 `json:"taxRate"`
	CGSTRate     float64 `json:"cgstRate"`
	CGST         float64 `json:"cgst"`
	SGSTRate     float64 `json:"sgstRate"`
	SGST         float64 `json:"sgst"`
	IGSTRate     float64 `json:"igstRate"`
	IGST         float64 `json:"igst"`
	Cess         float64 `json:"cess"`
	Total        float64 `json:"total"`
}

// RateSummary aggregates amounts per GST rate.
type RateSummary struct {
	Rate         float64 `json:"rate"`
	TaxableValue float64 `json:"taxableValue"`
	CGST         float64 `json:"cgst"`
	SGST         float64 `json:"sgst"`
	IGST         float64 `json:"igst"`
	Cess         float64 `json:"cess"`
}

// Result is the fully computed bill.
type Result struct {
	Lines         []Line        `json:"lines"`
	TaxSummary    []RateSummary `json:"taxSummary"`
	Gross         float64       `json:"gross"`
	Discount      float64       `json:"discount"`
	TaxableValue  float64       `json:"taxableValue"`
	CGST          float64       `json:"cgst"`
	SGST          float64       `json:"sgst"`
	IGST          float64       `json:"igst"`
	Cess          float64       `json:"cess"`
	TotalTax      float64       `json:"totalTax"`
	RoundOff      float64       `json:"roundOff"`
	Total         float64       `json:"total"`
	ChargesTax    bool          `json:"chargesTax"`
	InterState    bool          `json:"interState"`
	UTGST         bool          `json:"utgst"`
	PlaceOfSupply string        `json:"placeOfSupply"`
	SupplyType    string        `json:"supplyType"`
	DocumentType  string        `json:"documentType"`
}

func round2(x float64) float64 { return math.Round(x*100) / 100 }

// Compute runs the invoice tax computation for a bill.
func Compute(in Input) (Result, error) {
	var res Result

	if len(in.Lines) == 0 {
		return res, errors.New("no bill lines")
	}
	regType := in.Store.RegistrationType
	if regType == "" {
		regType = RegistrationRegular
	}
	source := in.OrderSource

	res.ChargesTax = in.Store.TaxEnabled && regType == RegistrationRegular &&
		(source == "" || source == SourcePOS)

	buyerGSTIN := NormalizeGSTIN(in.Buyer.GSTIN)
	if buyerGSTIN != "" {
		if err := ValidateGSTIN(buyerGSTIN); err != nil {
			return res, fmt.Errorf("invalid buyer GSTIN: %w", err)
		}
	}

	// Restaurant and catering services are supplied where they are actually
	// performed (IGST Act s.12(4)), so the place of supply is always the
	// store's state — even for a registered buyer from another state. The
	// buyer's state is only a fallback when the store has no state set.
	switch {
	case in.Store.StateCode != "":
		res.PlaceOfSupply = in.Store.StateCode
	case buyerGSTIN != "":
		res.PlaceOfSupply = buyerGSTIN[:2]
	default:
		res.PlaceOfSupply = in.Buyer.StateCode
	}
	res.InterState = res.PlaceOfSupply != "" && in.Store.StateCode != "" &&
		res.PlaceOfSupply != in.Store.StateCode
	res.UTGST = !res.InterState && IsUTGST(in.Store.StateCode)

	if in.Discount < 0 {
		return res, errors.New("discount cannot be negative")
	}

	// Gross per line and total.
	grossTotal := 0.0
	grosses := make([]float64, len(in.Lines))
	for i, l := range in.Lines {
		if l.Quantity < 0 || l.UnitPrice < 0 {
			return res, fmt.Errorf("line %d: negative quantity or price", i)
		}
		grosses[i] = round2(l.UnitPrice * l.Quantity)
		grossTotal = round2(grossTotal + grosses[i])
	}
	if in.Discount > grossTotal {
		return res, fmt.Errorf("discount %.2f exceeds bill gross %.2f", in.Discount, grossTotal)
	}

	// Allocate the bill-level discount proportionally to each line's gross.
	// The last non-zero line absorbs the rounding remainder so the allocated
	// discounts always sum exactly to the requested discount.
	discounts := make([]float64, len(in.Lines))
	if in.Discount > 0 && grossTotal > 0 {
		last := -1
		allocated := 0.0
		for i, g := range grosses {
			if g > 0 {
				last = i
			}
			discounts[i] = round2(in.Discount * g / grossTotal)
			allocated = round2(allocated + discounts[i])
		}
		if last >= 0 {
			discounts[last] = round2(discounts[last] + in.Discount - allocated)
		}
	}

	res.Lines = make([]Line, 0, len(in.Lines))
	summaryByRate := map[float64]*RateSummary{}

	for i, l := range in.Lines {
		category := l.TaxCategory
		if category == "" {
			category = TaxCategoryTaxable
		}
		rate := l.TaxRate
		if !res.ChargesTax || category != TaxCategoryTaxable {
			rate = 0
		}

		line := Line{
			ItemID:      l.ItemID,
			Name:        l.Name,
			HSN:         l.HSN,
			TaxCategory: category,
			Quantity:    l.Quantity,
			UnitPrice:   l.UnitPrice,
			Gross:       grosses[i],
			Discount:    discounts[i],
			TaxRate:     rate,
		}
		if strings.HasPrefix(l.HSN, "99") {
			line.Unit = "NA" // services SAC has no measurable unit
		} else {
			line.Unit = "NOS"
		}

		amt := round2(line.Gross - line.Discount)
		if in.Store.PricesIncludeTax {
			// Menu prices already include GST: back the tax out of the amount
			// so the line total stays exactly the menu amount.
			if res.InterState {
				line.IGSTRate = rate
				line.IGST = round2(amt * rate / (100 + rate))
				line.TaxableValue = round2(amt - line.IGST)
			} else {
				half := round2(amt * rate / (100 + rate) / 2)
				line.CGSTRate = rate / 2
				line.SGSTRate = rate / 2
				line.CGST = half
				line.SGST = half
				line.TaxableValue = round2(amt - 2*half)
			}
		} else {
			line.TaxableValue = amt
			if res.InterState {
				line.IGSTRate = rate
				line.IGST = round2(amt * rate / 100)
			} else {
				half := round2(amt * rate / 200)
				line.CGSTRate = rate / 2
				line.SGSTRate = rate / 2
				line.CGST = half
				line.SGST = half
			}
		}
		line.Total = round2(line.TaxableValue + line.CGST + line.SGST + line.IGST + line.Cess)

		res.Lines = append(res.Lines, line)
		res.TaxableValue = round2(res.TaxableValue + line.TaxableValue)
		res.CGST = round2(res.CGST + line.CGST)
		res.SGST = round2(res.SGST + line.SGST)
		res.IGST = round2(res.IGST + line.IGST)
		res.Cess = round2(res.Cess + line.Cess)
		res.Gross = round2(res.Gross + line.Gross)
		res.Discount = round2(res.Discount + line.Discount)

		rs := summaryByRate[rate]
		if rs == nil {
			rs = &RateSummary{Rate: rate}
			summaryByRate[rate] = rs
		}
		rs.TaxableValue = round2(rs.TaxableValue + line.TaxableValue)
		rs.CGST = round2(rs.CGST + line.CGST)
		rs.SGST = round2(rs.SGST + line.SGST)
		rs.IGST = round2(rs.IGST + line.IGST)
		rs.Cess = round2(rs.Cess + line.Cess)
	}

	for _, rs := range summaryByRate {
		res.TaxSummary = append(res.TaxSummary, *rs)
	}
	sort.Slice(res.TaxSummary, func(a, b int) bool { return res.TaxSummary[a].Rate < res.TaxSummary[b].Rate })

	res.TotalTax = round2(res.CGST + res.SGST + res.IGST + res.Cess)
	exact := res.TaxableValue + res.TotalTax
	res.Total = math.Round(exact)
	res.RoundOff = round2(res.Total - exact)

	switch {
	case source != "" && source != SourcePOS:
		res.SupplyType = "ECO"
	case buyerGSTIN != "":
		res.SupplyType = "B2B"
	case res.InterState && res.Total > 100000:
		res.SupplyType = "B2CL"
	default:
		res.SupplyType = "B2CS"
	}

	switch {
	case in.Store.TaxEnabled && regType == RegistrationComposition:
		res.DocumentType = "bill_of_supply"
	case in.Store.TaxEnabled && regType == RegistrationRegular && in.Store.GSTIN != "":
		res.DocumentType = "tax_invoice"
	default:
		res.DocumentType = "bill"
	}

	return res, nil
}
