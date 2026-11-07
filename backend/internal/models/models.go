package models

import (
	"time"
)

// Position represents 2D coordinates for restaurant tables
type Position struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// Store represents store table schema and json dto
type Store struct {
	ID                    string  `json:"id"`
	Name                  string  `json:"name"`
	Branch                string  `json:"branch"`
	Location              string  `json:"location"`
	GSTIN                 string  `json:"gstin"`
	FSSAINo               string  `json:"fssaiNo"`
	Phone                 string  `json:"phone"`
	SecondaryPhone        string  `json:"secondaryPhone"`
	PrinterName           string  `json:"printerName"`
	PrinterVendorID       string  `json:"printerVendorId"`
	PrinterProductID      string  `json:"printerProductId"`
	InvoiceSize           string  `json:"invoiceSize"`
	KOTPrintEnabled       bool    `json:"kotPrintEnabled"`
	RemoteBillingEnabled  bool    `json:"remoteBillingEnabled"`
	RemotePrinterDeviceID string  `json:"remotePrinterDeviceId"`
	LogoURL               string  `json:"logoUrl"`
	ThemeColor            string  `json:"themeColor"`
	TaxEnabled            bool    `json:"taxEnabled"`
	DefaultTaxPercent     float64 `json:"defaultTaxPercent"`
	GSTRegistrationType   string  `json:"gstRegistrationType"`
	StateCode             string  `json:"stateCode"`
	PricesIncludeTax      bool    `json:"pricesIncludeTax"`
	InvoicePrefix         string  `json:"invoicePrefix"`
	CreditNotePrefix      string  `json:"creditNotePrefix"`
	DefaultSACCode        string  `json:"defaultSacCode"`
	// GSTINs of the e-commerce operators that pay GST u/s 9(5) on orders
	// placed through them (reported in GSTR-1 Table 14).
	SwiggyGSTIN   string `json:"swiggyGstin"`
	ZomatoGSTIN   string `json:"zomatoGstin"`
	OtherEcoGSTIN string `json:"otherEcoGstin"`
	// DataRetentionDays hides orders, bills, sales/profit reports and
	// expenses older than N days from non-superadmin roles. The rows are
	// kept in the database and remain visible to superadmin. 0 = unlimited.
	DataRetentionDays int `json:"dataRetentionDays"`
	// MyPlanEnabled controls whether the "My Plan" menu/page is visible to
	// this store's users (superadmin always sees it). Superadmin-only setting.
	MyPlanEnabled    bool       `json:"myPlanEnabled"`
	IsActive         bool       `json:"isActive"`
	AppVersion       string     `json:"appVersion,omitempty"`
	AppVersionSeenAt *time.Time `json:"appVersionSeenAt,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
}

// User represents user table schema and json dto
type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"-"` // Never output password hash in json
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	StoreID   string    `json:"storeId"`
	StoreName string    `json:"storeName,omitempty"`
	StoreIDs  []string  `json:"storeIds"`
	IsActive  bool      `json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
}

// Category represents category table schema and json dto
type Category struct {
	ID          string    `json:"id"`
	StoreID     string    `json:"storeId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsActive    bool      `json:"isActive"`
	Enabled     bool      `json:"enabled"`
	IsFavourite bool      `json:"isFavourite"`
	SortOrder   int       `json:"sortOrder"`
	CreatedAt   time.Time `json:"createdAt,omitempty"`
	ModifiedBy  string    `json:"modifiedBy,omitempty"`
}

// Item represents item table schema and json dto
type Item struct {
	ID            string    `json:"id"`
	StoreID       string    `json:"storeId"`
	CategoryID    string    `json:"categoryId"`
	CategoryName  string    `json:"categoryName,omitempty"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Price         float64   `json:"price"`
	HSNCode       string    `json:"hsnCode"`
	TaxPercent    float64   `json:"taxPercent"`
	TaxCategory   string    `json:"taxCategory"`
	IsActive      bool      `json:"isActive"`
	Enabled       bool      `json:"enabled"`
	IsFavourite   bool      `json:"isFavourite"`
	CreatedAt     time.Time `json:"createdAt,omitempty"`
	TotalCost     float64   `json:"totalCost,omitempty"`
	Profit        float64   `json:"profit,omitempty"`
	ProfitPercent float64   `json:"profitPercent,omitempty"`
	ModifiedBy    string    `json:"modifiedBy,omitempty"`
}

// ItemExpense represents a cost component for preparing a menu item
type ItemExpense struct {
	ID          string    `json:"id"`
	StoreID     string    `json:"storeId"`
	ItemID      string    `json:"itemId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Amount      float64   `json:"amount"`
	IsActive    bool      `json:"isActive"`
	CreatedAt   time.Time `json:"createdAt,omitempty"`
	ModifiedBy  string    `json:"modifiedBy,omitempty"`
}

// ItemProfitEntry represents profit analysis for a single menu item
type ItemProfitEntry struct {
	Item          Item          `json:"item"`
	Expenses      []ItemExpense `json:"expenses"`
	TotalCost     float64       `json:"totalCost"`
	Profit        float64       `json:"profit"`
	ProfitPercent float64       `json:"profitPercent"`
}

// ItemProfitReport represents store-wide item profit analysis
type ItemProfitReport struct {
	StoreID              string            `json:"storeId"`
	Items                []ItemProfitEntry `json:"items"`
	TotalSellingValue    float64           `json:"totalSellingValue"`
	TotalCost            float64           `json:"totalCost"`
	TotalProfit          float64           `json:"totalProfit"`
	AverageProfitPercent float64           `json:"averageProfitPercent"`
	ItemsWithCostCount   int               `json:"itemsWithCostCount"`
}

// Table represents table/seat layout schema and json dto
type Table struct {
	ID         string   `json:"id"`
	StoreID    string   `json:"storeId"`
	Number     int      `json:"number"`
	Name       *string  `json:"name,omitempty"`
	Seats      int      `json:"seats"`
	Position   Position `json:"position"`
	IsActive   bool     `json:"isActive"`
	Section    *string  `json:"section,omitempty"`
	ModifiedBy string   `json:"modifiedBy,omitempty"`
}

// TableSection represents a section/floor that exists independently of tables.
type TableSection struct {
	ID        string    `json:"id"`
	StoreID   string    `json:"storeId"`
	Name      string    `json:"name"`
	IsDefault bool      `json:"isDefault"`
	CreatedAt time.Time `json:"createdAt"`
}

// NestedItem represents the minimal item structure attached to order items
type NestedItem struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Price        float64 `json:"price"`
	Description  string  `json:"description"`
	TaxPercent   float64 `json:"taxPercent,omitempty"`
	CategoryID   string  `json:"categoryId,omitempty"`
	CategoryName string  `json:"categoryName,omitempty"`
}

// OrderItem represents order line items and json dto
type OrderItem struct {
	ItemID     string     `json:"itemId"`
	Quantity   int        `json:"quantity"`
	UnitPrice  float64    `json:"unitPrice"`
	TaxPercent float64    `json:"taxPercent"`
	Notes      string     `json:"notes"`
	Item       NestedItem `json:"item"`
}

// Order represents order table schema and json dto
type Order struct {
	ID             string      `json:"id"`
	StoreID        string      `json:"storeId"`
	TableID        string      `json:"tableId"`
	TableNumber    int         `json:"tableNumber"`
	TableName      string      `json:"tableName,omitempty"`
	Status         string      `json:"status"`
	OrderType      string      `json:"orderType"`
	CustomerName   string      `json:"customerName"`
	CustomerMobile string      `json:"customerMobile"`
	TotalAmount    float64     `json:"totalAmount"`
	TaxAmount      float64     `json:"taxAmount"`
	DiscountAmount float64     `json:"discountAmount"`
	PaymentMethod  string      `json:"paymentMethod"`
	PaymentStatus  string      `json:"paymentStatus"`
	OrderSource    string      `json:"orderSource"`
	CreatedBy      string      `json:"createdBy"`
	CreatedAt      time.Time   `json:"createdAt"`
	UpdatedAt      time.Time   `json:"updatedAt"`
	CancelledAt    *time.Time  `json:"cancelledAt,omitempty"`
	Items          []OrderItem `json:"items"`
}

// Bill represents invoice bill table schema and json dto
type Bill struct {
	ID             string      `json:"id"`
	StoreID        string      `json:"storeId"`
	OrderID        string      `json:"orderId"`
	TableNumber    int         `json:"tableNumber"`
	TableName      string      `json:"tableName,omitempty"`
	InvoiceNo      string      `json:"invoiceNo"`
	Subtotal       float64     `json:"subtotal"`
	TaxTotal       float64     `json:"taxTotal"`
	Discount       float64     `json:"discount"`
	Total          float64     `json:"total"`
	PaymentMethod  string      `json:"paymentMethod"`
	CustomerName   string      `json:"customerName"`
	CustomerMobile string      `json:"customerMobile"`
	IsPrinted      bool        `json:"isPrinted"`
	Status         string      `json:"status"`
	GeneratedAt    time.Time   `json:"generatedAt"`
	GeneratedBy    string      `json:"generatedBy"`
	Items          []OrderItem `json:"items"`

	// GST fields — populated for bills issued through the unified GST
	// pipeline (fy IS NOT NULL). Legacy bills leave these empty.
	FY                string          `json:"fy,omitempty"`
	InvoiceSeq        int             `json:"invoiceSeq,omitempty"`
	DocumentType      string          `json:"documentType,omitempty"`
	SupplyType        string          `json:"supplyType,omitempty"`
	PlaceOfSupply     string          `json:"placeOfSupply,omitempty"`
	PlaceOfSupplyName string          `json:"placeOfSupplyName,omitempty"`
	SupplierGSTIN     string          `json:"supplierGstin,omitempty"`
	SupplierStateCode string          `json:"supplierStateCode,omitempty"`
	BuyerGSTIN        string          `json:"buyerGstin,omitempty"`
	BuyerName         string          `json:"buyerName,omitempty"`
	BuyerAddress      string          `json:"buyerAddress,omitempty"`
	BuyerStateCode    string          `json:"buyerStateCode,omitempty"`
	OrderSource       string          `json:"orderSource,omitempty"`
	EcoGSTIN          string          `json:"ecoGstin,omitempty"`
	PricesIncludeTax  bool            `json:"pricesIncludeTax"`
	TaxableValue      float64         `json:"taxableValue"`
	CGST              float64         `json:"cgst"`
	SGST              float64         `json:"sgst"`
	IGST              float64         `json:"igst"`
	Cess              float64         `json:"cess"`
	RoundOff          float64         `json:"roundOff"`
	IsUTGST           bool            `json:"isUtgst"`
	CancelledAt       *time.Time      `json:"cancelledAt,omitempty"`
	CancelReason      string          `json:"cancelReason,omitempty"`
	CreditedTotal     float64         `json:"creditedTotal"`
	Lines             []BillLine      `json:"lines"`
	TaxSummary        []TaxSummaryRow `json:"taxSummary"`
}

// BillLine is a computed GST line stored in bill_lines.
type BillLine struct {
	ID           int64   `json:"id"`
	BillID       string  `json:"billId"`
	ItemID       string  `json:"itemId"`
	Name         string  `json:"name"`
	HSNCode      string  `json:"hsnCode"`
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
	// CreditedQuantity is the quantity already reversed by active credit notes.
	CreditedQuantity float64 `json:"creditedQuantity"`
}

// TaxSummaryRow aggregates bill line amounts per GST rate.
type TaxSummaryRow struct {
	Rate         float64 `json:"rate"`
	TaxableValue float64 `json:"taxableValue"`
	CGST         float64 `json:"cgst"`
	SGST         float64 `json:"sgst"`
	IGST         float64 `json:"igst"`
	Cess         float64 `json:"cess"`
}

// CreditNote is a GST credit note issued against a bill.
type CreditNote struct {
	ID             string           `json:"id"`
	StoreID        string           `json:"storeId"`
	BillID         string           `json:"billId"`
	CreditNoteNo   string           `json:"creditNoteNo"`
	FY             string           `json:"fy"`
	Seq            int              `json:"seq"`
	Reason         string           `json:"reason"`
	SupplyType     string           `json:"supplyType"`
	PlaceOfSupply  string           `json:"placeOfSupply"`
	BuyerGSTIN     string           `json:"buyerGstin,omitempty"`
	IsUTGST        bool             `json:"isUtgst"`
	TaxableValue   float64          `json:"taxableValue"`
	CGST           float64          `json:"cgst"`
	SGST           float64          `json:"sgst"`
	IGST           float64          `json:"igst"`
	Cess           float64          `json:"cess"`
	RoundOff       float64          `json:"roundOff"`
	Total          float64          `json:"total"`
	Status         string           `json:"status"`
	IssuedAt       time.Time        `json:"issuedAt"`
	IssuedBy       string           `json:"issuedBy"`
	OriginalBillNo string           `json:"originalInvoiceNo,omitempty"`
	OriginalBillAt *time.Time       `json:"originalInvoiceDate,omitempty"`
	Lines          []CreditNoteLine `json:"lines"`
}

// CreditNoteLine is one credited quantity line of a credit note.
type CreditNoteLine struct {
	ID           int64   `json:"id"`
	CreditNoteID string  `json:"creditNoteId"`
	BillLineID   int64   `json:"billLineId"`
	ItemID       string  `json:"itemId"`
	Name         string  `json:"name"`
	HSNCode      string  `json:"hsnCode"`
	Unit         string  `json:"unit"`
	Quantity     float64 `json:"quantity"`
	TaxableValue float64 `json:"taxableValue"`
	TaxRate      float64 `json:"taxRate"`
	CGST         float64 `json:"cgst"`
	SGST         float64 `json:"sgst"`
	IGST         float64 `json:"igst"`
	Cess         float64 `json:"cess"`
	Total        float64 `json:"total"`
}

type BillQueueItem struct {
	ID           string    `json:"id"`
	StoreID      string    `json:"storeId"`
	OrderID      string    `json:"orderId"`
	BillData     string    `json:"billData"`
	Status       string    `json:"status"`
	ErrorMessage string    `json:"errorMessage,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// Settings represents key-value store configurations
type Settings struct {
	ID      int    `json:"id"`
	StoreID string `json:"storeId"`
	Key     string `json:"key"`
	Value   string `json:"value"`
}

// Request and Response DTOs

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type UserSummary struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	Role      string  `json:"role"`
	StoreID   string  `json:"storeId"`
	StoreName string  `json:"storeName,omitempty"`
	Stores    []Store `json:"stores"`
	IsActive  bool    `json:"isActive"`
}

type LoginResponse struct {
	Token string      `json:"token"`
	User  UserSummary `json:"user"`
}

type SwitchStoreRequest struct {
	StoreID string `json:"storeId"`
}

type SwitchStoreResponse struct {
	Store Store `json:"store"`
}

type UploadLogoRequest struct {
	LogoBase64 string `json:"logoBase64"`
}

type UploadLogoResponse struct {
	Success bool   `json:"success"`
	LogoURL string `json:"logoUrl"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type ResetPasswordRequest struct {
	Password string `json:"password"`
}

type NextInvoiceNoResponse struct {
	InvoiceNo string `json:"invoiceNo"`
}

type PrintJobPrinterConfig struct {
	Type       string `json:"type"`
	Name       string `json:"name"`
	VendorID   string `json:"vendor_id"`
	ProductID  string `json:"product_id"`
	PaperWidth string `json:"paper_width"`
}

type PrintInvoiceRequest struct {
	OrderID       string                 `json:"orderId"`
	InvoiceNo     string                 `json:"invoiceNo,omitempty"`
	CustomerName  string                 `json:"customerName,omitempty"`
	PaymentMethod string                 `json:"paymentMethod,omitempty"`
	UPIID         string                 `json:"upiId,omitempty"`
	PrinterConfig *PrintJobPrinterConfig `json:"printerConfig,omitempty"`
}

type PrintKOTRequest struct {
	OrderID       string                 `json:"orderId"`
	PrinterConfig *PrintJobPrinterConfig `json:"printerConfig,omitempty"`
}

type SystemResetRequest struct {
	Users      bool `json:"users"`
	Stores     bool `json:"stores"`
	Categories bool `json:"categories"`
	Items      bool `json:"items"`
	Orders     bool `json:"orders"`
	Tables     bool `json:"tables"`
	Bills      bool `json:"bills"`
}

type SystemConfigRequest struct {
	CleanupEnabled      bool `json:"cleanupEnabled"`
	CleanupIntervalMins int  `json:"cleanupIntervalMins"`
}

type SystemConfigResponse struct {
	CleanupEnabled      bool    `json:"cleanupEnabled"`
	CleanupIntervalMins int     `json:"cleanupIntervalMins"`
	CleanupLastRun      *string `json:"cleanupLastRun"`
}

type AppUpdateRequest struct {
	Platform     string `json:"platform"`
	Enabled      bool   `json:"enabled"`
	Version      string `json:"version"`
	DownloadURL  string `json:"downloadUrl"`
	ReleaseNotes string `json:"releaseNotes"`
}

type SupportConfig struct {
	Email        string `json:"email"`
	Phone        string `json:"phone"`
	WhatsAppLink string `json:"whatsappLink"`
}

type SupportConfigRequest struct {
	Email        string `json:"email"`
	Phone        string `json:"phone"`
	WhatsAppLink string `json:"whatsappLink"`
}

// UpdateRepoConfig holds the GitHub repository used for desktop app update checks
type UpdateRepoConfig struct {
	GitHubRepo string `json:"githubRepo"`
}

type UpdateRepoConfigRequest struct {
	GitHubRepo string `json:"githubRepo"`
}

// GeminiConfig holds the API key and model used for AI menu parsing.
type GeminiConfig struct {
	APIKey string `json:"apiKey"`
	Model  string `json:"model"`
}

type GeminiConfigRequest struct {
	APIKey string `json:"apiKey"`
	Model  string `json:"model"`
}

// GeminiModel is a single entry returned by the Gemini "list models" endpoint.
type GeminiModel struct {
	Name                       string   `json:"name"`
	DisplayName                string   `json:"displayName,omitempty"`
	SupportedGenerationMethods []string `json:"supportedGenerationMethods,omitempty"`
}

// ParsedMenuItem is a single item extracted from an uploaded menu.
type ParsedMenuItem struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	HSNCode     string  `json:"hsnCode"`
	TaxPercent  float64 `json:"taxPercent"`
	TaxCategory string  `json:"taxCategory,omitempty"`
	// MatchedItemID is set by the frontend when an existing item is matched
	// by name. Used only for "merge" imports to update the existing item
	// instead of creating a duplicate.
	MatchedItemID string `json:"matchedItemId,omitempty"`
}

// ParsedMenuCategory is a category with its items extracted from an uploaded menu.
type ParsedMenuCategory struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Items       []ParsedMenuItem `json:"items"`
	// MatchedCategoryID is set by the frontend when an existing category is
	// matched by name. Used only for "merge" imports to reuse the existing
	// category instead of creating a duplicate.
	MatchedCategoryID string `json:"matchedCategoryId,omitempty"`
}

// ParsedMenu is the standardized structure Gemini must return for a menu.
type ParsedMenu struct {
	Categories []ParsedMenuCategory `json:"categories"`
}

// MenuParseImage is a single image/PDF sent for parsing. Multiple images may
// be supplied in a single parse request (e.g. a multi-page menu photographed
// as several pictures).
type MenuParseImage struct {
	ImageBase64 string `json:"imageBase64"` // may include data:<mime>;base64, prefix
	MimeType    string `json:"mimeType"`    // e.g. image/jpeg, application/pdf
}

// MenuParseRequest is the payload for POST /api/menu/parse.
// Either a single ImageBase64/MimeType pair (legacy) or an Images array may be
// supplied. When both are present, Images takes precedence.
type MenuParseRequest struct {
	StoreID     string           `json:"storeId"`
	ImageBase64 string           `json:"imageBase64"` // legacy single-image field
	MimeType    string           `json:"mimeType"`    // legacy single-image field
	Images      []MenuParseImage `json:"images"`      // multi-image upload
}

// MenuParseResponse is returned to the frontend after parsing a menu image.
type MenuParseResponse struct {
	Menu        ParsedMenu `json:"menu"`
	RawResponse string     `json:"rawResponse"`
	Model       string     `json:"model"`
}

// BulkMenuImportMode controls how BulkMenuRequest is applied.
//   - "add":    insert all parsed categories/items (legacy ReplaceExisting=false)
//   - "replace": soft-delete the entire current menu, then insert (legacy ReplaceExisting=true)
//   - "merge":  update matched items in place, add new items/categories, leave
//     untouched items as-is.
type BulkMenuImportMode string

const (
	BulkMenuModeAdd     BulkMenuImportMode = "add"
	BulkMenuModeReplace BulkMenuImportMode = "replace"
	BulkMenuModeMerge   BulkMenuImportMode = "merge"
)

// BulkMenuRequest is the payload for POST /api/menu/bulk.
// Mode controls the import behaviour ("add", "replace" or "merge"). The legacy
// ReplaceExisting bool is still honoured when Mode is empty: true maps to
// "replace" and false maps to "add".
type BulkMenuRequest struct {
	StoreID         string               `json:"storeId"`
	Mode            BulkMenuImportMode   `json:"mode"`
	ReplaceExisting bool                 `json:"replaceExisting"` // legacy
	Categories      []ParsedMenuCategory `json:"categories"`
}

type BulkMenuResponse struct {
	Message          string `json:"message"`
	CategoriesAdded  int    `json:"categoriesAdded"`
	ItemsAdded       int    `json:"itemsAdded"`
	ItemsUpdated     int    `json:"itemsUpdated"`
	CategoriesReused int    `json:"categoriesReused"`
}

// ExpenseCategory represents expense category table schema and json dto
type ExpenseCategory struct {
	ID          string    `json:"id"`
	StoreID     string    `json:"storeId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsActive    bool      `json:"isActive"`
	CreatedAt   time.Time `json:"createdAt,omitempty"`
	ModifiedBy  string    `json:"modifiedBy,omitempty"`
}

// Expense represents expense table schema and json dto
type Expense struct {
	ID            string    `json:"id"`
	StoreID       string    `json:"storeId"`
	CategoryID    string    `json:"categoryId"`
	CategoryName  string    `json:"categoryName,omitempty"`
	Title         string    `json:"title"`
	Description   string    `json:"description"`
	Amount        float64   `json:"amount"`
	ExpenseDate   time.Time `json:"expenseDate"`
	PaymentMethod string    `json:"paymentMethod"`
	ReceiptNumber string    `json:"receiptNumber"`
	Vendor        string    `json:"vendor"`
	Attachments   []string  `json:"attachments,omitempty"`
	IsActive      bool      `json:"isActive"`
	CreatedAt     time.Time `json:"createdAt,omitempty"`
	UpdatedAt     time.Time `json:"updatedAt,omitempty"`
	CreatedBy     string    `json:"createdBy"`
	ModifiedBy    string    `json:"modifiedBy,omitempty"`
}

// ExpenseReport represents aggregated expense data for reports
type ExpenseReport struct {
	CategoryID   string  `json:"categoryId"`
	CategoryName string  `json:"categoryName"`
	TotalAmount  float64 `json:"totalAmount"`
	ExpenseCount int     `json:"expenseCount"`
}

// ExpenseSummary represents daily/monthly expense summary
type ExpenseSummary struct {
	Date         string  `json:"date"`
	TotalAmount  float64 `json:"totalAmount"`
	ExpenseCount int     `json:"expenseCount"`
}

// TopSellingItemRow is one aggregated item-by-date group in the top
// selling items report.
type TopSellingItemRow struct {
	ItemID   string  `json:"itemId"`
	Item     string  `json:"item"`
	Category string  `json:"category"`
	Date     string  `json:"date"`
	Count    int     `json:"count"`
	Revenue  float64 `json:"revenue"`
}

// TopSellingItemsReport is a paginated slice of item-by-date sales rows
// plus summary aggregates computed across all matching rows.
type TopSellingItemsReport struct {
	Rows         []TopSellingItemRow `json:"rows"`
	Total        int                 `json:"total"`
	Page         int                 `json:"page"`
	PageSize     int                 `json:"pageSize"`
	UniqueItems  int                 `json:"uniqueItems"`
	TotalCount   int                 `json:"totalCount"`
	TotalRevenue float64             `json:"totalRevenue"`
}

// TopSellingCategoryRow is one aggregated category-by-date group in the
// category sales report.
type TopSellingCategoryRow struct {
	CategoryID string  `json:"categoryId"`
	Category   string  `json:"category"`
	Date       string  `json:"date"`
	Count      int     `json:"count"`
	Revenue    float64 `json:"revenue"`
}

// CategorySaleTotal is a per-category aggregate across the whole filtered
// report range, used for the revenue split chart.
type CategorySaleTotal struct {
	CategoryID string  `json:"categoryId"`
	Category   string  `json:"category"`
	Count      int     `json:"count"`
	Revenue    float64 `json:"revenue"`
}

// TopSellingCategoriesReport is a paginated slice of category-by-date sales
// rows plus summary aggregates computed across all matching rows.
type TopSellingCategoriesReport struct {
	Rows             []TopSellingCategoryRow `json:"rows"`
	Total            int                     `json:"total"`
	Page             int                     `json:"page"`
	PageSize         int                     `json:"pageSize"`
	UniqueCategories int                     `json:"uniqueCategories"`
	TotalCount       int                     `json:"totalCount"`
	TotalRevenue     float64                 `json:"totalRevenue"`
	CategoryTotals   []CategorySaleTotal     `json:"categoryTotals"`
}

// SalesProfitRow is one aggregated item in the sales-based profit report.
type SalesProfitRow struct {
	ItemID        string  `json:"itemId"`
	Name          string  `json:"name"`
	Category      string  `json:"category"`
	QtySold       int     `json:"qtySold"`
	Revenue       float64 `json:"revenue"`
	PrepCost      float64 `json:"prepCost"`
	Profit        float64 `json:"profit"`
	ProfitPercent float64 `json:"profitPercent"`
	HasCostData   bool    `json:"hasCostData"`
}

// SalesProfitReport is a paginated slice of per-item sales profit rows plus
// summary aggregates computed across all rows in the period (search only
// narrows the table rows, matching the storefront behaviour).
type SalesProfitReport struct {
	Rows              []SalesProfitRow `json:"rows"`
	Total             int              `json:"total"`
	Page              int              `json:"page"`
	PageSize          int              `json:"pageSize"`
	UnitsSold         int              `json:"unitsSold"`
	Revenue           float64          `json:"revenue"`
	PrepCost          float64          `json:"prepCost"`
	Profit            float64          `json:"profit"`
	TrackedRevenue    float64          `json:"trackedRevenue"`
	UntrackedRevenue  float64          `json:"untrackedRevenue"`
	ItemsSold         int              `json:"itemsSold"`
	ItemsWithCostSold int              `json:"itemsWithCostSold"`
}

// MenuProfitReport is a paginated slice of menu item profit entries plus
// store-wide menu economics (search only narrows the table rows).
type MenuProfitReport struct {
	Rows                 []ItemProfitEntry `json:"rows"`
	Total                int               `json:"total"`
	Page                 int               `json:"page"`
	PageSize             int               `json:"pageSize"`
	TotalItems           int               `json:"totalItems"`
	ItemsWithCostCount   int               `json:"itemsWithCostCount"`
	TotalSellingValue    float64           `json:"totalSellingValue"`
	TotalCost            float64           `json:"totalCost"`
	TotalProfit          float64           `json:"totalProfit"`
	AverageProfitPercent float64           `json:"averageProfitPercent"`
}

// ExpenseCategoryReport is a paginated slice of expense-by-category rows
// plus report-wide totals. ChartRows carries the whole filtered set so the
// split chart is not limited to the current page.
type ExpenseCategoryReport struct {
	Rows        []ExpenseReport `json:"rows"`
	Total       int             `json:"total"`
	Page        int             `json:"page"`
	PageSize    int             `json:"pageSize"`
	TotalAmount float64         `json:"totalAmount"`
	TotalCount  int             `json:"totalCount"`
	ChartRows   []ExpenseReport `json:"chartRows"`
}

// ExpenseDateReport is a paginated slice of expense-by-date rows plus
// report-wide totals and the complete date set for the split chart.
type ExpenseDateReport struct {
	Rows        []ExpenseSummary `json:"rows"`
	Total       int              `json:"total"`
	Page        int              `json:"page"`
	PageSize    int              `json:"pageSize"`
	TotalAmount float64          `json:"totalAmount"`
	TotalCount  int              `json:"totalCount"`
	ChartRows   []ExpenseSummary `json:"chartRows"`
}

// RevenueEntriesReport is a paginated slice of bill revenue entries for
// the profit report.
type RevenueEntriesReport struct {
	Rows     []Bill `json:"rows"`
	Total    int    `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"pageSize"`
}

// ExpenseEntriesReport is a paginated slice of expense entries for the
// profit report.
type ExpenseEntriesReport struct {
	Rows     []Expense `json:"rows"`
	Total    int       `json:"total"`
	Page     int       `json:"page"`
	PageSize int       `json:"pageSize"`
}

// RevenueReport represents combined revenue, sales, and expense data
type RevenueReport struct {
	PeriodStart       string    `json:"periodStart"`
	PeriodEnd         string    `json:"periodEnd"`
	TotalRevenue      float64   `json:"totalRevenue"`
	TotalExpenses     float64   `json:"totalExpenses"`
	NetProfit         float64   `json:"netProfit"`
	TotalOrders       int       `json:"totalOrders"`
	TotalBills        int       `json:"totalBills"`
	TotalExpenseCount int       `json:"totalExpenseCount"`
	AverageOrderValue float64   `json:"averageOrderValue"`
	Bills             []Bill    `json:"bills"`
	Expenses          []Expense `json:"expenses"`
}

// SupportTicket represents a support request raised by a store user.
type SupportTicket struct {
	ID            string    `json:"id"`
	StoreID       string    `json:"storeId"`
	StoreName     string    `json:"storeName,omitempty"`
	StoreBranch   string    `json:"storeBranch,omitempty"`
	StorePhone    string    `json:"storePhone,omitempty"`
	StoreLocation string    `json:"storeLocation,omitempty"`
	CreatedBy     string    `json:"createdBy"`
	CreatedByName string    `json:"createdByName,omitempty"`
	Subject       string    `json:"subject"`
	Category      string    `json:"category"`
	Priority      string    `json:"priority"`
	Status        string    `json:"status"`
	MessageCount  int       `json:"messageCount"`
	LastMessage   string    `json:"lastMessage,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// SupportMessage is a single reply in a support ticket thread.
type SupportMessage struct {
	ID         string    `json:"id"`
	TicketID   string    `json:"ticketId"`
	SenderID   string    `json:"senderId"`
	SenderName string    `json:"senderName,omitempty"`
	SenderRole string    `json:"senderRole"`
	Message    string    `json:"message"`
	CreatedAt  time.Time `json:"createdAt"`
}

// SupportTicketDetail bundles a ticket with its full message thread.
type SupportTicketDetail struct {
	Ticket   *SupportTicket   `json:"ticket"`
	Messages []SupportMessage `json:"messages"`
}

// CreateSupportTicketRequest is the payload for POST /api/support/tickets.
type CreateSupportTicketRequest struct {
	StoreID  string `json:"storeId"`
	Subject  string `json:"subject"`
	Category string `json:"category"`
	Priority string `json:"priority"`
	Message  string `json:"message"`
}

// CreateSupportMessageRequest is the payload for POST /api/support/tickets/{id}/messages.
type CreateSupportMessageRequest struct {
	Message string `json:"message"`
}

// UpdateSupportTicketStatusRequest is the payload for PATCH /api/support/tickets/{id}/status.
type UpdateSupportTicketStatusRequest struct {
	Status string `json:"status"`
}

// SubscriptionPlan is a recurring pricing package that superadmin can assign
// to stores. Features is a free-form list of included capabilities shown to
// the store admin (purely informational).
type SubscriptionPlan struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Price         float64   `json:"price"`
	Features      []string  `json:"features"`
	RecurringType string    `json:"recurringType"` // monthly | quarterly | biannually | yearly
	IsActive      bool      `json:"isActive"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// StoreSubscription is one billing period of a store on a subscription plan.
// Plan fields are snapshotted at assignment time so history stays accurate
// when the plan is later edited or deleted. EndDate is the next renewal date
// (auto-renew on) or the expiry date (auto-renew off).
type StoreSubscription struct {
	ID            string    `json:"id"`
	StoreID       string    `json:"storeId"`
	StoreName     string    `json:"storeName,omitempty"`
	StoreBranch   string    `json:"storeBranch,omitempty"`
	PlanID        string    `json:"planId"`
	PlanName      string    `json:"planName"`
	PlanPrice     float64   `json:"planPrice"`
	RecurringType string    `json:"recurringType"`
	Status        string    `json:"status"` // active | expired | cancelled | replaced
	StartDate     time.Time `json:"startDate"`
	EndDate       time.Time `json:"endDate"`
	AutoRenew     bool      `json:"autoRenew"`
	// ShowPrice controls whether the plan amount is visible to store users on
	// the My Plan page (off = prices hidden). Superadmin-set per subscription.
	ShowPrice    bool      `json:"showPrice"`
	RenewalCount int       `json:"renewalCount"`
	CreatedBy    string    `json:"createdBy,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// SubscriptionEvent is one audit entry in a store's subscription history
// (created / renewed / expired / upgraded / downgraded / cancelled / ...).
type SubscriptionEvent struct {
	ID             int64     `json:"id"`
	StoreID        string    `json:"storeId"`
	StoreName      string    `json:"storeName,omitempty"`
	SubscriptionID string    `json:"subscriptionId"`
	Action         string    `json:"action"`
	FromPlanID     string    `json:"fromPlanId,omitempty"`
	FromPlanName   string    `json:"fromPlanName,omitempty"`
	ToPlanID       string    `json:"toPlanId,omitempty"`
	ToPlanName     string    `json:"toPlanName,omitempty"`
	Notes          string    `json:"notes,omitempty"`
	CreatedBy      string    `json:"createdBy,omitempty"`
	CreatedByName  string    `json:"createdByName,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
}

// SubscriptionPlanRequest is the payload for POST/PUT /api/subscription-plans.
type SubscriptionPlanRequest struct {
	Name          string   `json:"name"`
	Price         float64  `json:"price"`
	Features      []string `json:"features"`
	RecurringType string   `json:"recurringType"`
	IsActive      *bool    `json:"isActive"`
}

// CreateSubscriptionRequest is the payload for POST /api/subscriptions.
type CreateSubscriptionRequest struct {
	StoreID   string `json:"storeId"`
	PlanID    string `json:"planId"`
	StartDate string `json:"startDate"` // YYYY-MM-DD or RFC3339; empty = now
	AutoRenew *bool  `json:"autoRenew"`
	ShowPrice *bool  `json:"showPrice"`
}

// ChangePlanRequest is the payload for POST /api/subscriptions/{id}/change-plan.
type ChangePlanRequest struct {
	PlanID    string `json:"planId"`
	StartDate string `json:"startDate"` // optional; empty = now
	AutoRenew *bool  `json:"autoRenew"` // optional; nil = keep current setting
	ShowPrice *bool  `json:"showPrice"` // optional; nil = keep current setting
}

// UpdateSubscriptionRequest is the payload for PATCH /api/subscriptions/{id}.
type UpdateSubscriptionRequest struct {
	AutoRenew *bool `json:"autoRenew"`
	ShowPrice *bool `json:"showPrice"`
}

// SubscriptionChangeRequest is a store user's request to upgrade, downgrade
// or cancel their plan. Superadmin approves it and the change is applied
// when the current billing cycle ends (see repository.ProcessDue).
type SubscriptionChangeRequest struct {
	ID                     string     `json:"id"`
	StoreID                string     `json:"storeId"`
	StoreName              string     `json:"storeName,omitempty"`
	StoreBranch            string     `json:"storeBranch,omitempty"`
	SubscriptionID         string     `json:"subscriptionId"`
	Type                   string     `json:"type"` // upgrade | downgrade | plan_change | cancel
	CurrentPlanName        string     `json:"currentPlanName,omitempty"`
	RequestedPlanID        string     `json:"requestedPlanId,omitempty"`
	RequestedPlanName      string     `json:"requestedPlanName,omitempty"`
	RequestedPlanPrice     float64    `json:"requestedPlanPrice"`
	RequestedRecurringType string     `json:"requestedRecurringType,omitempty"`
	EffectiveDate          *time.Time `json:"effectiveDate,omitempty"`
	Status                 string     `json:"status"` // pending | approved | rejected | cancelled | applied
	Note                   string     `json:"note,omitempty"`
	RequestedBy            string     `json:"requestedBy"`
	RequestedByName        string     `json:"requestedByName,omitempty"`
	CreatedAt              time.Time  `json:"createdAt"`
	ResolvedBy             string     `json:"resolvedBy,omitempty"`
	ResolvedByName         string     `json:"resolvedByName,omitempty"`
	ResolvedAt             *time.Time `json:"resolvedAt,omitempty"`
}

// SubmitChangeRequestPayload is the body for POST /api/subscriptions/my/requests.
// Action "change_plan" requires planId (upgrade/downgrade is classified
// server-side by price); Action "cancel" schedules a cancellation.
type SubmitChangeRequestPayload struct {
	Action string `json:"action"` // change_plan | cancel
	PlanID string `json:"planId"`
}

// RejectChangeRequestPayload is the optional body for POST .../reject.
type RejectChangeRequestPayload struct {
	Note string `json:"note"`
}

// MySubscriptionResponse is returned by GET /api/subscriptions/my — the
// caller's store's current subscription (active, or the latest ended period)
// plus the live plan for display details like the feature list.
// PendingRequest is the open change request (pending or approved-awaiting-apply).
type MySubscriptionResponse struct {
	Subscription   *StoreSubscription         `json:"subscription"`
	Plan           *SubscriptionPlan          `json:"plan,omitempty"`
	PendingRequest *SubscriptionChangeRequest `json:"pendingRequest,omitempty"`
}

// SubscriptionPayment is one billing ledger entry for a subscription. Method
// 'auto' marks payments recorded automatically at an auto-renewal boundary;
// other methods are recorded manually by superadmin. PeriodStart/End identify
// the cycle the payment covers.
type SubscriptionPayment struct {
	ID             string     `json:"id"`
	StoreID        string     `json:"storeId"`
	StoreName      string     `json:"storeName,omitempty"`
	StoreBranch    string     `json:"storeBranch,omitempty"`
	SubscriptionID string     `json:"subscriptionId"`
	PlanName       string     `json:"planName,omitempty"`
	Amount         float64    `json:"amount"`
	Method         string     `json:"method"` // auto | cash | upi | bank_transfer | card | other
	Status         string     `json:"status"` // paid | pending | failed | refunded
	PeriodStart    *time.Time `json:"periodStart,omitempty"`
	PeriodEnd      *time.Time `json:"periodEnd,omitempty"`
	PaidAt         time.Time  `json:"paidAt"`
	RecordedBy     string     `json:"recordedBy,omitempty"`
	RecordedByName string     `json:"recordedByName,omitempty"`
	Notes          string     `json:"notes,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
}

// RecordPaymentPayload is the body for POST /api/subscriptions/{id}/payments.
// Renew=true additionally extends the subscription by one billing period —
// this is the only way a non-auto-renewing subscription renews.
type RecordPaymentPayload struct {
	Amount float64 `json:"amount"`
	Method string  `json:"method"`
	Notes  string  `json:"notes"`
	Renew  bool    `json:"renew"`
}

// MySubscriptionHistoryResponse is returned by GET /api/subscriptions/my/history
// — every billing period, audit event and payment for the caller's store.
type MySubscriptionHistoryResponse struct {
	Periods  []StoreSubscription   `json:"periods"`
	Events   []SubscriptionEvent   `json:"events"`
	Payments []SubscriptionPayment `json:"payments"`
}

// RawMaterial represents a store-scoped raw material / ingredient catalog row.
// CurrentStock is derived from the raw_material_transactions ledger.
type RawMaterial struct {
	ID           string    `json:"id"`
	StoreID      string    `json:"storeId"`
	Name         string    `json:"name"`
	Unit         string    `json:"unit"`
	Description  string    `json:"description"`
	CurrentStock float64   `json:"currentStock"`
	MinStock     float64   `json:"minStock"`
	AvgCost      float64   `json:"avgCost"`
	IsActive     bool      `json:"isActive"`
	CreatedAt    time.Time `json:"createdAt,omitempty"`
	UpdatedAt    time.Time `json:"updatedAt,omitempty"`
	CreatedBy    string    `json:"createdBy"`
	ModifiedBy   string    `json:"modifiedBy,omitempty"`

	// OpeningStock is a create-only input: when > 0 an 'adjustment' ledger
	// entry is written so the opening balance is auditable.
	OpeningStock float64 `json:"openingStock,omitempty"`
}

// RawMaterialPurchase records a stock-in event with cost details.
type RawMaterialPurchase struct {
	ID            string    `json:"id"`
	StoreID       string    `json:"storeId"`
	MaterialID    string    `json:"materialId"`
	MaterialName  string    `json:"materialName,omitempty"`
	MaterialUnit  string    `json:"materialUnit,omitempty"`
	Quantity      float64   `json:"quantity"`
	UnitCost      float64   `json:"unitCost"`
	TotalCost     float64   `json:"totalCost"`
	RemainingQty  float64   `json:"remainingQty"`
	ExpiryDate    string    `json:"expiryDate,omitempty"`
	Vendor        string    `json:"vendor"`
	InvoiceNumber string    `json:"invoiceNumber"`
	PurchaseDate  time.Time `json:"purchaseDate"`
	PaymentMethod string    `json:"paymentMethod"`
	Notes         string    `json:"notes"`
	IsActive      bool      `json:"isActive"`
	CreatedAt     time.Time `json:"createdAt,omitempty"`
	UpdatedAt     time.Time `json:"updatedAt,omitempty"`
	CreatedBy     string    `json:"createdBy"`
	ModifiedBy    string    `json:"modifiedBy,omitempty"`
}

// RawMaterialTransaction is one signed ledger entry. Quantity is positive
// for stock-in ('purchase', positive 'adjustment') and negative for
// stock-out ('usage', 'wastage', negative 'adjustment').
type RawMaterialTransaction struct {
	ID              string    `json:"id"`
	StoreID         string    `json:"storeId"`
	MaterialID      string    `json:"materialId"`
	MaterialName    string    `json:"materialName,omitempty"`
	MaterialUnit    string    `json:"materialUnit,omitempty"`
	Type            string    `json:"type"`
	Quantity        float64   `json:"quantity"`
	StockAfter      float64   `json:"stockAfter"`
	ReferenceID     string    `json:"referenceId,omitempty"`
	ItemID          string    `json:"itemId,omitempty"`
	ItemName        string    `json:"itemName,omitempty"`
	UnitCost        float64   `json:"unitCost"`
	Notes           string    `json:"notes"`
	TransactionDate time.Time `json:"transactionDate"`
	IsActive        bool      `json:"isActive"`
	CreatedAt       time.Time `json:"createdAt,omitempty"`
	CreatedBy       string    `json:"createdBy"`
}

// RawMaterialPurchaseReport aggregates purchase spend per material and per date.
type RawMaterialPurchaseReport struct {
	TotalCost  float64                         `json:"totalCost"`
	TotalCount int                             `json:"totalCount"`
	ByMaterial []RawMaterialPurchaseByMaterial `json:"byMaterial"`
	ByDate     []RawMaterialPurchaseByDate     `json:"byDate"`
}

type RawMaterialPurchaseByMaterial struct {
	MaterialID    string  `json:"materialId"`
	MaterialName  string  `json:"materialName"`
	MaterialUnit  string  `json:"materialUnit"`
	Quantity      float64 `json:"quantity"`
	TotalCost     float64 `json:"totalCost"`
	PurchaseCount int     `json:"purchaseCount"`
}

type RawMaterialPurchaseByDate struct {
	Date          string  `json:"date"`
	TotalCost     float64 `json:"totalCost"`
	PurchaseCount int     `json:"purchaseCount"`
}

// ItemRecipe is one raw-material line in a menu item's recipe — the quantity
// of the material consumed per single unit of the item. MaterialAvgCost and
// LineCost are computed read-side for display (qty x weighted avg cost).
type ItemRecipe struct {
	ID              string    `json:"id"`
	StoreID         string    `json:"storeId"`
	ItemID          string    `json:"itemId"`
	MaterialID      string    `json:"materialId"`
	MaterialName    string    `json:"materialName,omitempty"`
	MaterialUnit    string    `json:"materialUnit,omitempty"`
	MaterialAvgCost float64   `json:"materialAvgCost"`
	Quantity        float64   `json:"quantity"`
	LineCost        float64   `json:"lineCost"`
	IsActive        bool      `json:"isActive"`
	CreatedAt       time.Time `json:"createdAt,omitempty"`
}

// SetItemRecipeRequest is the body for PUT /api/items/{itemId}/recipe —
// replaces the item's full recipe atomically.
type SetItemRecipeRequest struct {
	StoreID string                `json:"storeId"`
	Lines   []ItemRecipeLineInput `json:"lines"`
}

type ItemRecipeLineInput struct {
	MaterialID string  `json:"materialId"`
	Quantity   float64 `json:"quantity"`
}

// RawMaterialConsumptionReport aggregates order-driven material consumption.
type RawMaterialConsumptionReport struct {
	TotalCost  float64                            `json:"totalCost"`
	TotalCount int                                `json:"totalCount"`
	ByMaterial []RawMaterialConsumptionByMaterial `json:"byMaterial"`
	ByItem     []RawMaterialConsumptionByItem     `json:"byItem"`
}

type RawMaterialConsumptionByMaterial struct {
	MaterialID   string  `json:"materialId"`
	MaterialName string  `json:"materialName"`
	MaterialUnit string  `json:"materialUnit"`
	Quantity     float64 `json:"quantity"`
	TotalCost    float64 `json:"totalCost"`
	TxnCount     int     `json:"txnCount"`
}

type RawMaterialConsumptionByItem struct {
	ItemID    string  `json:"itemId"`
	ItemName  string  `json:"itemName"`
	TotalCost float64 `json:"totalCost"`
	TxnCount  int     `json:"txnCount"`
}
