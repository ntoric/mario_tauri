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
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	Branch               string    `json:"branch"`
	Location             string    `json:"location"`
	GSTIN                string    `json:"gstin"`
	FSSAINo              string    `json:"fssaiNo"`
	Phone                string    `json:"phone"`
	PrinterName          string    `json:"printerName"`
	PrinterVendorID      string    `json:"printerVendorId"`
	PrinterProductID     string    `json:"printerProductId"`
	InvoiceSize          string    `json:"invoiceSize"`
	KOTPrintEnabled      bool      `json:"kotPrintEnabled"`
	RemoteBillingEnabled bool      `json:"remoteBillingEnabled"`
	LogoURL              string    `json:"logoUrl"`
	ThemeColor           string    `json:"themeColor"`
	TaxEnabled           bool      `json:"taxEnabled"`
	DefaultTaxPercent    float64   `json:"defaultTaxPercent"`
	IsActive             bool      `json:"isActive"`
	CreatedAt            time.Time `json:"createdAt"`
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
	CreatedAt   time.Time `json:"createdAt,omitempty"`
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
	IsActive      bool      `json:"isActive"`
	CreatedAt     time.Time `json:"createdAt,omitempty"`
	TotalCost     float64   `json:"totalCost,omitempty"`
	Profit        float64   `json:"profit,omitempty"`
	ProfitPercent float64   `json:"profitPercent,omitempty"`
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
	ID       string   `json:"id"`
	StoreID  string   `json:"storeId"`
	Number   int      `json:"number"`
	Seats    int      `json:"seats"`
	Position Position `json:"position"`
	IsActive bool     `json:"isActive"`
	Section  *string  `json:"section,omitempty"`
}

// TableSection represents a section/floor that exists independently of tables.
type TableSection struct {
	ID        string    `json:"id"`
	StoreID   string    `json:"storeId"`
	Name      string    `json:"name"`
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
	Status         string      `json:"status"`
	OrderType      string      `json:"orderType"`
	CustomerName   string      `json:"customerName"`
	CustomerMobile string      `json:"customerMobile"`
	TotalAmount    float64     `json:"totalAmount"`
	TaxAmount      float64     `json:"taxAmount"`
	DiscountAmount float64     `json:"discountAmount"`
	PaymentMethod  string      `json:"paymentMethod"`
	PaymentStatus  string      `json:"paymentStatus"`
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
