package printer

type PrinterConfig struct {
	Name       string `json:"name,omitempty"`
	Type       string `json:"type"` // "usb", "bluetooth", "network"
	VendorID   string `json:"vendor_id,omitempty"`
	ProductID  string `json:"product_id,omitempty"`
	Address    string `json:"address,omitempty"` // MAC address for Bluetooth, IP for Network
	PaperWidth string `json:"paper_width"` // "2inch" or "3inch"
}

type Store struct {
	Name       string `json:"name"`
	Branch     string `json:"branch"`
	Location   string `json:"location"`
	GSTNumber  string `json:"gst_number"`
	FSSAILicNo string `json:"fssai_lic_no"`
	Phone      string `json:"phone"`
	Address    string `json:"address"`
}

type Customer struct {
	Name   string `json:"name"`
	Mobile string `json:"mobile"`
}

type Item struct {
	Name       string  `json:"name"`
	HSN        string  `json:"hsn"`
	Qty        float64 `json:"qty"`
	Unit       string  `json:"unit"`
	Rate       float64 `json:"rate"`
	TaxPercent float64 `json:"tax_percent"`
	Amount     float64 `json:"amount"`
}

type Summary struct {
	SubTotal   float64 `json:"sub_total"`
	Discount   float64 `json:"discount"`
	Taxable    float64 `json:"taxable"`
	CGST       float64 `json:"cgst"`
	SGST       float64 `json:"sgst"`
	GrandTotal float64 `json:"grand_total"`
}

type Payment struct {
	Cash    float64 `json:"cash"`
	Card    float64 `json:"card"`
	Balance float64 `json:"balance"`
	UPI     float64 `json:"upi"`
}

type QR struct {
	Description string `json:"description"`
	Value       string `json:"value"`
	Size        int    `json:"size"`
}

type Invoice struct {
	Store       Store    `json:"store"`
	Customer    Customer `json:"customer"`
	InvoiceNo   string   `json:"invoice_no"`
	BillNo      string   `json:"bill_no"`
	Date        string   `json:"date"`
	PaymentMode string   `json:"payment_mode"`
	DrRef       string   `json:"dr_ref"`
	Items       []Item   `json:"items"`
	Summary     Summary  `json:"summary"`
	Payment     Payment  `json:"payment"`
	QR          *QR      `json:"qr,omitempty"`
	Footer      []string `json:"footer"`
}

type KOT struct {
	OrderID     uint     `json:"order_id"`
	TableNumber string   `json:"table_number"`
	WaiterName  string   `json:"waiter_name"`
	Date        string   `json:"date"`
	Items       []Item   `json:"items"`
	Notes       string   `json:"notes"`
	OrderType   string   `json:"order_type"` // DINE_IN or TAKE_AWAY
	CustomerName   string `json:"customer_name"`
	CustomerMobile string `json:"customer_mobile"`
}

type PrintJob struct {
	Type    string        `json:"type"` // "invoice", "kot"
	Printer PrinterConfig `json:"printer"`
	Invoice *Invoice      `json:"invoice,omitempty"`
	KOT     *KOT          `json:"kot,omitempty"`
}

type Device struct {
	Name      string `json:"name"`
	Type      string `json:"type"` // "USB", "Bluetooth"
	VendorID  string `json:"vendor_id,omitempty"`
	ProductID string `json:"product_id,omitempty"`
	Address   string `json:"address,omitempty"`
}

type RawPrintRequest struct {
	PrinterName string `json:"printerName"`
	Data        string `json:"data"` // Base64 encoded bytes
}
