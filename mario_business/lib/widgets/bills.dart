import 'package:flutter/material.dart';

import '../core/format.dart';
import '../models/sales.dart';
import '../theme/app_theme.dart';
import '../theme/palettes.dart';
import 'common.dart';

/// Compact bill row; tap opens the bill detail sheet.
class BillTile extends StatelessWidget {
  const BillTile({super.key, required this.bill});

  final Bill bill;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => showBillSheet(context, bill),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: c.cardAlt, borderRadius: BorderRadius.circular(12)),
              child: Icon(
                bill.channel == 'dine_in' ? Icons.table_restaurant_outlined : (bill.channel == 'parcel' ? Icons.takeout_dining_outlined : Icons.delivery_dining_outlined),
                size: 20,
                color: c.textSecondary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    bill.invoiceNo.isNotEmpty ? '#${bill.invoiceNo}' : bill.tableLabel,
                    style: context.text.titleSmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    '${bill.tableLabel} · ${Fmt.dateTime(bill.generatedAt)}',
                    style: context.text.labelSmall?.copyWith(color: c.textMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  Fmt.money(bill.total),
                  style: context.text.titleSmall?.copyWith(
                    decoration: bill.isCancelled ? TextDecoration.lineThrough : null,
                    color: bill.isCancelled ? c.textMuted : null,
                  ),
                ),
                const SizedBox(height: 2),
                bill.isCancelled
                    ? Pill('Cancelled', color: StatusColors.down(context.brightness), icon: Icons.block_rounded)
                    : Text(Fmt.label(bill.paymentMethod, fallback: '—'), style: context.text.labelSmall?.copyWith(color: c.textMuted)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> showBillSheet(BuildContext context, Bill bill) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => BillSheet(bill: bill),
  );
}

/// Read-only bill details.
class BillSheet extends StatelessWidget {
  const BillSheet({super.key, required this.bill});

  final Bill bill;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final b = bill;
    final hasLines = b.lines.isNotEmpty;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      builder: (context, ctrl) => ListView(
        controller: ctrl,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 32),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(b.invoiceNo.isNotEmpty ? 'Invoice #${b.invoiceNo}' : 'Bill', style: context.text.titleLarge),
                    const SizedBox(height: 2),
                    Text(Fmt.dateTime(b.generatedAt), style: context.text.bodySmall),
                  ],
                ),
              ),
              if (b.isCancelled) Pill('Cancelled', color: StatusColors.down(context.brightness), icon: Icons.block_rounded),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: c.cardAlt, borderRadius: BorderRadius.circular(16)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                StatPair('Table', b.tableLabel),
                StatPair('Payment', Fmt.label(b.paymentMethod, fallback: '—')),
                StatPair('Channel', Fmt.label(b.channel)),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Text('Items', style: context.text.titleSmall),
          const SizedBox(height: 6),
          if (hasLines)
            for (final l in b.lines)
              _ItemLine(name: l.name, qty: l.quantity, unit: l.unitPrice, total: l.taxableValue + l.cgst + l.sgst + l.igst, note: l.taxRate > 0 ? 'GST ${Fmt.percent(l.taxRate, digits: 0)}' : null)
          else
            for (final i in b.items) _ItemLine(name: i.name, qty: i.quantity.toDouble(), unit: i.unitPrice, total: i.amount, note: i.notes.isNotEmpty ? i.notes : null),
          if (!hasLines && b.items.isEmpty) Text('No item details available', style: context.text.bodySmall),
          const Divider(height: 28),
          InfoRow('Subtotal', Fmt.money2(b.subtotal)),
          if (b.discount > 0) InfoRow('Discount', '− ${Fmt.money2(b.discount)}'),
          if (b.taxTotal > 0) InfoRow('Tax', Fmt.money2(b.taxTotal)),
          if (b.roundOff != 0) InfoRow('Round off', Fmt.money2(b.roundOff)),
          InfoRow('Total', Fmt.money2(b.total), bold: true),
          if (b.creditedTotal > 0) InfoRow('Credited (credit notes)', '− ${Fmt.money2(b.creditedTotal)}'),
          const Divider(height: 28),
          if (b.customerName.isNotEmpty) InfoRow('Customer', b.customerName),
          if (b.customerMobile.isNotEmpty) InfoRow('Mobile', b.customerMobile),
          if (b.buyerGstin.isNotEmpty) InfoRow('Buyer GSTIN', b.buyerGstin),
        ],
      ),
    );
  }
}

class _ItemLine extends StatelessWidget {
  const _ItemLine({required this.name, required this.qty, required this.unit, required this.total, this.note});

  final String name;
  final double qty;
  final double unit;
  final double total;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final q = qty == qty.roundToDouble() ? qty.toStringAsFixed(0) : qty.toStringAsFixed(2);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                Text('$q × ${Fmt.money2(unit)}${note != null ? ' · $note' : ''}',
                    style: context.text.labelSmall?.copyWith(color: context.colors.textMuted)),
              ],
            ),
          ),
          Text(Fmt.money2(total), style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
