mod printer;

use serde::{Deserialize, Serialize};
use printer::{PrinterService, USBPrinterService, PrintJob, Device, RawPrintRequest};
use base64::{Engine as _, engine::general_purpose};
use rusb::UsbContext;

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
    let service = USBPrinterService::new();
    let devices = service.detect_printers()?;
    Ok(devices)
}

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

        // Check interfaces
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

#[tauri::command]
async fn print_job(print_data: serde_json::Value) -> Result<String, String> {
    // Try to parse as PrintJob first
    if let Ok(job) = serde_json::from_value::<PrintJob>(print_data.clone()) {
        println!("Received PrintJob for {}, type: {}", job.printer.name.as_ref().unwrap_or(&"unknown".to_string()), job.job_type);
        
        let service = USBPrinterService::new();
        let printer_name = job.printer.name.clone().unwrap_or_else(|| "default".to_string());
        
        // Render the print job to ESC/POS bytes
        let data = printer::render_print_job(&job)
            .map_err(|e| format!("Failed to render print job: {}", e))?;
        
        // Print the data
        service.print(&printer_name, &data)
            .map_err(|e| format!("Printing failed: {}", e))?;
        
        Ok("Printed successfully".to_string())
    }
    // Fallback to RawPrintRequest for backward compatibility
    else if let Ok(req) = serde_json::from_value::<RawPrintRequest>(print_data) {
        println!("Received raw print job for {}, length: {}", req.printer_name, req.data.len());
        
        // Decode base64 data
        let data = general_purpose::STANDARD
            .decode(&req.data)
            .map_err(|e| format!("Failed to decode base64 data: {}", e))?;
        
        let service = USBPrinterService::new();
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
        .invoke_handler(tauri::generate_handler![
            get_printer_status,
            get_printers,
            print_job,
            debug_usb_devices
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
