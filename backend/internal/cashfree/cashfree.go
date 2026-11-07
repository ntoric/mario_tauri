// Package cashfree is a minimal client for the Cashfree Payment Gateway
// orders API. It creates orders (returning a payment_session_id the JS
// checkout SDK consumes), polls order/payment status for verification, and
// validates webhook signatures.
package cashfree

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// apiVersion is the pinned Cashfree PG API version.
const apiVersion = "2023-08-01"

// ErrNotConfigured is returned when the client was built without credentials.
var ErrNotConfigured = errors.New("cashfree is not configured")

type Client struct {
	appID     string
	secretKey string
	env       string // "sandbox" | "production"
	baseURL   string
	http      *http.Client
}

// NewClient builds a client. env is normalized to "sandbox" | "production";
// an empty env defaults to sandbox. Enabled() reports whether credentials
// were supplied at all.
func NewClient(appID, secretKey, env string) *Client {
	env = strings.ToLower(strings.TrimSpace(env))
	if env != "production" && env != "sandbox" {
		env = "sandbox"
	}
	base := "https://sandbox.cashfree.com/pg"
	if env == "production" {
		base = "https://api.cashfree.com/pg"
	}
	return &Client{
		appID:     strings.TrimSpace(appID),
		secretKey: strings.TrimSpace(secretKey),
		env:       env,
		baseURL:   base,
		http:      &http.Client{Timeout: 20 * time.Second},
	}
}

// Enabled reports whether both credentials are present.
func (c *Client) Enabled() bool {
	return c != nil && c.appID != "" && c.secretKey != ""
}

// Mode returns the JS-SDK mode string ("sandbox" | "production") the
// frontend passes to the Cashfree checkout loader.
func (c *Client) Mode() string {
	if c == nil {
		return "sandbox"
	}
	return c.env
}

// ---------- API payloads ----------

// CustomerDetails identifies the paying customer; Cashfree requires at least
// a customer_id and a 10-digit customer_phone.
type CustomerDetails struct {
	CustomerID    string `json:"customer_id"`
	CustomerName  string `json:"customer_name,omitempty"`
	CustomerEmail string `json:"customer_email,omitempty"`
	CustomerPhone string `json:"customer_phone"`
}

// OrderMeta carries optional redirect/webhook URLs.
type OrderMeta struct {
	ReturnURL string `json:"return_url,omitempty"`
	NotifyURL string `json:"notify_url,omitempty"`
}

// CreateOrderRequest is POST /pg/orders.
type CreateOrderRequest struct {
	OrderID         string          `json:"order_id"`
	OrderAmount     float64         `json:"order_amount"`
	OrderCurrency   string          `json:"order_currency"`
	OrderNote       string          `json:"order_note,omitempty"`
	CustomerDetails CustomerDetails `json:"customer_details"`
	OrderMeta       *OrderMeta      `json:"order_meta,omitempty"`
}

// Order is the create/fetch order response (fields we use).
type Order struct {
	OrderID          string  `json:"order_id"`
	CFOrderID        cfID    `json:"cf_order_id"`
	OrderAmount      float64 `json:"order_amount"`
	OrderCurrency    string  `json:"order_currency"`
	OrderStatus      string  `json:"order_status"` // ACTIVE | PAID | EXPIRED
	PaymentSessionID string  `json:"payment_session_id"`
}

// Payment is one entry of GET /pg/orders/{id}/payments.
type Payment struct {
	CFPaymentID   cfID            `json:"cf_payment_id"`
	PaymentStatus string          `json:"payment_status"` // SUCCESS | FAILED | PENDING | ...
	PaymentAmount float64         `json:"payment_amount"`
	PaymentMethod json.RawMessage `json:"payment_method"`
}

// cfID unmarshals Cashfree numeric IDs, which the API returns as JSON
// strings (e.g. "cf_order_id":"1472630771563159552") — accept numbers too.
type cfID string

func (v *cfID) UnmarshalJSON(b []byte) error {
	s := string(b)
	if s == "" || s == "null" {
		return nil
	}
	if b[0] == '"' {
		return json.Unmarshal(b, (*string)(v))
	}
	var n json.Number
	if err := json.Unmarshal(b, &n); err != nil {
		return err
	}
	*v = cfID(n.String())
	return nil
}

// apiError surfaces Cashfree's error body for logging/debugging.
type apiError struct {
	Status  int
	Message string
	Code    string
	Raw     string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("cashfree api error %d: %s (%s)", e.Status, e.Message, e.Code)
}

func (c *Client) do(ctx context.Context, method, path string, body interface{}, out interface{}) error {
	if !c.Enabled() {
		return ErrNotConfigured
	}
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-client-id", c.appID)
	req.Header.Set("x-client-secret", c.secretKey)
	req.Header.Set("x-api-version", apiVersion)

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		ae := &apiError{Status: res.StatusCode, Raw: string(raw)}
		var parsed struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		}
		if json.Unmarshal(raw, &parsed) == nil {
			ae.Message, ae.Code = parsed.Message, parsed.Code
		}
		if ae.Message == "" {
			ae.Message = res.Status
		}
		return ae
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

// CreateOrder creates a payment order and returns the Cashfree order
// (containing the payment_session_id used by the checkout SDK).
func (c *Client) CreateOrder(ctx context.Context, req *CreateOrderRequest) (*Order, error) {
	var out Order
	if err := c.do(ctx, http.MethodPost, "/orders", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetOrder fetches the order's current status.
func (c *Client) GetOrder(ctx context.Context, orderID string) (*Order, error) {
	var out Order
	if err := c.do(ctx, http.MethodGet, "/orders/"+orderID, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetOrderPayments lists payment attempts for an order (empty until the
// customer starts a payment attempt).
func (c *Client) GetOrderPayments(ctx context.Context, orderID string) ([]Payment, error) {
	var out []Payment
	if err := c.do(ctx, http.MethodGet, "/orders/"+orderID+"/payments", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// SuccessfulPayment returns the first SUCCESS payment attempt, or nil.
func SuccessfulPayment(payments []Payment) *Payment {
	for i := range payments {
		if strings.EqualFold(payments[i].PaymentStatus, "SUCCESS") {
			return &payments[i]
		}
	}
	return nil
}

// VerifyWebhookSignature validates the x-webhook-signature header:
// Base64(HMAC-SHA256(timestamp + rawBody, secretKey)).
func (c *Client) VerifyWebhookSignature(rawBody []byte, timestamp, signature string) bool {
	if !c.Enabled() || timestamp == "" || signature == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(c.secretKey))
	mac.Write([]byte(timestamp))
	mac.Write(rawBody)
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
