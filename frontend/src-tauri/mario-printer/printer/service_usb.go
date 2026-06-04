//go:build !windows
package printer

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/google/gousb"
)

type USBPrinterService struct{}

// GetPrinterService returns the USB-specific printing service.
func GetPrinterService() PrinterService {
	return &USBPrinterService{}
}

func (s *USBPrinterService) Print(printerName string, data []byte) error {
	log.Printf("USB Printing (Non-Windows) - Printer: %s, Data Length: %d bytes", printerName, len(data))

	// 1. Check if the printer matches a CUPS system printer queue (highly robust on macOS)
	sysPrinters, err := detectSystemPrinters()
	if err == nil {
		var isSystemPrinter bool
		var targetSystemName string
		for _, p := range sysPrinters {
			if strings.EqualFold(p.Name, printerName) || strings.Contains(strings.ToLower(p.Name), strings.ToLower(printerName)) {
				isSystemPrinter = true
				targetSystemName = p.Name
				break
			}
		}

		if isSystemPrinter {
			log.Printf("Detected CUPS System printer queue '%s'. Printing raw ESC/POS via lp command...", targetSystemName)
			return s.printCUPS(targetSystemName, data)
		}
	}

	// 2. Fallback: Try raw direct USB writing via gousb/libusb if not matched in system print queues
	devices, err := detectUSBPrinters()
	if err != nil {
		return fmt.Errorf("failed to detect USB printers: %v", err)
	}

	var targetDevice *Device
	for _, dev := range devices {
		if strings.EqualFold(dev.Name, printerName) {
			targetDevice = &dev
			break
		}
	}

	// If exact name match fails, try partial match
	if targetDevice == nil {
		for _, dev := range devices {
			if strings.Contains(strings.ToLower(dev.Name), strings.ToLower(printerName)) {
				targetDevice = &dev
				break
			}
		}
	}

	if targetDevice == nil {
		return fmt.Errorf("printer '%s' not found via CUPS or USB direct", printerName)
	}

	return s.printUSBDirect(targetDevice.VendorID, targetDevice.ProductID, data)
}

func (s *USBPrinterService) printCUPS(printerName string, data []byte) error {
	// Create temporary binary file
	tmpFile, err := os.CreateTemp("", "mario-print-*.bin")
	if err != nil {
		return fmt.Errorf("failed to create temporary print file: %v", err)
	}
	defer os.Remove(tmpFile.Name())

	// Write raw bytes to temporary file
	if _, err := tmpFile.Write(data); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to write to temporary print file: %v", err)
	}
	tmpFile.Close()

	// Execute CUPS raw print command: lp -d <printerName> -o raw <tempFile>
	cmd := exec.Command("lp", "-d", printerName, "-o", "raw", tmpFile.Name())
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("lp CUPS printing failed: %v, output: %s", err, string(output))
	}

	log.Printf("Successfully printed to CUPS system printer '%s'", printerName)
	return nil
}


func (s *USBPrinterService) printUSBDirect(vendorID, productID string, data []byte) error {
	ctx := gousb.NewContext()
	defer ctx.Close()

	dev, err := ctx.OpenDeviceWithVIDPID(
		hexToID(vendorID),
		hexToID(productID),
	)

	if err != nil {
		return err
	}

	if dev == nil {
		return fmt.Errorf("printer not found (VID:%s PID:%s)", vendorID, productID)
	}

	defer dev.Close()

	// Claim the default configuration
	cfg, err := dev.Config(1)
	if err != nil {
		return fmt.Errorf("failed to get config: %v", err)
	}
	defer cfg.Close()

	// Claim the interface
	intf, err := cfg.Interface(0, 0)
	if err != nil {
		return fmt.Errorf("failed to claim interface: %v", err)
	}
	defer intf.Close()

	// Find the OUT endpoint
	var ep *gousb.OutEndpoint
	for _, desc := range intf.Setting.Endpoints {
		if desc.Direction == gousb.EndpointDirectionOut {
			ep, err = intf.OutEndpoint(desc.Number)
			if err != nil {
				return fmt.Errorf("failed to open endpoint: %v", err)
			}
			break
		}
	}

	if ep == nil {
		return fmt.Errorf("no OUT endpoint found")
	}

	// Send to printer
	n, err := ep.Write(data)
	if err == nil {
		log.Printf("Successfully wrote %d bytes to USB printer", n)
	}
	return err
}

func hexToID(hex string) gousb.ID {
	hex = strings.ReplaceAll(hex, "0x", "")
	val, _ := strconv.ParseInt(hex, 16, 32)
	return gousb.ID(val)
}

func detectUSBPrinters() ([]Device, error) {
	ctx := gousb.NewContext()
	defer ctx.Close()

	var devices []Device

	ctx.OpenDevices(func(desc *gousb.DeviceDesc) bool {
		isPrinter := false
		for _, cfg := range desc.Configs {
			for _, intf := range cfg.Interfaces {
				for _, alt := range intf.AltSettings {
					if alt.Class == gousb.ClassPrinter {
						isPrinter = true
						break
					}
				}
			}
		}

		dev, err := ctx.OpenDeviceWithVIDPID(desc.Vendor, desc.Product)
		name := fmt.Sprintf("USB Device %s:%s", desc.Vendor, desc.Product)

		if err == nil && dev != nil {
			defer dev.Close()
			m, _ := dev.Manufacturer()
			p, _ := dev.Product()
			if m != "" || p != "" {
				name = strings.TrimSpace(m + " " + p)
				lowerName := strings.ToLower(name)
				if strings.Contains(lowerName, "printer") || 
				   strings.Contains(lowerName, "pos") || 
				   strings.Contains(lowerName, "thermal") ||
				   strings.Contains(lowerName, "label") ||
				   strings.Contains(lowerName, "receipt") {
					isPrinter = true
				}
			}
		}

		if isPrinter {
			devices = append(devices, Device{
				Name:      name,
				Type:      "USB",
				VendorID:  fmt.Sprintf("0x%s", desc.Vendor),
				ProductID: fmt.Sprintf("0x%s", desc.Product),
			})
		}

		return false
	})

	return devices, nil
}
func detectSystemPrinters() ([]Device, error) {
	var devices []Device
	out, err := exec.Command("lpstat", "-a").Output()
	if err != nil {
		return nil, err
	}

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Split(line, " ")
		if len(parts) > 0 {
			devices = append(devices, Device{
				Name: parts[0],
				Type: "System",
			})
		}
	}

	return devices, nil
}
