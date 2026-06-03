use crate::printer::models::*;
use crate::printer::utils::*;
use qrcode::QrCode;
use qrcode::render::svg;

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
    if let Some(gst) = &invoice.store.gst_number {
        data.extend_from_slice(format!("GSTIN : {}\n", gst).as_bytes());
    }
    if let Some(fssai) = &invoice.store.fssai_lic_no {
        data.extend_from_slice(format!("FSSAI LIC NO : {}\n", fssai).as_bytes());
    }

    data.push(b'\n');
    data.extend_from_slice(&bold_on);
    data.extend_from_slice(&underline_on);
    data.extend_from_slice(b"Retail Invoice\n");
    data.extend_from_slice(&underline_off);
    data.extend_from_slice(&bold_off);
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
    data.extend_from_slice(format!("Payment Mode: {}\n", invoice.payment_mode).as_bytes());
    if let Some(dr_ref) = &invoice.dr_ref {
        data.extend_from_slice(format!("DR Ref : {}\n", dr_ref).as_bytes());
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
        data.extend_from_slice(format!("{}\n\n", qty_amt_row).as_bytes());
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

fn generate_qr_code(value: &str, _size: i32) -> Vec<u8> {
    // For simplicity, we'll generate a basic QR code
    // In a real implementation, you might want to use a library that generates
    // printer-compatible QR codes directly
    let qr_code = QrCode::new(value).unwrap();
    let svg_string = qr_code
        .render::<svg::Color>()
        .min_dimensions(200, 200)
        .build();
    
    // Convert SVG to bytes (this is a placeholder - real implementation would need
    // to convert to printer-compatible format)
    svg_string.into_bytes()
}
