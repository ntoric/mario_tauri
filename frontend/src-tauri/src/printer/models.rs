use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub printer_type: String, // "usb", "bluetooth", "network"
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "vendor_id")]
    pub vendor_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "product_id")]
    pub product_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>, // MAC address for Bluetooth, IP for Network
    #[serde(rename = "paper_width")]
    pub paper_width: String, // "2inch" or "3inch"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Store {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "gst_number")]
    pub gst_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "fssai_lic_no")]
    pub fssai_lic_no: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mobile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hsn: Option<String>,
    pub qty: f64,
    pub unit: String,
    pub rate: f64,
    #[serde(rename = "tax_percent")]
    pub tax_percent: f64,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    #[serde(rename = "sub_total")]
    pub sub_total: f64,
    pub discount: f64,
    pub taxable: f64,
    pub cgst: f64,
    pub sgst: f64,
    #[serde(rename = "grand_total")]
    pub grand_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payment {
    pub cash: f64,
    pub card: f64,
    pub balance: f64,
    #[serde(rename = "upi")]
    pub upi: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QR {
    pub description: String,
    pub value: String,
    pub size: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub store: Store,
    pub customer: Customer,
    #[serde(rename = "invoice_no")]
    pub invoice_no: String,
    #[serde(rename = "bill_no")]
    pub bill_no: String,
    pub date: String,
    #[serde(rename = "payment_mode")]
    pub payment_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "dr_ref")]
    pub dr_ref: Option<String>,
    pub items: Vec<Item>,
    pub summary: Summary,
    pub payment: Payment,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qr: Option<QR>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KOT {
    #[serde(rename = "order_id")]
    pub order_id: u32,
    #[serde(rename = "table_number")]
    pub table_number: String,
    #[serde(rename = "waiter_name")]
    pub waiter_name: String,
    pub date: String,
    pub items: Vec<Item>,
    pub notes: String,
    #[serde(rename = "order_type")]
    pub order_type: String, // DINE_IN or TAKE_AWAY
    #[serde(rename = "customer_name")]
    pub customer_name: String,
    #[serde(rename = "customer_mobile")]
    pub customer_mobile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintJob {
    #[serde(rename = "type")]
    pub job_type: String, // "invoice", "kot"
    pub printer: PrinterConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invoice: Option<Invoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kot: Option<KOT>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub name: String,
    #[serde(rename = "type")]
    pub device_type: String, // "USB", "Bluetooth"
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "vendor_id")]
    pub vendor_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "product_id")]
    pub product_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawPrintRequest {
    #[serde(rename = "printerName")]
    pub printer_name: String,
    pub data: String, // Base64 encoded bytes
}
