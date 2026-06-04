package printer

import (
	"fmt"
	"strings"
)

func RenderPrintJob(job PrintJob) ([]byte, error) {
	if job.Type == "invoice" && job.Invoice != nil {
		return RenderInvoice(*job.Invoice, job.Printer.PaperWidth), nil
	}
	if job.Type == "kot" && job.KOT != nil {
		return RenderKOT(*job.KOT, job.Printer.PaperWidth), nil
	}
	return nil, fmt.Errorf("invalid job type or missing data")
}

func RenderInvoice(invoice Invoice, width string) []byte {
	initialize := []byte{0x1B, 0x40}
	alignLeft := []byte{0x1B, 0x61, 0x00}
	alignCenter := []byte{0x1B, 0x61, 0x01}
	alignRight := []byte{0x1B, 0x61, 0x02}
	boldOn := []byte{0x1B, 0x45, 0x01}
	boldOff := []byte{0x1B, 0x45, 0x00}
	doubleSize := []byte{0x1D, 0x21, 0x11}
	normalSize := []byte{0x1D, 0x21, 0x00}
	underlineOn := []byte{0x1B, 0x2D, 0x02}
	underlineOff := []byte{0x1B, 0x2D, 0x00}
	cutPaper := []byte{0x1D, 0x56, 0x41, 0x10}

	lineWidth := GetLineWidth(width)
	var data []byte

	data = append(data, initialize...)

	// HEADER
	data = append(data, alignCenter...)
	data = append(data, boldOn...)
	data = append(data, doubleSize...)
	
	effectiveWidth := lineWidth / 2
	nameLines := WrapText(invoice.Store.Name, effectiveWidth)
	for _, line := range nameLines {
		data = append(data, []byte(line+"\n")...)
	}
	
	data = append(data, normalSize...)
	data = append(data, boldOff...)

	if invoice.Store.Branch != "" {
		data = append(data, []byte(invoice.Store.Branch+"\n")...)
	}
	if invoice.Store.Location != "" {
		data = append(data, []byte(invoice.Store.Location+"\n")...)
	}
	if invoice.Store.Phone != "" {
		data = append(data, []byte("MOB : "+invoice.Store.Phone+"\n")...)
	}
	if invoice.Store.GSTNumber != "" {
		data = append(data, []byte("GSTIN : "+invoice.Store.GSTNumber+"\n")...)
	}
	if invoice.Store.FSSAILicNo != "" {
		data = append(data, []byte("FSSAI LIC NO : "+invoice.Store.FSSAILicNo+"\n")...)
	}

	data = append(data, []byte("\n")...)
	data = append(data, boldOn...)
	data = append(data, underlineOn...)
	data = append(data, []byte("Retail Invoice\n")...)
	data = append(data, underlineOff...)
	data = append(data, boldOff...)
	data = append(data, []byte("\n")...)

	// INFO SECTION
	data = append(data, alignLeft...)
	data = append(data, []byte("Date : "+invoice.Date+"\n")...)
	if invoice.Customer.Name != "" && invoice.Customer.Name != "Guest" {
		data = append(data, []byte("Cust : "+invoice.Customer.Name+"\n")...)
	}
	if invoice.Customer.Mobile != "" {
		data = append(data, []byte("Mob  : "+invoice.Customer.Mobile+"\n")...)
	}
	if invoice.BillNo != "" {
		data = append(data, []byte("Bill No: "+invoice.BillNo+"\n")...)
	}
	if invoice.PaymentMode != "" {
		data = append(data, []byte("Payment Mode: "+invoice.PaymentMode+"\n")...)
	}
	if invoice.DrRef != "" {
		data = append(data, []byte("DR Ref : "+invoice.DrRef+"\n")...)
	}
	data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)

	// TABLE HEADER
	var header string
	if width == "2inch" {
		header = PadRight("Item", 16) + PadLeft("Qty", 6) + PadLeft("Amt", 10)
	} else {
		header = PadRight("Item", 24) + PadLeft("Qty", 12) + PadLeft("Amt", 12)
	}
	data = append(data, boldOn...)
	data = append(data, []byte(header+"\n")...)
	data = append(data, boldOff...)
	data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)

	// ITEMS
	for _, item := range invoice.Items {
		// Item Name in Bold
		data = append(data, boldOn...)
		nameLines := WrapText(item.Name, lineWidth)
		for _, line := range nameLines {
			data = append(data, []byte(line+"\n")...)
		}
		data = append(data, boldOff...)

		// Qty and Amt row
		var qtyAmtRow string
		if width == "2inch" {
			qtyAmtRow = strings.Repeat(" ", 16) + PadLeft(fmt.Sprintf("%.0f", item.Qty), 6) + PadLeft(Amount(item.Amount), 10)
		} else {
			qtyAmtRow = strings.Repeat(" ", 24) + PadLeft(fmt.Sprintf("%.0f", item.Qty), 12) + PadLeft(Amount(item.Amount), 12)
		}
		data = append(data, []byte(qtyAmtRow+"\n\n")...)
	}

	data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)

	// SUMMARY
	summaryLabelWidth := lineWidth - 15
	data = append(data, boldOn...)
	data = append(data, []byte(PadRight("Sub Total", summaryLabelWidth)+PadLeft(Amount(invoice.Summary.SubTotal), 15)+"\n")...)
	data = append(data, boldOff...)
	if invoice.Summary.Discount > 0 {
		data = append(data, []byte(PadRight("(-) Discount", summaryLabelWidth)+PadLeft(Amount(invoice.Summary.Discount), 15)+"\n")...)
	}
	data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)

	// TOTAL
	data = append(data, boldOn...)
	data = append(data, doubleSize...)
	
	totalVal := "Rs " + Amount(invoice.Summary.GrandTotal)
	// When doubleSize is on (0x11), each character takes 2 slots.
	// So we must halve the effective line width.
	doubleWidthLimit := lineWidth / 2
	totalRow := PadRight("TOTAL", doubleWidthLimit-len(totalVal)) + totalVal
	
	data = append(data, []byte(totalRow+"\n")...)
	data = append(data, normalSize...)
	data = append(data, boldOff...)
	data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)

	// PAYMENT DETAILS
	if invoice.Payment.UPI > 0 {
		data = append(data, []byte(PadRight("UPI :", summaryLabelWidth)+PadLeft("Rs "+Amount(invoice.Payment.UPI), 15)+"\n")...)
	}
	if invoice.Payment.Cash > 0 {
		data = append(data, []byte(PadRight("Cash tendered:", summaryLabelWidth)+PadLeft("Rs "+Amount(invoice.Payment.Cash), 15)+"\n")...)
	}

	// QR CODE (Only if requested and has value)
	if invoice.QR != nil && invoice.QR.Value != "" {
		data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)
		if invoice.QR.Description != "" {
			data = append(data, alignCenter...)
			data = append(data, []byte(invoice.QR.Description+"\n\n")...)
		}
		data = append(data, QRCode(invoice.QR.Value, invoice.QR.Size)...)
	}

	// FOOTER
	if len(invoice.Footer) > 0 {
		data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)
		data = append(data, alignCenter...)
		for _, line := range invoice.Footer {
			wrapped := WrapText(line, lineWidth)
			for _, l := range wrapped {
				data = append(data, []byte(l+"\n")...)
			}
		}
	}

	// E & O.E
	data = append(data, alignRight...)
	data = append(data, []byte("E & O.E\n")...)

	data = append(data, []byte("\n\n\n")...)
	data = append(data, cutPaper...)

	return data
}

func RenderKOT(kot KOT, width string) []byte {
	initialize := []byte{0x1B, 0x40}
	alignLeft := []byte{0x1B, 0x61, 0x00}
	alignCenter := []byte{0x1B, 0x61, 0x01}
	boldOn := []byte{0x1B, 0x45, 0x01}
	boldOff := []byte{0x1B, 0x45, 0x00}
	doubleSize := []byte{0x1D, 0x21, 0x11}
	normalSize := []byte{0x1D, 0x21, 0x00}
	cutPaper := []byte{0x1D, 0x56, 0x41, 0x10}

	lineWidth := GetLineWidth(width)
	var data []byte

	data = append(data, initialize...)
	data = append(data, alignCenter...)
	data = append(data, boldOn...)
	data = append(data, doubleSize...)
	data = append(data, []byte("KITCHEN ORDER\n")...)
	data = append(data, normalSize...)
	data = append(data, boldOff...)
	data = append(data, []byte("\n")...)

	data = append(data, alignLeft...)
	data = append(data, []byte(fmt.Sprintf("Order #%d\n", kot.OrderID))...)
	data = append(data, []byte(fmt.Sprintf("Type: %s\n", kot.OrderType))...)
	if kot.TableNumber != "" && kot.TableNumber != "Take Away" {
		data = append(data, []byte(fmt.Sprintf("Table: %s\n", kot.TableNumber))...)
	}
	if kot.CustomerName != "" && kot.CustomerName != "Guest" {
		data = append(data, []byte(fmt.Sprintf("Cust : %s\n", kot.CustomerName))...)
	}
	if kot.CustomerMobile != "" {
		data = append(data, []byte(fmt.Sprintf("Mob  : %s\n", kot.CustomerMobile))...)
	}
	data = append(data, []byte(fmt.Sprintf("Date: %s\n", kot.Date))...)
	if kot.WaiterName != "" {
		data = append(data, []byte(fmt.Sprintf("Waiter: %s\n", kot.WaiterName))...)
	}
	data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)

	// ITEMS
	for _, item := range kot.Items {
		data = append(data, boldOn...)
		data = append(data, []byte(fmt.Sprintf("%-3.0f x %s\n", item.Qty, item.Name))...)
		data = append(data, boldOff...)
	}

	if kot.Notes != "" {
		data = append(data, []byte(strings.Repeat("-", lineWidth)+"\n")...)
		data = append(data, []byte("NOTES:\n")...)
		data = append(data, []byte(kot.Notes+"\n")...)
	}

	data = append(data, []byte("\n\n\n")...)
	data = append(data, cutPaper...)

	return data
}
