pub mod models;
pub mod renderer;
pub mod utils;

// Native Rust printer services (used when "go-printer" feature is NOT enabled)
#[cfg(all(not(feature = "go-printer"), not(target_os = "windows")))]
pub mod service;
#[cfg(all(not(feature = "go-printer"), target_os = "windows"))]
pub mod service_windows;

// Go sidecar printer service (used when "go-printer" feature IS enabled)
#[cfg(feature = "go-printer")]
pub mod service_go;

use models::Device as PrinterDevice;

pub use models::*;
pub use renderer::*;

/// Cross-platform trait for printing operations.
pub trait PrinterService {
    fn print(&self, printer_name: &str, data: &[u8]) -> Result<(), String>;
    fn detect_printers(&self) -> Result<Vec<PrinterDevice>, String>;
}

#[cfg(all(not(feature = "go-printer"), not(target_os = "windows")))]
pub use service::USBPrinterService;
#[cfg(all(not(feature = "go-printer"), target_os = "windows"))]
pub use service_windows::WindowsPrinterService;
#[cfg(feature = "go-printer")]
pub use service_go::GoPrinterService;
