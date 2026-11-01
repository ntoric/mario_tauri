import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/date_range.dart';
import '../../core/format.dart';
import '../../data/analytics.dart';
import '../../data/owner_repository.dart';
import '../../models/reports.dart';
import '../../models/store.dart';
import '../../state/session.dart';
import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import '../../widgets/loader.dart';
import '../../widgets/page_scaffold.dart';

class StoreResult {
  final Store store;
  final RevenueReport? cur;
  final RevenueReport? prev;
  final Object? error;
  StoreResult(this.store, this.cur, this.prev, this.error);

  double get revenue => cur?.totalRevenue ?? 0;
  double get expenses => cur?.totalExpenses ?? 0;
  double get profit => revenue - expenses;
}

enum _Metric { revenue, profit, bills, avgBill, expenses }

extension on _Metric {
  String get label => switch (this) {
        _Metric.revenue => 'Sales',
        _Metric.profit => 'Net profit',
        _Metric.bills => 'Bills',
        _Metric.avgBill => 'Avg. bill',
        _Metric.expenses => 'Expenses',
      };
}

/// Side-by-side performance of every store assigned to the owner.
class StoreComparisonScreen extends StatelessWidget {
  const StoreComparisonScreen({super.key});

  static Future<List<StoreResult>> load(OwnerRepository repo, List<Store> stores, DateRange range, bool force) {
    return Future.wait(stores.map((s) async {
      try {
        final r = await Future.wait([
          repo.revenueSummary(s.id, range, force: force),
          repo.revenueSummary(s.id, range.previous, force: force),
        ]);
        return StoreResult(s, r[0], r[1], null);
      } catch (e) {
        return StoreResult(s, null, null, e);
      }
    }));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final repo = context.read<OwnerRepository>();
    final range = s.range;
    return PageScaffold(
      title: 'Store comparison',
      body: Loader<List<StoreResult>>(
        depsKey: '${s.stores.map((e) => e.id).join(',')}|${range.key}',
        load: (force) => load(repo, s.stores, range, force),
        builder: (context, results) => _Body(results: results),
      ),
    );
  }
}

class _Body extends StatefulWidget {
  const _Body({required this.results});

  final List<StoreResult> results;

  @override
  State<_Body> createState() => _BodyState();
}

class _BodyState extends State<_Body> {
  _Metric _metric = _Metric.revenue;

  double _value(StoreResult r) => switch (_metric) {
        _Metric.revenue => r.revenue,
        _Metric.profit => r.profit,
        _Metric.bills => (r.cur?.totalBills ?? 0).toDouble(),
        _Metric.avgBill => r.cur?.avgBill ?? 0,
        _Metric.expenses => r.expenses,
      };

  double _prevValue(StoreResult r) {
    final p = r.prev;
    if (p == null) return 0;
    return switch (_metric) {
      _Metric.revenue => p.totalRevenue,
      _Metric.profit => p.totalRevenue - p.totalExpenses,
      _Metric.bills => p.totalBills.toDouble(),
      _Metric.avgBill => p.avgBill,
      _Metric.expenses => p.totalExpenses,
    };
  }

  String _fmt(num v) => _metric == _Metric.bills ? Fmt.number(v) : Fmt.money(v);

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final session = context.read<Session>();
    final ok = widget.results.where((r) => r.cur != null).toList();
    final failed = widget.results.where((r) => r.cur == null).toList();
    final totalRev = ok.fold<double>(0, (s, r) => s + r.revenue);
    final totalExp = ok.fold<double>(0, (s, r) => s + r.expenses);
    final totalBills = ok.fold<int>(0, (s, r) => s + (r.cur?.totalBills ?? 0));
    final prevRev = ok.fold<double>(0, (s, r) => s + (r.prev?.totalRevenue ?? 0));
    final sorted = [...ok]..sort((a, b) => _value(b).compareTo(_value(a)));
    final maxV = sorted.isEmpty ? 0.0 : sorted.map(_value).fold<double>(0, (a, b) => a > b ? a : b);
    final revSorted = [...ok]..sort((a, b) => b.revenue.compareTo(a.revenue));

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
      children: [
        TileGrid(children: [
          KpiTile(label: 'Combined sales', value: totalRev, icon: Icons.payments_outlined, delta: pctChange(totalRev, prevRev), footnote: '${ok.length} stores'),
          KpiTile(label: 'Combined profit', value: totalRev - totalExp, icon: Icons.trending_up_rounded, showDelta: false, footnote: 'Sales − expenses'),
          KpiTile(label: 'Total bills', value: totalBills, money: false, icon: Icons.receipt_long_outlined, showDelta: false),
          KpiTile(label: 'Total expenses', value: totalExp, icon: Icons.wallet_outlined, showDelta: false),
        ]),
        const SizedBox(height: 12),
        if (revSorted.isNotEmpty && totalRev > 0)
          SectionCard(
            title: 'Share of sales',
            child: DonutChart(
              centerLabel: 'All stores',
              slices: [
                for (final sl in topWithOther(revSorted.map((r) => Slice(r.store.displayName, r.revenue, r.cur?.totalBills ?? 0)).toList(), 5))
                  DonutSlice(sl.key, sl.value, detail: '${sl.count} bills', isOther: sl.key == 'Other'),
              ],
            ),
          ),
        const SizedBox(height: 16),
        ChoiceChips<_Metric>(
          options: _Metric.values,
          selected: _metric,
          label: (m) => m.label,
          onSelected: (m) => setState(() => _metric = m),
        ),
        const SizedBox(height: 10),
        SectionCard(
          title: 'Ranking by ${_metric.label.toLowerCase()}',
          subtitle: 'Tap a store to open it',
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(
            children: [
              for (var i = 0; i < sorted.length; i++)
                InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () {
                    session.selectStore(sorted[i].store);
                    Navigator.of(context).popUntil((r) => r.isFirst);
                  },
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(
                      children: [
                        SizedBox(width: 22, child: Text('${i + 1}', style: context.text.labelLarge?.copyWith(color: c.textMuted))),
                        StoreAvatar(sorted[i].store, size: 36),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Expanded(
                                  child: Text(sorted[i].store.displayName,
                                      style: context.text.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                                ),
                                if (sorted[i].store.id == session.store?.id)
                                  Padding(padding: const EdgeInsets.only(left: 6), child: Pill('Viewing', color: c.accent)),
                              ]),
                              const SizedBox(height: 6),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: maxV > 0 ? (_value(sorted[i]) / maxV).clamp(0, 1).toDouble() : 0,
                                  minHeight: 5,
                                  backgroundColor: c.cardAlt,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              _fmt(_value(sorted[i])),
                              style: context.text.titleSmall?.copyWith(
                                color: _value(sorted[i]) < 0 ? StatusColors.down(context.brightness) : null,
                              ),
                            ),
                            const SizedBox(height: 2),
                            DeltaBadge(pctChange(_value(sorted[i]), _prevValue(sorted[i])), compact: true, invert: _metric == _Metric.expenses),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'Side by side',
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowHeight: 36,
              dataRowMinHeight: 40,
              dataRowMaxHeight: 48,
              horizontalMargin: 0,
              columnSpacing: 20,
              headingTextStyle: context.text.labelSmall?.copyWith(color: c.textMuted, fontWeight: FontWeight.w700),
              dataTextStyle: context.text.bodyMedium,
              columns: const [
                DataColumn(label: Text('Store')),
                DataColumn(label: Text('Sales'), numeric: true),
                DataColumn(label: Text('Bills'), numeric: true),
                DataColumn(label: Text('Avg. bill'), numeric: true),
                DataColumn(label: Text('Expenses'), numeric: true),
                DataColumn(label: Text('Profit'), numeric: true),
              ],
              rows: [
                for (final r in revSorted)
                  DataRow(cells: [
                    DataCell(ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 140),
                      child: Text(r.store.displayName, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                    )),
                    DataCell(Text(Fmt.money(r.revenue), softWrap: false)),
                    DataCell(Text(Fmt.number(r.cur!.totalBills), softWrap: false)),
                    DataCell(Text(Fmt.money(r.cur!.avgBill), softWrap: false)),
                    DataCell(Text(Fmt.money(r.expenses), softWrap: false)),
                    DataCell(Text(Fmt.money(r.profit), softWrap: false, style: TextStyle(fontWeight: FontWeight.w700, color: r.profit < 0 ? StatusColors.down(context.brightness) : null))),
                  ]),
              ],
            ),
          ),
        ),
        if (failed.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            'Couldn\'t load: ${failed.map((f) => f.store.displayName).join(', ')}. Pull down to retry.',
            style: context.text.bodySmall?.copyWith(color: c.textMuted),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}
