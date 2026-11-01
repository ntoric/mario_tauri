import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../data/analytics.dart';
import '../../models/reports.dart';
import '../../theme/app_theme.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import 'report_scaffold.dart';

/// How money came in: payment methods, order channels, staff and tables.
class PaymentsReport extends StatelessWidget {
  const PaymentsReport({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportPage<(RevenueReport, Map<String, String>)>(
      title: 'Payments & channels',
      load: (repo, id, r, f) async {
        final res = await Future.wait<Object>([repo.revenue(id, r, force: f), repo.userNames(force: f)]);
        return (res[0] as RevenueReport, res[1] as Map<String, String>);
      },
      builder: (context, data, range) {
        final (d, names) = data;
        final c = context.colors;
        final a = SalesAnalytics(d.bills, d.expenses, range);
        final pay = a.paymentMethods();
        final ch = a.channels();
        final staff = a.staff();
        final tables = a.tables().where((t) => t.key != 'Parcel').toList();

        Widget table(List<Slice> rows, String col) => Column(children: [
              Row(children: [
                Expanded(child: Text(col, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                SizedBox(width: 56, child: Text('Bills', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                SizedBox(width: 80, child: Text('Avg.', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
                SizedBox(width: 92, child: Text('Total', textAlign: TextAlign.right, style: context.text.labelSmall?.copyWith(color: c.textMuted))),
              ]),
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Row(children: [
                    Expanded(child: Text(Fmt.label(r.key), style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
                    SizedBox(width: 56, child: Text('${r.count}', textAlign: TextAlign.right, style: context.text.bodyMedium)),
                    SizedBox(width: 80, child: Text(Fmt.money(r.value / r.count), textAlign: TextAlign.right, style: context.text.bodyMedium?.copyWith(color: c.textSecondary))),
                    SizedBox(width: 92, child: Text(Fmt.money(r.value), textAlign: TextAlign.right, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700))),
                  ]),
                ),
            ]);

        return ReportList(children: [
          SectionCard(
            title: 'Payment methods',
            child: Column(children: [
              DonutChart(
                centerLabel: 'Collected',
                slices: [for (final s in topWithOther(pay, 5)) DonutSlice(Fmt.label(s.key), s.value, isOther: s.key == 'Other')],
              ),
              if (pay.isNotEmpty) ...[const Divider(height: 28), table(pay, 'Method')],
            ]),
          ),
          SectionCard(
            title: 'Order channels',
            subtitle: 'Dine-in, parcel and delivery partners',
            child: Column(children: [
              DonutChart(
                centerLabel: 'Sales',
                slices: [for (final s in topWithOther(ch, 5)) DonutSlice(Fmt.label(s.key), s.value, isOther: s.key == 'Other')],
              ),
              if (ch.isNotEmpty) ...[const Divider(height: 28), table(ch, 'Channel')],
            ]),
          ),
          if (a.discount > 0)
            SectionCard(
              title: 'Discounts',
              child: Column(children: [
                InfoRow('Total discount given', Fmt.money(a.discount), bold: true),
                InfoRow('Bills with discount', '${a.bills.where((b) => b.discount > 0).length} of ${a.bills.length}'),
                InfoRow('Share of sales', Fmt.percent(a.revenue > 0 ? a.discount / (a.revenue + a.discount) * 100 : 0)),
              ]),
            ),
          if (staff.isNotEmpty)
            SectionCard(
              title: 'Sales by staff',
              subtitle: 'Who generated the bills',
              child: Column(children: [
                for (var i = 0; i < staff.length; i++)
                  RankRow(
                    rank: i + 1,
                    title: names[staff[i].key] ?? (staff[i].key == 'unknown' ? 'Unknown' : 'Staff'),
                    subtitle: '${staff[i].count} bills · avg ${Fmt.money(staff[i].value / staff[i].count)}',
                    value: Fmt.money(staff[i].value),
                    share: staff.first.value > 0 ? staff[i].value / staff.first.value : 0,
                  ),
              ]),
            ),
          if (tables.isNotEmpty)
            SectionCard(
              title: 'Top tables',
              child: Column(children: [
                for (var i = 0; i < tables.length && i < 10; i++)
                  RankRow(
                    rank: i + 1,
                    title: tables[i].key,
                    subtitle: '${tables[i].count} bills',
                    value: Fmt.money(tables[i].value),
                    share: tables.first.value > 0 ? tables[i].value / tables.first.value : 0,
                  ),
              ]),
            ),
        ]);
      },
    );
  }
}
