//go:build windows

package printer

import (
	"fmt"
	"log"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	winspool               = syscall.NewLazyDLL("winspool.drv")
	procOpenPrinter        = winspool.NewProc("OpenPrinterW")
	procStartDocPrinter    = winspool.NewProc("StartDocPrinterW")
	procStartPagePrinter   = winspool.NewProc("StartPagePrinter")
	procWritePrinter       = winspool.NewProc("WritePrinter")
	procEndPagePrinter     = winspool.NewProc("EndPagePrinter")
	procEndDocPrinter      = winspool.NewProc("EndDocPrinter")
	procClosePrinter       = winspool.NewProc("ClosePrinter")
	procEnumPrinters       = winspool.NewProc("EnumPrintersW")
	procGetPrinterDriver   = winspool.NewProc("GetPrinterDriverW")
	procGetDefaultPrinter  = winspool.NewProc("GetDefaultPrinterW")
)

type DOC_INFO_1 struct {
	DocName    *uint16
	OutputFile *uint16
	Datatype   *uint16
}

type PRINTER_INFO_5 struct {
	PrinterName              *uint16
	PortName                 *uint16
	Attributes               uint32
	DeviceNotSelectedTimeout uint32
	TransmissionRetryTimeout uint32
}

type DRIVER_INFO_8 struct {
	Version                  uint32
	Name                     *uint16
	Environment              *uint16
	DriverPath               *uint16
	DataFile                 *uint16
	ConfigFile               *uint16
	HelpFile                 *uint16
	DependentFiles           *uint16
	MonitorName              *uint16
	DefaultDataType          *uint16
	PreviousNames            *uint16
	DriverDate               syscall.Filetime
	DriverVersion            uint64
	MfgName                  *uint16
	OEMUrl                   *uint16
	HardwareID               *uint16
	Provider                 *uint16
	PrintProcessor           *uint16
	VendorSetup              *uint16
	ColorProfiles            *uint16
	InfPath                  *uint16
	PrinterDriverAttributes  uint32
	CoreDriverDependencies   *uint16
	MinInboxDriverVerDate    syscall.Filetime
	MinInboxDriverVerVersion uint32
}

const (
	PRINTER_ENUM_LOCAL       = 0x00000002
	PRINTER_ENUM_CONNECTIONS = 0x00000004
	PRINTER_DRIVER_XPS       = 0x00000002
)

type WindowsPrinterService struct{}

// GetPrinterService returns the Windows-specific printing service.
func GetPrinterService() PrinterService {
	return &WindowsPrinterService{}
}

func (s *WindowsPrinterService) Print(printerName string, data []byte) error {
	log.Printf("Windows Printing - Printer: %s, Data Length: %d bytes", printerName, len(data))

	var err error
	for i := 0; i < 3; i++ { // Retry mechanism
		err = s.printRaw(printerName, data)
		if err == nil {
			return nil
		}
		log.Printf("Print attempt %d failed: %v. Retrying in 1s...", i+1, err)
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("failed to print after 3 attempts: %v", err)
}

func (s *WindowsPrinterService) printRaw(printerName string, data []byte) error {
	if len(data) == 0 {
		return fmt.Errorf("no data to print")
	}

	pName, err := windows.UTF16PtrFromString(printerName)
	if err != nil {
		return fmt.Errorf("invalid printer name '%s': %v", printerName, err)
	}

	var hPrinter windows.Handle
	// PRINTER_DEFAULTS is set to 0 to use defaults
	ret, _, err := procOpenPrinter.Call(
		uintptr(unsafe.Pointer(pName)),
		uintptr(unsafe.Pointer(&hPrinter)),
		0,
	)
	if ret == 0 {
		if err != nil {
			return fmt.Errorf("OpenPrinter failed for '%s': %v", printerName, err)
		}
		return fmt.Errorf("OpenPrinter failed for '%s' (unknown error)", printerName)
	}
	defer procClosePrinter.Call(uintptr(hPrinter))

	// Determine data type (RAW vs XPS_PASS)
	dataTypeStr := "RAW"
	var needed uint32
	procGetPrinterDriver.Call(uintptr(hPrinter), 0, 8, 0, 0, uintptr(unsafe.Pointer(&needed)))
	if needed > 0 {
		buf := make([]byte, needed)
		ret, _, _ = procGetPrinterDriver.Call(uintptr(hPrinter), 0, 8, uintptr(unsafe.Pointer(&buf[0])), uintptr(needed), uintptr(unsafe.Pointer(&needed)))
		if ret != 0 {
			di := (*DRIVER_INFO_8)(unsafe.Pointer(&buf[0]))
			if di.PrinterDriverAttributes&PRINTER_DRIVER_XPS != 0 {
				dataTypeStr = "XPS_PASS"
				log.Printf("Detected XPS-based driver, using XPS_PASS data type")
			}
		}
	}

	docName, _ := windows.UTF16PtrFromString("Mario Print Job")
	dataType, _ := windows.UTF16PtrFromString(dataTypeStr)
	docInfo := DOC_INFO_1{
		DocName:    docName,
		OutputFile: nil,
		Datatype:   dataType,
	}

	ret, _, err = procStartDocPrinter.Call(
		uintptr(hPrinter),
		1,
		uintptr(unsafe.Pointer(&docInfo)),
	)
	if ret == 0 {
		return fmt.Errorf("StartDocPrinter failed: %v", err)
	}
	defer procEndDocPrinter.Call(uintptr(hPrinter))

	ret, _, err = procStartPagePrinter.Call(uintptr(hPrinter))
	if ret == 0 {
		return fmt.Errorf("StartPagePrinter failed: %v", err)
	}
	defer procEndPagePrinter.Call(uintptr(hPrinter))

	var written uint32
	ret, _, err = procWritePrinter.Call(
		uintptr(hPrinter),
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(uint32(len(data))),
		uintptr(unsafe.Pointer(&written)),
	)
	if ret == 0 {
		return fmt.Errorf("WritePrinter failed: %v", err)
	}

	log.Printf("Successfully wrote %d bytes to Windows printer '%s' (type: %s)", written, printerName, dataTypeStr)
	if written == 0 {
		return fmt.Errorf("WritePrinter returned 0 bytes written")
	}

	return nil
}

func detectUSBPrinters() ([]Device, error) {
	// USB direct access via gousb is disabled on Windows in favor of Winspool.
	return nil, nil
}

func detectSystemPrinters() ([]Device, error) {
	const flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
	var needed, returned uint32
	buf := make([]byte, 1)
	
	// First call to get required buffer size
	procEnumPrinters.Call(flags, 0, 5, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return nil, nil
	}
	
	buf = make([]byte, needed)
	ret, _, err := procEnumPrinters.Call(flags, 0, 5, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if ret == 0 {
		return nil, fmt.Errorf("EnumPrinters failed: %v", err)
	}
	
	if returned == 0 {
		return nil, nil
	}
	
	ps := (*[1024]PRINTER_INFO_5)(unsafe.Pointer(&buf[0]))[:returned:returned]
	var devices []Device
	for _, p := range ps {
		name := windows.UTF16PtrToString(p.PrinterName)
		devices = append(devices, Device{
			Name: name,
			Type: "System",
		})
	}
	
	return devices, nil
}
