package main

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"mario-printer/printer"
)

// IPCRequest represents a command received from the Tauri host over stdin.
type IPCRequest struct {
	Command string          `json:"command"` // "status", "printers", "print"
	Payload json.RawMessage `json:"payload,omitempty"`
}

// IPCResponse represents a response sent back to the Tauri host over stdout.
type IPCResponse struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data,omitempty"`
	Error   string          `json:"error,omitempty"`
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	// Allow large payloads (e.g. base64 print data)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req IPCRequest
		if err := json.Unmarshal(line, &req); err != nil {
			writeResponse(IPCResponse{Error: "Invalid JSON: " + err.Error()})
			continue
		}

		switch req.Command {
		case "status":
			data, _ := json.Marshal(map[string]string{
				"status": "online",
				"system": "Mario Printer Service (Go)",
			})
			writeResponse(IPCResponse{Success: true, Data: data})

		case "printers":
			devices, err := printer.DetectPrinters()
			if err != nil {
				writeResponse(IPCResponse{Error: "Failed to detect printers: " + err.Error()})
				continue
			}
			data, _ := json.Marshal(devices)
			writeResponse(IPCResponse{Success: true, Data: data})

		case "print":
			handlePrint(req.Payload)

		default:
			writeResponse(IPCResponse{Error: fmt.Sprintf("Unknown command: %s", req.Command)})
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "stdin read error: %v\n", err)
		os.Exit(1)
	}
}

func handlePrint(payload json.RawMessage) {
	// Try to parse as PrintJob first
	var job printer.PrintJob
	if err := json.Unmarshal(payload, &job); err == nil && job.Type != "" {
		fmt.Fprintf(os.Stderr, "Received PrintJob for %s, type: %s\n", job.Printer.Name, job.Type)
		if err := printer.Print(job); err != nil {
			writeResponse(IPCResponse{Error: "Printing failed: " + err.Error()})
			return
		}
		data, _ := json.Marshal(map[string]string{"message": "Printed successfully"})
		writeResponse(IPCResponse{Success: true, Data: data})
		return
	}

	// Fallback to RawPrintRequest
	var req printer.RawPrintRequest
	if err := json.Unmarshal(payload, &req); err == nil && req.PrinterName != "" {
		decoded, err := base64.StdEncoding.DecodeString(req.Data)
		if err != nil {
			writeResponse(IPCResponse{Error: "Failed to decode base64 data: " + err.Error()})
			return
		}
		fmt.Fprintf(os.Stderr, "Received raw print job for %s, length: %d\n", req.PrinterName, len(decoded))
		svc := printer.GetPrinterService()
		if err := svc.Print(req.PrinterName, decoded); err != nil {
			writeResponse(IPCResponse{Error: "Printing failed: " + err.Error()})
			return
		}
		data, _ := json.Marshal(map[string]string{"message": "Printed successfully"})
		writeResponse(IPCResponse{Success: true, Data: data})
		return
	}

	writeResponse(IPCResponse{Error: "Invalid payload. Expected PrintJob or RawPrintRequest JSON."})
}

func writeResponse(resp IPCResponse) {
	data, _ := json.Marshal(resp)
	fmt.Println(string(data))
}
