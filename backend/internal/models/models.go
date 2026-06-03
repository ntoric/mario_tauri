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
	ID           string    `json:"id"`
	StoreID      string    `json:"storeId"`
	CategoryID   string    `json:"categoryId"`
	CategoryName string    `json:"categoryName,omitempty"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Price        float64   `json:"price"`
	HSNCode      string    `json:"hsnCode"`
	TaxPercent   float64   `json:"taxPercent"`
	IsActive     bool      `json:"isActive"`
	CreatedAt    time.Time `json:"createdAt,omitempty"`
}

// Table represents table/seat layout schema and json dto
type Table struct {
	ID       string   `json:"id"`
	StoreID  string   `json:"storeId"`
	Number   int      `json:"number"`
	Seats    int      `json:"seats"`
	Position Position `json:"position"`
	IsActive bool     `json:"isActive"`
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
	Email          string `json:"email"`
	Phone          string `json:"phone"`
	WhatsAppLink   string `json:"whatsappLink"`
}

type SupportConfigRequest struct {
	Email        string `json:"email"`
	Phone        string `json:"phone"`
	WhatsAppLink string `json:"whatsappLink"`
}
