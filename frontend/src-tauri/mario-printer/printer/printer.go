package printer

import (
	"fmt"
	"strings"
	"time"

	"tinygo.org/x/bluetooth"
)

var adapter = bluetooth.DefaultAdapter

// Print is the legacy entry point for printing invoices.
// It will be updated to use the new PrinterService abstraction in the future if needed.
func Print(job PrintJob) error {
	switch strings.ToLower(job.Printer.Type) {
	case "bluetooth":
		return printBluetooth(job)
	case "usb", "system", "":
		// For legacy calls or system printers, we use the PrinterService abstraction.
		svc := GetPrinterService()
		data, err := RenderPrintJob(job)
		if err != nil {
			return err
		}
		return svc.Print(job.Printer.Name, data)
	default:
		return fmt.Errorf("unsupported printer type: %s", job.Printer.Type)
	}
}

func printBluetooth(job PrintJob) error {
	if err := adapter.Enable(); err != nil {
		return fmt.Errorf("failed to enable bluetooth adapter: %v", err)
	}

	var addr bluetooth.Address
	addr.Set(job.Printer.Address)

	device, err := adapter.Connect(addr, bluetooth.ConnectionParams{})
	if err != nil {
		return fmt.Errorf("failed to connect to bluetooth printer: %v", err)
	}
	defer device.Disconnect()

	services, err := device.DiscoverServices(nil)
	if err != nil {
		return fmt.Errorf("failed to discover services: %v", err)
	}

	var writeChar *bluetooth.DeviceCharacteristic
	for _, service := range services {
		chars, err := service.DiscoverCharacteristics(nil)
		if err != nil {
			continue
		}
		for _, char := range chars {
			writeChar = &char
			break
		}
		if writeChar != nil {
			break
		}
	}

	if writeChar == nil {
		return fmt.Errorf("no writeable characteristic found on bluetooth printer")
	}

	data, err := RenderPrintJob(job)
	if err != nil {
		return fmt.Errorf("rendering failed: %v", err)
	}

	mtu, _ := writeChar.GetMTU()
	if mtu == 0 {
		mtu = 20
	}

	chunkSize := int(mtu) - 3
	for i := 0; i < len(data); i += chunkSize {
		end := i + chunkSize
		if end > len(data) {
			end = len(data)
		}
		_, err = writeChar.WriteWithoutResponse(data[i:end])
		if err != nil {
			return fmt.Errorf("failed to write to bluetooth printer: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}

	return nil
}

func DetectPrinters() ([]Device, error) {
	var devices []Device

	// 1. Detect USB Printers (Platform-specific implementation)
	usbDevices, err := detectUSBPrinters()
	if err == nil {
		devices = append(devices, usbDevices...)
	}

	// 2. Detect Bluetooth Printers
	btDevices, err := detectBluetoothPrinters()
	if err == nil {
		devices = append(devices, btDevices...)
	}

	// 3. Detect System Printers
	systemDevices, err := detectSystemPrinters()
	if err == nil {
		devices = append(devices, systemDevices...)
	}

	return devices, nil
}

func detectBluetoothPrinters() ([]Device, error) {
	if err := adapter.Enable(); err != nil {
		return nil, err
	}

	var devices []Device
	foundAddresses := make(map[string]bool)

	err := adapter.Scan(func(adapter *bluetooth.Adapter, device bluetooth.ScanResult) {
		name := device.LocalName()
		if name == "" {
			name = "Unknown BT Device"
		}

		lowerName := strings.ToLower(name)
		if strings.Contains(lowerName, "printer") || 
		   strings.Contains(lowerName, "pos") || 
		   strings.Contains(lowerName, "thermal") || 
		   strings.Contains(lowerName, "mpt") ||
		   strings.Contains(lowerName, "receipt") {
			addr := device.Address.String()
			if !foundAddresses[addr] {
				foundAddresses[addr] = true
				devices = append(devices, Device{
					Name:    name,
					Type:    "Bluetooth",
					Address: addr,
				})
			}
		}
	})

	if err != nil {
		return nil, err
	}

	go func() {
		time.Sleep(5 * time.Second)
		adapter.StopScan()
	}()

	time.Sleep(6 * time.Second)

	return devices, nil
}
