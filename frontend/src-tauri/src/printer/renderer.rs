use crate::printer::models::*;
use crate::printer::utils::*;

pub fn render_print_job(job: &PrintJob) -> Result<Vec<u8>, String> {
    match job.job_type.as_str() {
        "invoice" => {
            if let Some(invoice) = &job.invoice {
                Ok(render_invoice(invoice, &job.printer.paper_width))
            } else {
                Err("Missing invoice data".to_string())
            }
        }
        "kot" => {
            if let Some(kot) = &job.kot {
                Ok(render_kot(kot, &job.printer.paper_width))
            } else {
                Err("Missing KOT data".to_string())
            }
        }
        _ => Err(format!("Invalid job type: {}", job.job_type)),
    }
}

fn render_invoice(invoice: &Invoice, width: &str) -> Vec<u8> {
    let initialize: Vec<u8> = vec![0x1B, 0x40];
    let align_left: Vec<u8> = vec![0x1B, 0x61, 0x00];
    let align_center: Vec<u8> = vec![0x1B, 0x61, 0x01];
    let align_right: Vec<u8> = vec![0x1B, 0x61, 0x02];
    let bold_on: Vec<u8> = vec![0x1B, 0x45, 0x01];
    let bold_off: Vec<u8> = vec![0x1B, 0x45, 0x00];
    let double_size: Vec<u8> = vec![0x1D, 0x21, 0x11];
    let normal_size: Vec<u8> = vec![0x1D, 0x21, 0x00];
    let underline_on: Vec<u8> = vec![0x1B, 0x2D, 0x02];
    let underline_off: Vec<u8> = vec![0x1B, 0x2D, 0x00];
    let cut_paper: Vec<u8> = vec![0x1D, 0x56, 0x41, 0x10];

    let line_width = get_line_width(width);
    let mut data = Vec::new();

    data.extend_from_slice(&initialize);

    // HEADER
    data.extend_from_slice(&align_center);
    data.extend_from_slice(&bold_on);
    data.extend_from_slice(&double_size);

    let effective_width = line_width / 2;
    let name_lines = wrap_text(&invoice.store.name, effective_width);
    for line in name_lines {
        data.extend_from_slice(line.as_bytes());
        data.push(b'\n');
    }

    data.extend_from_slice(&normal_size);
    data.extend_from_slice(&bold_off);

    if let Some(branch) = &invoice.store.branch {
        data.extend_from_slice(branch.as_bytes());
        data.push(b'\n');
    }
    if let Some(location) = &invoice.store.location {
        data.extend_from_slice(location.as_bytes());
        data.push(b'\n');
    }
    if let Some(phone) = &invoice.store.phone {
        data.extend_from_slice(format!("MOB : {}\n", phone).as_bytes());
    }
    if let Some(phone2) = &invoice.store.phone_secondary {
        if !phone2.is_empty() {
            data.extend_from_slice(format!("MOB : {}\n", phone2).as_bytes());
        }
    }
    if let Some(gst) = &invoice.store.gst_number {
        if !gst.is_empty() {
            data.extend_from_slice(format!("GSTIN : {}\n", gst).as_bytes());
        }
    }
    if let Some(fssai) = &invoice.store.fssai_lic_no {
        if !fssai.is_empty() {
            data.extend_from_slice(format!("FSSAI LIC NO : {}\n", fssai).as_bytes());
        }
    }

    data.push(b'\n');
    data.extend_from_slice(&bold_on);
    data.extend_from_slice(&underline_on);
    let title = invoice
        .document_title
        .clone()
        .unwrap_or_else(|| "Retail Invoice".to_string());
    let title_lines = wrap_text(&title, line_width);
    for l in title_lines {
        data.extend_from_slice(l.as_bytes());
        data.push(b'\n');
    }
    data.extend_from_slice(&underline_off);
    data.extend_from_slice(&bold_off);
    if let Some(decl) = &invoice.declaration {
        if !decl.is_empty() {
            for l in wrap_text(decl, line_width) {
                data.extend_from_slice(l.as_bytes());
                data.push(b'\n');
            }
        }
    }
    data.push(b'\n');

    // INFO SECTION
    data.extend_from_slice(&align_left);
    data.extend_from_slice(format!("Date : {}\n", invoice.date).as_bytes());
    if invoice.customer.name != "" && invoice.customer.name != "Guest" {
        data.extend_from_slice(format!("Cust : {}\n", invoice.customer.name).as_bytes());
    }
    if let Some(mobile) = &invoice.customer.mobile {
        data.extend_from_slice(format!("Mob  : {}\n", mobile).as_bytes());
    }
    data.extend_from_slice(format!("Bill No: {}\n", invoice.bill_no).as_bytes());
    if let Some(o) = &invoice.original_invoice_no {
        if !o.is_empty() {
            let d = invoice.original_invoice_date.clone().unwrap_or_default();
            data.extend_from_slice(format!("Against Invoice: {} dt {}\n", o, d).as_bytes());
        }
    }
    if let Some(buyer) = &invoice.buyer {
        if !buyer.name.is_empty() {
            data.extend_from_slice(format!("Buyer: {}\n", buyer.name).as_bytes());
        }
        if !buyer.gstin.is_empty() {
            data.extend_from_slice(format!("Buyer GSTIN: {}\n", buyer.gstin).as_bytes());
        }
        if !buyer.address.is_empty() {
            for l in wrap_text(&format!("Addr: {}", buyer.address), line_width) {
                data.extend_from_slice(l.as_bytes());
                data.push(b'\n');
            }
        }
        if !buyer.state.is_empty() {
            data.extend_from_slice(format!("State: {}\n", buyer.state).as_bytes());
        }
    }
    if let Some(pos) = &invoice.place_of_supply {
        if !pos.is_empty() {
            data.extend_from_slice(format!("Place of Supply: {}\n", pos).as_bytes());
        }
    }
    data.extend_from_slice(format!("Payment Mode: {}\n", invoice.payment_mode).as_bytes());
    if let Some(dr_ref) = &invoice.dr_ref {
        if !dr_ref.is_empty() {
            data.extend_from_slice(format!("DR Ref : {}\n", dr_ref).as_bytes());
        }
    }
    data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());

    // TABLE HEADER
    let header = if width == "2inch" {
        format!("{}{}{}", pad_right("Item", 16), pad_left("Qty", 6), pad_left("Amt", 10))
    } else {
        format!("{}{}{}", pad_right("Item", 24), pad_left("Qty", 12), pad_left("Amt", 12))
    };
    data.extend_from_slice(&bold_on);
    data.extend_from_slice(format!("{}\n", header).as_bytes());
    data.extend_from_slice(&bold_off);
    data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());

    // ITEMS
    for item in &invoice.items {
        // Item Name in Bold
        data.extend_from_slice(&bold_on);
        let name_lines = wrap_text(&item.name, line_width);
        for line in name_lines {
            data.extend_from_slice(line.as_bytes());
            data.push(b'\n');
        }
        data.extend_from_slice(&bold_off);

        // Qty and Amt row
        let qty_amt_row = if width == "2inch" {
            format!("{}{}{}", 
                " ".repeat(16), 
                pad_left(&format!("{}", item.qty as i32), 6), 
                pad_left(&format_amount(item.amount), 10))
        } else {
            format!("{}{}{}", 
                " ".repeat(24), 
                pad_left(&format!("{}", item.qty as i32), 12), 
                pad_left(&format_amount(item.amount), 12))
        };
        data.extend_from_slice(format!("{}\n", qty_amt_row).as_bytes());
        let hsn = item.hsn.clone().unwrap_or_default();
        if !hsn.is_empty() || item.tax_percent > 0.0 {
            let mut detail = String::new();
            if !hsn.is_empty() {
                detail.push_str(&format!("HSN {}", hsn));
            }
            if item.tax_percent > 0.0 {
                if !detail.is_empty() {
                    detail.push_str("  ");
                }
                detail.push_str(&format!("GST {}%", trim_zero(item.tax_percent)));
            }
            for l in wrap_text(&detail, line_width) {
                data.extend_from_slice(l.as_bytes());
                data.push(b'\n');
            }
        }
        data.push(b'\n');
    }

    data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());

    // SUMMARY
    let summary_label_width = line_width - 15;
    data.extend_from_slice(&bold_on);
    data.extend_from_slice(format!("{}{}\n", 
        pad_right("Sub Total", summary_label_width), 
        pad_left(&format_amount(invoice.summary.sub_total), 15)).as_bytes());
    data.extend_from_slice(&bold_off);
    if invoice.summary.discount > 0.0 {
        data.extend_from_slice(format!("{}{}\n", 
            pad_right("(-) Discount", summary_label_width), 
            pad_left(&format_amount(invoice.summary.discount), 15)).as_bytes());
    }
    if !invoice.tax_summary.is_empty() {
        data.extend_from_slice(format!("{}{}\n",
            pad_right("Taxable Value", summary_label_width),
            pad_left(&format_amount(invoice.summary.taxable), 15)).as_bytes());
        let sgst_label = invoice
            .tax_label_state
            .clone()
            .unwrap_or_else(|| "SGST".to_string());
        for row in &invoice.tax_summary {
            let half = trim_zero(row.rate / 2.0);
            if row.cgst > 0.0 || row.sgst > 0.0 {
                data.extend_from_slice(format!("{}{}\n",
                    pad_right(&format!("CGST @{}%", half), summary_label_width),
                    pad_left(&format_amount(row.cgst), 15)).as_bytes());
                data.extend_from_slice(format!("{}{}\n",
                    pad_right(&format!("{} @{}%", sgst_label, half), summary_label_width),
                    pad_left(&format_amount(row.sgst), 15)).as_bytes());
            }
            if row.igst > 0.0 {
                data.extend_from_slice(format!("{}{}\n",
                    pad_right(&format!("IGST @{}%", trim_zero(row.rate)), summary_label_width),
                    pad_left(&format_amount(row.igst), 15)).as_bytes());
            }
        }
        if invoice.summary.cess > 0.0 {
            data.extend_from_slice(format!("{}{}\n",
                pad_right("Cess", summary_label_width),
                pad_left(&format_amount(invoice.summary.cess), 15)).as_bytes());
        }
    } else {
        if invoice.summary.cgst > 0.0 {
            data.extend_from_slice(format!("{}{}\n",
                pad_right("CGST", summary_label_width),
                pad_left(&format_amount(invoice.summary.cgst), 15)).as_bytes());
        }
        if invoice.summary.sgst > 0.0 {
            data.extend_from_slice(format!("{}{}\n",
                pad_right(&invoice
                    .tax_label_state
                    .clone()
                    .unwrap_or_else(|| "SGST".to_string()), summary_label_width),
                pad_left(&format_amount(invoice.summary.sgst), 15)).as_bytes());
        }
        if invoice.summary.igst > 0.0 {
            data.extend_from_slice(format!("{}{}\n",
                pad_right("IGST", summary_label_width),
                pad_left(&format_amount(invoice.summary.igst), 15)).as_bytes());
        }
        if invoice.summary.cess > 0.0 {
            data.extend_from_slice(format!("{}{}\n",
                pad_right("Cess", summary_label_width),
                pad_left(&format_amount(invoice.summary.cess), 15)).as_bytes());
        }
    }
    if invoice.round_off != 0.0 {
        data.extend_from_slice(format!("{}{}\n",
            pad_right("Round Off", summary_label_width),
            pad_left(&format_amount(invoice.round_off), 15)).as_bytes());
    }
    data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());

    // TOTAL
    data.extend_from_slice(&bold_on);
    data.extend_from_slice(&double_size);

    let total_val = format!("Rs {}", format_amount(invoice.summary.grand_total));
    let double_width_limit = line_width / 2;
    let total_row = format!("{}{}", 
        pad_right("TOTAL", double_width_limit.saturating_sub(total_val.len())), 
        total_val);

    data.extend_from_slice(format!("{}\n", total_row).as_bytes());
    data.extend_from_slice(&normal_size);
    data.extend_from_slice(&bold_off);
    data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());

    // PAYMENT DETAILS
    if invoice.payment.upi > 0.0 {
        data.extend_from_slice(format!("{}{}\n", 
            pad_right("UPI :", summary_label_width), 
            pad_left(&format!("Rs {}", format_amount(invoice.payment.upi)), 15)).as_bytes());
    }
    if invoice.payment.cash > 0.0 {
        data.extend_from_slice(format!("{}{}\n", 
            pad_right("Cash tendered:", summary_label_width), 
            pad_left(&format!("Rs {}", format_amount(invoice.payment.cash)), 15)).as_bytes());
    }

    // QR CODE
    if let Some(qr) = &invoice.qr {
        if !qr.value.is_empty() {
            data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());
            if !qr.description.is_empty() {
                data.extend_from_slice(&align_center);
                data.extend_from_slice(format!("{}\n\n", qr.description).as_bytes());
            }
            data.extend_from_slice(&generate_qr_code(&qr.value, qr.size));
        }
    }

    // FOOTER NOTES
    if !invoice.footer_notes.is_empty() {
        data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());
        data.extend_from_slice(&align_center);
        for line in &invoice.footer_notes {
            for l in wrap_text(line, line_width) {
                data.extend_from_slice(l.as_bytes());
                data.push(b'\n');
            }
        }
    }

    // FOOTER
    if let Some(footer) = &invoice.footer {
        if !footer.is_empty() {
            data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());
            data.extend_from_slice(&align_center);
            for line in footer {
                let wrapped = wrap_text(line, line_width);
                for l in wrapped {
                    data.extend_from_slice(l.as_bytes());
                    data.push(b'\n');
                }
            }
        }
    }

    // E & O.E
    data.extend_from_slice(&align_right);
    data.extend_from_slice(b"E & O.E\n");

    data.extend_from_slice(b"\n\n\n");
    data.extend_from_slice(&cut_paper);

    data
}

/// "2.50" -> "2.5", "18.00" -> "18"
fn trim_zero(v: f64) -> String {
    let s = format!("{:.2}", v);
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

fn render_kot(kot: &KOT, width: &str) -> Vec<u8> {
    let initialize: Vec<u8> = vec![0x1B, 0x40];
    let align_left: Vec<u8> = vec![0x1B, 0x61, 0x00];
    let align_center: Vec<u8> = vec![0x1B, 0x61, 0x01];
    let bold_on: Vec<u8> = vec![0x1B, 0x45, 0x01];
    let bold_off: Vec<u8> = vec![0x1B, 0x45, 0x00];
    let double_size: Vec<u8> = vec![0x1D, 0x21, 0x11];
    let normal_size: Vec<u8> = vec![0x1D, 0x21, 0x00];
    let cut_paper: Vec<u8> = vec![0x1D, 0x56, 0x41, 0x10];

    let line_width = get_line_width(width);
    let mut data = Vec::new();

    data.extend_from_slice(&initialize);
    data.extend_from_slice(&align_center);
    data.extend_from_slice(&bold_on);
    data.extend_from_slice(&double_size);
    data.extend_from_slice(b"KITCHEN ORDER\n");
    data.extend_from_slice(&normal_size);
    data.extend_from_slice(&bold_off);
    data.push(b'\n');

    data.extend_from_slice(&align_left);
    data.extend_from_slice(format!("Order #{}\n", kot.order_id).as_bytes());
    data.extend_from_slice(format!("Type: {}\n", kot.order_type).as_bytes());
    if kot.table_number != "" && kot.table_number != "Take Away" {
        data.extend_from_slice(format!("Table: {}\n", kot.table_number).as_bytes());
    }
    if kot.customer_name != "" && kot.customer_name != "Guest" {
        data.extend_from_slice(format!("Cust : {}\n", kot.customer_name).as_bytes());
    }
    if kot.customer_mobile != "" {
        data.extend_from_slice(format!("Mob  : {}\n", kot.customer_mobile).as_bytes());
    }
    data.extend_from_slice(format!("Date: {}\n", kot.date).as_bytes());
    if kot.waiter_name != "" {
        data.extend_from_slice(format!("Waiter: {}\n", kot.waiter_name).as_bytes());
    }
    data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());

    // ITEMS
    for item in &kot.items {
        data.extend_from_slice(&bold_on);
        data.extend_from_slice(format!("{:-3} x {}\n", item.qty as i32, item.name).as_bytes());
        data.extend_from_slice(&bold_off);
    }

    if kot.notes != "" {
        data.extend_from_slice(format!("{}\n", "-".repeat(line_width)).as_bytes());
        data.extend_from_slice(b"NOTES:\n");
        data.extend_from_slice(format!("{}\n", kot.notes).as_bytes());
    }

    data.extend_from_slice(b"\n\n\n");
    data.extend_from_slice(&cut_paper);

    data
}

/// Generate ESC/POS native QR code commands for thermal printers.
fn generate_qr_code(value: &str, size: i32) -> Vec<u8> {
    let module_size = if size <= 0 { 6u8 } else { size as u8 };

    let mut out = Vec::new();

    // Center align
    out.extend_from_slice(&[0x1B, 0x61, 0x01]);

    // Select QR Code model 2
    out.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);

    // Set QR Code module size
    out.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, module_size]);

    // Set error correction level (L = 0x30)
    out.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30]);

    // Store QR Code data
    let qr_data = value.as_bytes();
    let data_len = qr_data.len() + 3;
    let p_l = (data_len % 256) as u8;
    let p_h = (data_len / 256) as u8;
    out.extend_from_slice(&[0x1D, 0x28, 0x6B, p_l, p_h, 0x31, 0x50, 0x30]);
    out.extend_from_slice(qr_data);

    // Print stored QR Code
    out.extend_from_slice(&[0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);

    out.extend_from_slice(b"\n\n");

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::printer::utils::get_line_width;

    fn base_invoice() -> Invoice {
        Invoice {
            store: Store {
                name: "GST Cafe".into(),
                branch: Some("Main".into()),
                location: Some("City".into()),
                gst_number: Some("27ABCDE1234F1Z0".into()),
                fssai_lic_no: None,
                phone: None,
                phone_secondary: None,
                address: None,
            },
            customer: Customer { name: "Walk-in".into(), mobile: None },
            invoice_no: "INV/2627/00001".into(),
            bill_no: "INV/2627/00001".into(),
            date: "31-10-2026 12:00 PM".into(),
            payment_mode: "cash".into(),
            dr_ref: None,
            items: vec![Item {
                name: "Masala Dosa".into(),
                hsn: Some("9963".into()),
                qty: 2.0,
                unit: "NOS".into(),
                rate: 100.0,
                tax_percent: 5.0,
                amount: 200.0,
            }],
            summary: Summary {
                sub_total: 200.0, discount: 0.0, taxable: 200.0,
                cgst: 5.0, sgst: 5.0, igst: 0.0, cess: 0.0, grand_total: 210.0,
            },
            payment: Payment { cash: 210.0, card: 0.0, balance: 0.0, upi: 0.0 },
            qr: None,
            footer: Some(vec!["Thank You".into()]),
            document_title: Some("TAX INVOICE".into()),
            declaration: None,
            place_of_supply: Some("27-Maharashtra".into()),
            buyer: Some(Buyer {
                name: "Big Corp".into(), gstin: "29PQRSX5678K2ZT".into(),
                address: "".into(), state: "29".into(),
            }),
            tax_summary: vec![TaxSummaryRow { rate: 5.0, taxable: 200.0, cgst: 5.0, sgst: 5.0, igst: 0.0 }],
            tax_label_state: Some("SGST".into()),
            round_off: -0.4,
            footer_notes: vec![],
            original_invoice_no: None,
            original_invoice_date: None,
        }
    }

    /// Emulates the printer's text stream by skipping ESC/POS command
    /// sequences: ESC x <args>, GS x <args> (with the variable-length
    /// 'GS ( k' QR form handled by its length field).
    fn text_lines(data: &[u8]) -> Vec<String> {
        let mut printable = Vec::new();
        let mut i = 0;
        while i < data.len() {
            match data[i] {
                0x1B => {
                    let arg_bytes = match data.get(i + 1).copied().unwrap_or(0) {
                        b'@' => 1, // cmd byte only
                        _ => 2,    // cmd byte + 1 arg byte
                    };
                    i += 1 + arg_bytes;
                }
                0x1D => {
                    let cmd = data.get(i + 1).copied().unwrap_or(0);
                    if cmd == b'(' {
                        // GS ( k pL pH <payload>: pL/pH give remaining length
                        let p_l = data.get(i + 4).copied().unwrap_or(0) as usize;
                        let p_h = data.get(i + 5).copied().unwrap_or(0) as usize;
                        i += 4 + p_l + p_h * 256 + 2;
                    } else {
                        i += 3; // cmd byte + 1 arg byte (GS !, GS V, GS 2)
                    }
                }
                b => {
                    if b == b'\n' || (0x20..0x7F).contains(&b) {
                        printable.push(b);
                    }
                    i += 1;
                }
            }
        }
        String::from_utf8_lossy(&printable)
            .split('\n')
            .map(|l| l.to_string())
            .collect()
    }

    fn check_width(data: &[u8], width: &str) {
        let max = get_line_width(width);
        for l in text_lines(data) {
            assert!(l.len() <= max, "line too wide ({}>{}): {:?}", l.len(), max, l);
        }
    }

    #[test]
    fn gst_invoice_both_widths() {
        for w in ["2inch", "3inch"] {
            let data = render_invoice(&base_invoice(), w);
            let text = text_lines(&data).join("\n");
            assert!(text.contains("TAX INVOICE"), "title missing for {}", w);
            assert!(text.contains("CGST @2.5%"), "cgst line missing for {}", w);
            assert!(text.contains("SGST @2.5%"), "sgst line missing for {}", w);
            assert!(text.contains("HSN 9963"), "hsn missing for {}", w);
            assert!(text.contains("Round Off"), "round off missing for {}", w);
            assert!(text.contains("Buyer GSTIN"), "buyer missing for {}", w);
            assert!(text.contains("Place of Supply"), "pos missing for {}", w);
            assert!(text.contains("Taxable Value"), "taxable missing for {}", w);
            check_width(&data, w);
        }
    }

    #[test]
    fn legacy_invoice_both_widths() {
        let mut inv = base_invoice();
        inv.document_title = None;
        inv.buyer = None;
        inv.place_of_supply = None;
        inv.tax_summary = vec![];
        inv.round_off = 0.0;
        for w in ["2inch", "3inch"] {
            let data = render_invoice(&inv, w);
            let text = text_lines(&data).join("\n");
            assert!(text.contains("Retail Invoice"), "legacy title missing for {}", w);
            assert!(text.contains("CGST"), "legacy cgst missing for {}", w);
            check_width(&data, w);
        }
    }

    #[test]
    fn credit_note_lines() {
        let mut inv = base_invoice();
        inv.document_title = Some("CREDIT NOTE".into());
        inv.original_invoice_no = Some("INV/2627/00001".into());
        inv.original_invoice_date = Some("2026-10-31".into());
        let data = render_invoice(&inv, "3inch");
        let text = text_lines(&data).join("\n");
        assert!(text.contains("CREDIT NOTE"));
        assert!(text.contains("Against Invoice: INV/2627/00001"));
    }
}
