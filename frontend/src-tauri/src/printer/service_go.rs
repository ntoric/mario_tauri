use crate::printer::models::Device as PrinterDevice;
use crate::printer::PrinterService;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// IPC request sent to the Go sidecar over stdin.
#[derive(Serialize)]
struct IPCRequest {
    command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
}

/// IPC response received from the Go sidecar over stdout.
#[derive(Deserialize)]
struct IPCResponse {
    success: bool,
    #[serde(default)]
    data: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<String>,
}

pub struct GoPrinterService {
    process: Mutex<Option<Child>>,
}

impl GoPrinterService {
    pub fn new() -> Self {
        GoPrinterService {
            process: Mutex::new(None),
        }
    }

    /// Resolve the path to the Go sidecar binary.
    fn sidecar_path() -> String {
        // Look for the sidecar binary in several locations:
        // 1. Next to the current executable (bundled with Tauri)
        // 2. In the src-tauri/mario-printer directory (dev mode)
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()));

        let candidates = vec![
            // Bundled sidecar (production)
            exe_dir
                .as_ref()
                .map(|d| d.join("mario-printer").to_string_lossy().to_string()),
            exe_dir
                .as_ref()
                .map(|d| d.join("mario-printer.exe").to_string_lossy().to_string()),
            // Development: compiled Go binary next to Tauri target
            Some("mario-printer".to_string()),
            Some("mario-printer.exe".to_string()),
        ];

        for candidate in candidates.into_iter().flatten() {
            if std::path::Path::new(&candidate).exists() {
                return candidate;
            }
        }

        // Default: assume it's on PATH
        "mario-printer".to_string()
    }

    fn ensure_running(&self) -> Result<(), String> {
        let mut guard = self.process.lock().map_err(|e| format!("Lock error: {}", e))?;

        // Check if the process is still alive
        if let Some(ref mut child) = *guard {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Process exited, need to restart
                    *guard = None;
                }
                Ok(None) => return Ok(()), // Still running
                Err(_) => {
                    *guard = None;
                }
            }
        }

        // Start the Go sidecar process
        let path = Self::sidecar_path();
        println!("Starting Go printer sidecar: {}", path);

        let child = Command::new(&path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Failed to start Go sidecar '{}': {}", path, e))?;

        *guard = Some(child);
        Ok(())
    }

    fn send_command(&self, request: &IPCRequest) -> Result<IPCResponse, String> {
        self.ensure_running()?;

        let mut guard = self.process.lock().map_err(|e| format!("Lock error: {}", e))?;
        let child = guard.as_mut().ok_or("Go sidecar not running")?;

        // Send request as a single JSON line to stdin
        let stdin = child.stdin.as_mut().ok_or("No stdin for sidecar")?;
        let json_line =
            serde_json::to_string(request).map_err(|e| format!("Serialize error: {}", e))?;
        writeln!(stdin, "{}", json_line).map_err(|e| format!("Write to sidecar failed: {}", e))?;
        stdin
            .flush()
            .map_err(|e| format!("Flush to sidecar failed: {}", e))?;

        // Read one JSON line from stdout
        let stdout = child.stdout.as_mut().ok_or("No stdout for sidecar")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| format!("Read from sidecar failed: {}", e))?;

        if line.trim().is_empty() {
            return Err("Empty response from Go sidecar".to_string());
        }

        let resp: IPCResponse = serde_json::from_str(line.trim())
            .map_err(|e| format!("Failed to parse sidecar response: {} (raw: {})", e, line.trim()))?;

        Ok(resp)
    }
}

impl PrinterService for GoPrinterService {
    fn print(&self, printer_name: &str, data: &[u8]) -> Result<(), String> {
        println!(
            "Go Sidecar Printing - Printer: {}, Data Length: {} bytes",
            printer_name,
            data.len()
        );

        // Encode data as base64 for the RawPrintRequest format
        use base64::{engine::general_purpose, Engine as _};
        let b64_data = general_purpose::STANDARD.encode(data);

        let payload = serde_json::json!({
            "printerName": printer_name,
            "data": b64_data
        });

        let request = IPCRequest {
            command: "print".to_string(),
            payload: Some(payload),
        };

        let resp = self.send_command(&request)?;

        if resp.success {
            Ok(())
        } else {
            Err(resp
                .error
                .unwrap_or_else(|| "Unknown error from Go sidecar".to_string()))
        }
    }

    fn detect_printers(&self) -> Result<Vec<PrinterDevice>, String> {
        let request = IPCRequest {
            command: "printers".to_string(),
            payload: None,
        };

        let resp = self.send_command(&request)?;

        if !resp.success {
            return Err(resp
                .error
                .unwrap_or_else(|| "Unknown error from Go sidecar".to_string()));
        }

        match resp.data {
            Some(data) => serde_json::from_value(data)
                .map_err(|e| format!("Failed to parse printer list: {}", e)),
            None => Ok(Vec::new()),
        }
    }
}

impl Drop for GoPrinterService {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.process.lock() {
            if let Some(ref mut child) = *guard {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}
