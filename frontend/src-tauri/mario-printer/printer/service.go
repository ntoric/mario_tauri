package printer

// PrinterService defines the interface for printing operations.
type PrinterService interface {
	Print(printerName string, data []byte) error
}
