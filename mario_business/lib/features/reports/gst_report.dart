import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../models/reports.dart';
import '../../state/session.dart';
import '../../theme/app_theme.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import 'report_scaffold.dart';

class GstReport extends StatelessWidget {
  const GstReport({super.key});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<Session>().store;
    return ReportPage<GstSummary>(
      title: 'GST summary',
      load: (repo, id, r, f) => repo.gstSummary(id, r, force: f),
      builder: (context, g, range) {
        final c = context.colors;
        final net = g.net;
        final splitSlices = [
          if (net.cgst > 0) DonutSlice('CGST', net.cgst),
          if (net.sgst > 0) DonutSlice('SGST / UTGST', net.sgst),
          if (net.igst > 0) DonutSlice('IGST', net.igst),
          if (net.cess > 0) DonutSlice('Cess', net.cess),
        ];
        return ReportList(children: [
          if (store != null)
            SectionCard(
              child: Row(children: [
                Icon(Icons.verified_outlined, color: c.accent),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(store.gstin.isEmpty ? 'GSTIN not set' : store.gstin, style: context.text.titleSmall),
                    Text(
                      g.registrationType.isEmpty ? 'Registration type not set' : '${Fmt.label(g.registrationType)} registration',
                      style: context.text.bodySmall,
                    ),
                  ]),
                ),
              ]),
            ),
          TileGrid(children: [
            KpiTile(label: 'Invoice value', value: g.invoiceValue, icon: Icons.receipt_long_outlined, showDelta: false, footnote: '${g.invoiceCount} invoices'),
            KpiTile(label: 'Taxable value (net)', value: net.taxableValue, icon: Icons.account_balance_outlined, showDelta: false),
            KpiTile(label: 'Total tax (net)', value: net.totalTax, icon: Icons.request_quote_outlined, showDelta: false),
            KpiTile(
              label: 'Credit notes',
              value: g.creditNoteTotal,
              icon: Icons.undo_rounded,
              showDelta: false,
              footnote: '${g.creditNoteCount} issued · ${g.cancelledCount} cancelled invoices',
            ),
          ]),
          if (g.compositionTax != null)
            SectionCard(
              title: 'Composition scheme',
              child: InfoRow('Tax payable (approx.)', Fmt.money2(g.compositionTax!), bold: true),
            ),
          SectionCard(
            title: 'Tax components',
            child: splitSlices.isEmpty
                ? const EmptyState(icon: Icons.request_quote_outlined, title: 'No tax in this period')
                : DonutChart(slices: splitSlices, centerLabel: 'Net tax', valueFormat: Fmt.money2),
          ),
          SectionCard(
            title: 'Invoices vs credit notes',
            child: _TaxTable(invoices: g.invoices, net: net),
          ),
          if (g.rateWise.isNotEmpty)
            SectionCard(
              title: 'Rate-wise summary',
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Column(children: [
                Row(children: [
                  Expanded(child: Text('Rate', style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                  SizedBox(width: 100, child: Text('Taxable', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                  SizedBox(width: 90, child: Text('Tax', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                ]),
                for (final r in g.rateWise)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(children: [
                      Expanded(child: Text(Fmt.percent(r.rate, digits: r.rate % 1 == 0 ? 0 : 1), style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600))),
                      SizedBox(width: 100, child: Text(Fmt.money(r.totals.taxableValue), textAlign: TextAlign.right, style: context.text.bodyMedium)),
                      SizedBox(width: 90, child: Text(Fmt.money(r.totals.totalTax), textAlign: TextAlign.right, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700))),
                    ]),
                  ),
              ]),
            ),
          if (g.legacyBillsExcluded > 0)
            Text(
              '${g.legacyBillsExcluded} older bills issued before GST invoicing was enabled are not included.',
              style: context.text.bodySmall?.copyWith(color: c.textMuted),
              textAlign: TextAlign.center,
            ),
          Text(
            'For filing, export GSTR-1 from the Mario desktop app. Figures here are for monitoring.',
            style: context.text.bodySmall?.copyWith(color: c.textMuted),
            textAlign: TextAlign.center,
          ),
        ]);
      },
    );
  }
}

class _TaxTable extends StatelessWidget {
  const _TaxTable({required this.invoices, required this.net});

  final GstTotals invoices;
  final GstTotals net;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final inv = invoices;
    final cn = GstTotals(
      taxableValue: inv.taxableValue - net.taxableValue,
      cgst: inv.cgst - net.cgst,
      sgst: inv.sgst - net.sgst,
      igst: inv.igst - net.igst,
      cess: inv.cess - net.cess,
    );
    final data = [('Invoices', inv), ('Credit notes', cn), ('Net', net)];
    TextStyle? h = context.text.labelSmall?.copyWith(color: c.textMuted);
    return Column(children: [
      Row(children: [
        const Expanded(child: SizedBox()),
        for (final d in data) SizedBox(width: 86, child: Text(d.$1, textAlign: TextAlign.right, style: h)),
      ]),
      const SizedBox(height: 6),
      for (final (label, pick) in <(String, double Function(GstTotals))>[
        ('Taxable', (t) => t.taxableValue),
        ('CGST', (t) => t.cgst),
        ('SGST', (t) => t.sgst),
        ('IGST', (t) => t.igst),
        ('Cess', (t) => t.cess),
        ('Total tax', (t) => t.totalTax),
      ])
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            Expanded(child: Text(label, style: context.text.bodyMedium?.copyWith(color: c.textSecondary))),
            for (final d in data)
              SizedBox(
                width: 86,
                child: Text(
                  Fmt.money(pick(d.$2)),
                  textAlign: TextAlign.right,
                  style: context.text.bodyMedium?.copyWith(fontWeight: d.$1 == 'Net' ? FontWeight.w700 : FontWeight.w500),
                ),
              ),
          ]),
        ),
    ]);
  }
}
