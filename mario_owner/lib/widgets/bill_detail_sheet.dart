import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../backend/backend_service.dart';
import '../providers/auth_provider.dart';
import '../models/bill.dart';
import '../utils/constants.dart';

/// Opens a bottom sheet showing a bill's GST breakdown. Falls back to the
/// plain item list + totals for legacy bills that lack GST fields.
Future<void> showBillDetailSheet(BuildContext context, Bill bill) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      builder: (ctx, scrollController) => Container(
        decoration: const BoxDecoration(
          color: AppColors.light,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(28),
            topRight: Radius.circular(28),
          ),
        ),
        child: BillDetailSheet(bill: bill, scrollController: scrollController),
      ),
    ),
  );
}

class BillDetailSheet extends StatelessWidget {
  final Bill bill;
  final ScrollController? scrollController;

  const BillDetailSheet({super.key, required this.bill, this.scrollController});

  String _money(num? v) => '\u20B9${(v ?? 0).toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    final taxOn = context.read<AuthProvider>().currentStore?.taxEnabled ?? true;
    final hasGst = taxOn && bill.hasGstDetails;
    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
      children: [
        Center(
          child: Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.gray300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    bill.invoiceNo ?? 'Bill',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    DateFormat('MMM dd, yyyy \u2022 HH:mm')
                        .format(bill.generatedAt),
                    style:
                        const TextStyle(fontSize: 12, color: AppColors.gray500),
                  ),
                ],
              ),
            ),
            if (taxOn && (bill.documentType != null || bill.supplyType != null))
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.primaryExtraLight,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  [bill.supplyType, bill.documentType]
                      .whereType<String>()
                      .where((s) => s.isNotEmpty)
                      .map((s) => s.toUpperCase())
                      .join(' \u2022 '),
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 16),
        if (taxOn && bill.buyerGstin != null && bill.buyerGstin!.isNotEmpty)
          _infoRow('Buyer GSTIN', bill.buyerGstin!),
        if (taxOn &&
            bill.placeOfSupplyName != null &&
            bill.placeOfSupplyName!.isNotEmpty)
          _infoRow('Place of Supply', bill.placeOfSupplyName!),
        if (bill.orderSource != null && bill.orderSource!.isNotEmpty)
          _infoRow('Source', bill.orderSource!),
        if (taxOn && bill.fy != null && bill.fy!.isNotEmpty)
          _infoRow('Financial Year', bill.fy!),
        if (taxOn && bill.isUtgst) _infoRow('Tax Type', 'UTGST'),
        const SizedBox(height: 8),
        if (hasGst) ..._buildGstDetails() else ..._buildLegacyDetails(),
        if (taxOn && (bill.creditedTotal ?? 0) > 0) _buildCreditNotes(),
      ],
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(fontSize: 13, color: AppColors.gray500)),
          Flexible(
            child: Text(
              value,
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.dark),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: AppColors.gray500,
          letterSpacing: 1,
        ),
      ),
    );
  }

  List<Widget> _buildGstDetails() {
    return [
      if (bill.lines.isNotEmpty) ...[
        _sectionLabel('Items'),
        Container(
          decoration: BoxDecoration(
            color: AppColors.gray50,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.gray200),
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            children: bill.lines.map((line) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            line.name,
                            style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppColors.dark),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            [
                              if (line.hsnCode != null &&
                                  line.hsnCode!.isNotEmpty)
                                'HSN ${line.hsnCode}',
                              '${_qty(line.quantity)} \u00D7 ${_money(line.unitPrice)}',
                              '@ ${line.taxRate.toStringAsFixed(0)}%',
                            ].join('  \u2022  '),
                            style: const TextStyle(
                                fontSize: 12, color: AppColors.gray500),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _money(line.taxableValue),
                          style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppColors.dark),
                        ),
                        Text(
                          _lineTaxLabel(line),
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.gray500),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
      ],
      if (bill.taxSummary.isNotEmpty) ...[
        _sectionLabel('Tax Summary'),
        Container(
          decoration: BoxDecoration(
            color: AppColors.gray50,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.gray200),
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              _taxRow('Rate', 'Taxable', 'CGST', 'SGST', 'IGST',
                  isHeader: true),
              const Divider(height: 12),
              ...bill.taxSummary.map((t) => _taxRow(
                    '${t.rate.toStringAsFixed(0)}%',
                    _money(t.taxableValue),
                    _money(t.cgst),
                    _money(t.sgst),
                    _money(t.igst),
                  )),
            ],
          ),
        ),
      ],
      const Divider(height: 28),
      if (bill.taxableValue != null)
        _totalRow('Taxable Value', _money(bill.taxableValue)),
      if (bill.cgst != null && bill.cgst! > 0)
        _totalRow('CGST', _money(bill.cgst)),
      if (bill.sgst != null && bill.sgst! > 0)
        _totalRow('SGST', _money(bill.sgst)),
      if (bill.igst != null && bill.igst! > 0)
        _totalRow('IGST', _money(bill.igst)),
      if (bill.discount > 0)
        _totalRow('Discount', '-${_money(bill.discount)}'),
      if (bill.roundOff != null && bill.roundOff != 0)
        _totalRow('Round Off', _money(bill.roundOff)),
      const Divider(height: 20),
      _totalRow('Total', _money(bill.total), bold: true),
      if ((bill.creditedTotal ?? 0) > 0)
        _totalRow('Credited', '-${_money(bill.creditedTotal)}',
            color: AppColors.danger),
    ];
  }

  String _qty(double q) =>
      q == q.roundToDouble() ? q.toStringAsFixed(0) : q.toStringAsFixed(2);

  String _lineTaxLabel(BillLine line) {
    final parts = <String>[];
    if (line.cgst > 0) parts.add('CGST ${_money(line.cgst)}');
    if (line.sgst > 0) parts.add('SGST ${_money(line.sgst)}');
    if (line.igst > 0) parts.add('IGST ${_money(line.igst)}');
    return parts.isEmpty ? _money(line.total) : parts.join('  ');
  }

  Widget _taxRow(String a, String b, String c, String d, String e,
      {bool isHeader = false}) {
    final style = TextStyle(
      fontSize: isHeader ? 11 : 12,
      fontWeight: isHeader ? FontWeight.w700 : FontWeight.w500,
      color: isHeader ? AppColors.gray500 : AppColors.dark,
    );
    final values = [a, b, c, d, e];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          for (var i = 0; i < values.length; i++)
            Expanded(
              child: Text(
                values[i],
                style: style,
                textAlign: i == 0 ? TextAlign.left : TextAlign.right,
              ),
            ),
        ],
      ),
    );
  }

  Widget _totalRow(String label, String value,
      {bool bold = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: bold ? 16 : 14,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
              color: bold ? AppColors.dark : AppColors.gray700,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: bold ? 18 : 14,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              color: color ?? (bold ? AppColors.primary : AppColors.dark),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildLegacyDetails() {
    return [
      _sectionLabel('Items'),
      ...bill.items.map((item) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text('${item.quantity}x ${item.itemName}',
                      style: const TextStyle(fontSize: 14)),
                ),
                Text(
                  _money(item.totalPrice),
                  style: const TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 14),
                ),
              ],
            ),
          )),
      const Divider(height: 24),
      _totalRow('Subtotal', _money(bill.subtotal)),
      if (bill.taxTotal > 0) _totalRow('Tax', _money(bill.taxTotal)),
      if (bill.discount > 0)
        _totalRow('Discount', '-${_money(bill.discount)}'),
      const Divider(height: 20),
      _totalRow('Total', _money(bill.total), bold: true),
    ];
  }

  Widget _buildCreditNotes() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel('Credit Notes'),
        FutureBuilder<List<Map<String, dynamic>>>(
          future:
              BackendService().api.getCreditNotes(bill.storeId, bill.id),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.primary),
                  ),
                ),
              );
            }
            final notes = snapshot.data ?? [];
            if (notes.isEmpty) return const SizedBox.shrink();
            return Container(
              decoration: BoxDecoration(
                color: AppColors.gray50,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.gray200),
              ),
              padding: const EdgeInsets.all(12),
              child: Column(
                children: notes.map((n) {
                  final no = n['creditNoteNo']?.toString() ?? '-';
                  final reason = n['reason']?.toString() ?? '';
                  final total = n['total'] is num
                      ? (n['total'] as num).toDouble()
                      : double.tryParse('${n['total']}') ?? 0.0;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        const Icon(Icons.assignment_return_rounded,
                            size: 16, color: AppColors.danger),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            reason.isEmpty ? no : '$no \u2022 $reason',
                            style: const TextStyle(
                                fontSize: 13, color: AppColors.dark),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Text(
                          '-${_money(total)}',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: AppColors.danger,
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            );
          },
        ),
      ],
    );
  }
}
