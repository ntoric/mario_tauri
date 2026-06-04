mod printer;

use serde::{Deserialize, Serialize};
use printer::{PrinterService, PrintJob, Device, RawPrintRequest};
use base64::{Engine as _, engine::general_purpose};

// Native Rust printer imports (no go-printer feature)
#[cfg(all(not(feature = "go-printer"), not(target_os = "windows")))]
use printer::USBPrinterService;
#[cfg(all(not(feature = "go-printer"), not(target_os = "windows")))]
use rusb::UsbContext;
#[cfg(all(not(feature = "go-printer"), target_os = "windows"))]
use printer::WindowsPrinterService;

// Go sidecar printer import
#[cfg(feature = "go-printer")]
use printer::GoPrinterService;

/// Create the platform-appropriate printer service.
fn create_printer_service() -> Box<dyn PrinterService + Send + Sync> {
    #[cfg(feature = "go-printer")]
    {
        Box::new(GoPrinterService::new())
    }
    #[cfg(all(not(feature = "go-printer"), not(target_os = "windows")))]
    {
        Box::new(USBPrinterService::new())
    }
    #[cfg(all(not(feature = "go-printer"), target_os = "windows"))]
    {
        Box::new(WindowsPrinterService::new())
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct PrinterStatus {
    status: String,
    system: String,
}

#[tauri::command]
async fn get_printer_status() -> Result<PrinterStatus, String> {
    Ok(PrinterStatus {
        status: "online".to_string(),
        system: "Mario Printer Service".to_string(),
    })
}

#[tauri::command]
async fn get_printers() -> Result<Vec<Device>, String> {
    let service = create_printer_service();
    let devices = service.detect_printers()?;
    Ok(devices)
}

#[cfg(all(not(feature = "go-printer"), not(target_os = "windows")))]
#[tauri::command]
async fn debug_usb_devices() -> Result<String, String> {
    let context = rusb::Context::new()
        .map_err(|e| format!("Failed to create USB context: {}", e))?;

    let devices_iter = context.devices()
        .map_err(|e| format!("Failed to list USB devices: {}", e))?;

    let mut output = String::new();
    output.push_str("All USB Devices:\n");
    output.push_str("================\n");

    for device in devices_iter.iter() {
        let device_desc = device.device_descriptor()
            .map_err(|e| format!("Failed to get device descriptor: {}", e))?;

        output.push_str(&format!("VID: {:04x}, PID: {:04x}, Class: {:02x}\n", 
            device_desc.vendor_id(), 
            device_desc.product_id(),
            device_desc.class_code()));

        if let Ok(config_desc) = device.config_descriptor(0) {
            for interface in config_desc.interfaces() {
                for interface_desc in interface.descriptors() {
                    output.push_str(&format!("  Interface Class: {:02x}\n", interface_desc.class_code()));
                }
            }
        }
        output.push_str("\n");
    }

    Ok(output)
}

#[cfg(any(feature = "go-printer", target_os = "windows"))]
#[tauri::command]
async fn debug_usb_devices() -> Result<String, String> {
    let service = create_printer_service();
    let devices = service.detect_printers()?;

    let mut output = String::new();
    output.push_str("Available Printers:\n");
    output.push_str("===================\n");
    for dev in &devices {
        output.push_str(&format!("Name: {}, Type: {}\n", dev.name, dev.device_type));
    }
    Ok(output)
}

#[tauri::command]
async fn save_csv_file(content: String, default_filename: String) -> Result<String, String> {
    // Fallback method - try to write to Downloads folder
    let mut path = dirs::download_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap());
    path.push(&default_filename);
    
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(format!("File saved to: {}", path.display()))
}

#[tauri::command]
async fn print_job(print_data: serde_json::Value) -> Result<String, String> {
    if let Ok(job) = serde_json::from_value::<PrintJob>(print_data.clone()) {
        println!("Received PrintJob for {}, type: {}", job.printer.name.as_ref().unwrap_or(&"unknown".to_string()), job.job_type);
        
        let service = create_printer_service();
        let printer_name = job.printer.name.clone().unwrap_or_else(|| "default".to_string());
        
        let data = printer::render_print_job(&job)
            .map_err(|e| format!("Failed to render print job: {}", e))?;
        
        service.print(&printer_name, &data)
            .map_err(|e| format!("Printing failed: {}", e))?;
        
        Ok("Printed successfully".to_string())
    }
    else if let Ok(req) = serde_json::from_value::<RawPrintRequest>(print_data) {
        println!("Received raw print job for {}, length: {}", req.printer_name, req.data.len());
        
        let data = general_purpose::STANDARD
            .decode(&req.data)
            .map_err(|e| format!("Failed to decode base64 data: {}", e))?;
        
        let service = create_printer_service();
        service.print(&req.printer_name, &data)
            .map_err(|e| format!("Printing failed: {}", e))?;
        
        Ok("Printed successfully".to_string())
    } else {
        Err("Invalid request format. Expected PrintJob or RawPrintRequest JSON.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_printer_status,
            get_printers,
            print_job,
            debug_usb_devices,
            save_csv_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
