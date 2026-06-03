use crate::printer::models::Device as PrinterDevice;
use crate::printer::PrinterService;
use rusb::UsbContext;
use std::process::Command;
use std::str;

pub struct USBPrinterService;

impl USBPrinterService {
    pub fn new() -> Self {
        USBPrinterService
    }
}

impl PrinterService for USBPrinterService {
    fn print(&self, printer_name: &str, data: &[u8]) -> Result<(), String> {
        println!("USB Printing - Printer: {}, Data Length: {} bytes", printer_name, data.len());

        // 1. Check if the printer matches a CUPS system printer queue (highly robust on macOS)
        if let Ok(sys_printers) = detect_system_printers() {
            let mut target_system_name: Option<String> = None;
            for p in &sys_printers {
                if p.name.eq_ignore_ascii_case(printer_name) 
                    || p.name.to_lowercase().contains(&printer_name.to_lowercase()) {
                    target_system_name = Some(p.name.clone());
                    break;
                }
            }

            if let Some(name) = target_system_name {
                println!("Detected CUPS System printer queue '{}'. Printing raw ESC/POS via lp command...", name);
                return print_cups(&name, data);
            }
        }

        // 2. Fallback: Try raw direct USB writing via rusb if not matched in system print queues
        let devices = detect_usb_printers()
            .map_err(|e| format!("Failed to detect USB printers: {}", e))?;

        let mut target_device: Option<(String, String)> = None;
        for dev in &devices {
            if dev.name.eq_ignore_ascii_case(printer_name) {
                target_device = Some((
                    dev.vendor_id.clone().unwrap_or_default(),
                    dev.product_id.clone().unwrap_or_default()
                ));
                break;
            }
        }

        // If exact name match fails, try partial match
        if target_device.is_none() {
            for dev in &devices {
                if dev.name.to_lowercase().contains(&printer_name.to_lowercase()) {
                    target_device = Some((
                        dev.vendor_id.clone().unwrap_or_default(),
                        dev.product_id.clone().unwrap_or_default()
                    ));
                    break;
                }
            }
        }

        if let Some((vendor_id, product_id)) = target_device {
            print_usb_direct(&vendor_id, &product_id, data)
        } else {
            Err(format!("Printer '{}' not found via CUPS or USB direct", printer_name))
        }
    }

    fn detect_printers(&self) -> Result<Vec<PrinterDevice>, String> {
        let mut devices = Vec::new();

        // First, try to detect system printers (CUPS)
        if let Ok(sys_printers) = detect_system_printers() {
            devices.extend(sys_printers);
        }

        // Then, detect USB printers
        let usb_printers = detect_usb_printers()?;
        devices.extend(usb_printers);

        Ok(devices)
    }
}

fn detect_system_printers() -> Result<Vec<PrinterDevice>, String> {
    let output = Command::new("lpstat")
        .arg("-a")
        .output()
        .map_err(|e| format!("Failed to execute lpstat: {}", e))?;

    let stdout = str::from_utf8(&output.stdout)
        .map_err(|e| format!("Failed to parse lpstat output: {}", e))?;

    let mut devices = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if !parts.is_empty() {
            devices.push(PrinterDevice {
                name: parts[0].to_string(),
                device_type: "System".to_string(),
                vendor_id: None,
                product_id: None,
                address: None,
            });
        }
    }

    Ok(devices)
}

fn detect_usb_printers() -> Result<Vec<PrinterDevice>, String> {
    let context = rusb::Context::new()
        .map_err(|e| format!("Failed to create USB context: {}", e))?;

    let mut devices = Vec::new();

    let devices_iter = context.devices()
        .map_err(|e| format!("Failed to list USB devices: {}", e))?;

    for device in devices_iter.iter() {
        let device_desc = device.device_descriptor()
            .map_err(|e| format!("Failed to get device descriptor: {}", e))?;

        let mut is_printer = false;
        let mut name = format!("USB Device {:04x}:{:04x}", device_desc.vendor_id(), device_desc.product_id());

        // Known printer names mapping (VID, PID) -> Name
        let known_printers = vec![
            (0x04b8, 0x0202, "Epson TM-T88"),
            (0x04b8, 0x0e15, "Epson TM-T88III"),
            (0x04b8, 0x0e11, "Epson TM-T88II"),
            (0x0dd4, 0x01a5, "Star Micronics TSP143"),
            (0x0519, 0x0003, "Star Micronics Printer"),
            (0x0416, 0x5011, "Samsung Printer"),
            (0x0456, 0x0208, "HP Printer"),
            (0x03f0, 0x3b2a, "HP Printer"),
            (0x0456, 0x0808, "HP Portable Printer"),
        ];

        // Check if this is a known printer
        for (vid, pid, printer_name) in &known_printers {
            if device_desc.vendor_id() == *vid && device_desc.product_id() == *pid {
                is_printer = true;
                name = printer_name.to_string();
                break;
            }
        }

        // Check device class (0x07 = Printer)
        if device_desc.class_code() == 0x07 {
            is_printer = true;
        }

        // Check interface classes for printer (more reliable than device class)
        if let Ok(config_desc) = device.config_descriptor(0) {
            for interface in config_desc.interfaces() {
                for interface_desc in interface.descriptors() {
                    if interface_desc.class_code() == 0x07 {
                        is_printer = true;
                    }
                    // Also check for vendor-specific interfaces that might be printers
                    if interface_desc.class_code() == 0xFF {
                        // Some printers use vendor-specific class
                        // For now, we'll rely on known VID/PID pairs instead
                    }
                }
            }
        }

        if is_printer {
            devices.push(PrinterDevice {
                name,
                device_type: "USB".to_string(),
                vendor_id: Some(format!("0x{:04x}", device_desc.vendor_id())),
                product_id: Some(format!("0x{:04x}", device_desc.product_id())),
                address: None,
            });
        }
    }

    Ok(devices)
}

fn print_cups(printer_name: &str, data: &[u8]) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;

    // Create temporary binary file
    let mut tmp_file = std::env::temp_dir();
    tmp_file.push(format!("mario-print-{}.bin", std::process::id()));

    let mut file = File::create(&tmp_file)
        .map_err(|e| format!("Failed to create temporary print file: {}", e))?;

    file.write_all(data)
        .map_err(|e| format!("Failed to write to temporary print file: {}", e))?;

    // Execute CUPS raw print command: lp -d <printerName> -o raw <tempFile>
    let output = Command::new("lp")
        .arg("-d")
        .arg(printer_name)
        .arg("-o")
        .arg("raw")
        .arg(&tmp_file)
        .output()
        .map_err(|e| format!("Failed to execute lp command: {}", e))?;

    if output.status.success() {
        println!("Successfully printed to CUPS system printer '{}'", printer_name);
        Ok(())
    } else {
        let stderr = str::from_utf8(&output.stderr).unwrap_or("Unknown error");
        Err(format!("lp CUPS printing failed: {}", stderr))
    }
}

fn print_usb_direct(vendor_id: &str, product_id: &str, data: &[u8]) -> Result<(), String> {
    let context = rusb::Context::new()
        .map_err(|e| format!("Failed to create USB context: {}", e))?;

    let vid = u16::from_str_radix(vendor_id.trim_start_matches("0x"), 16)
        .map_err(|e| format!("Invalid vendor ID: {}", e))?;
    let pid = u16::from_str_radix(product_id.trim_start_matches("0x"), 16)
        .map_err(|e| format!("Invalid product ID: {}", e))?;

    let devices = context.devices()
        .map_err(|e| format!("Failed to list USB devices: {}", e))?;

    let mut device_handle: Option<rusb::Device<rusb::Context>> = None;

    for device in devices.iter() {
        let device_desc = device.device_descriptor()
            .map_err(|e| format!("Failed to get device descriptor: {}", e))?;

        if device_desc.vendor_id() == vid && device_desc.product_id() == pid {
            device_handle = Some(device);
            break;
        }
    }

    let device = device_handle
        .ok_or_else(|| format!("Printer not found (VID:{} PID:{})", vendor_id, product_id))?;

    let handle = device.open()
        .map_err(|e| format!("Failed to open USB device: {}", e))?;

    // Claim the default configuration
    let config_desc = device.config_descriptor(0)
        .map_err(|e| format!("Failed to get config descriptor: {}", e))?;

    handle.set_active_configuration(1)
        .map_err(|e| format!("Failed to set active configuration: {}", e))?;

    // Claim the interface
    let interface_num = config_desc.interfaces().next()
        .map(|iface| iface.number())
        .ok_or_else(|| "No interface found".to_string())?;

    handle.claim_interface(interface_num)
        .map_err(|e| format!("Failed to claim interface: {}", e))?;

    // Find the OUT endpoint
    let interface_desc = config_desc.interfaces()
        .next()
        .and_then(|iface| iface.descriptors().next())
        .ok_or_else(|| "No interface descriptor found".to_string())?;

    let endpoint = interface_desc.endpoint_descriptors()
        .find(|ep| ep.direction() == rusb::Direction::Out)
        .ok_or_else(|| "No OUT endpoint found".to_string())?;

    // Send to printer
    let mut written = 0;
    let chunk_size = endpoint.max_packet_size() as usize;
    
    while written < data.len() {
        let end = std::cmp::min(written + chunk_size, data.len());
        let chunk = &data[written..end];
        
        let n = handle.write_bulk(endpoint.address(), chunk, std::time::Duration::from_secs(5))
            .map_err(|e| format!("Failed to write to USB endpoint: {}", e))?;
        
        written += n;
    }

    println!("Successfully wrote {} bytes to USB printer", written);
    Ok(())
}
