import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/date_range.dart';
import '../../core/format.dart';
import '../../data/analytics.dart';
import '../../data/owner_repository.dart';
import '../../models/catalog.dart';
import '../../models/reports.dart';
import '../../state/session.dart';
import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';
import '../../widgets/charts/charts.dart';
import '../../widgets/common.dart';
import '../../widgets/loader.dart';
import '../../widgets/page_scaffold.dart';

class ProductsData {
  final SalesProfitReport sales;
  final CategorySalesReport categorySales;
  final List<Category> categories;
  final List<MenuItem> items;

  ProductsData(this.sales, this.categorySales, this.categories, this.items);

  Map<String, SalesProfitRow> get salesById => {for (final r in sales.rows) r.itemId: r};
}

Future<ProductsData> loadProducts(OwnerRepository repo, String storeId, DateRange range, bool force) async {
  final r = await Future.wait<Object>([
    repo.salesProfit(storeId, range, force: force),
    repo.categorySales(storeId, range, force: force),
    repo.categories(storeId, force: force),
    repo.items(storeId, force: force),
  ]);
  return ProductsData(
    r[0] as SalesProfitReport,
    r[1] as CategorySalesReport,
    r[2] as List<Category>,
    r[3] as List<MenuItem>,
  );
}

class ProductsScreen extends StatelessWidget {
  const ProductsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final repo = context.read<OwnerRepository>();
    final store = s.store!;
    final range = s.range;
    return DefaultTabController(
      length: 3,
      child: PageScaffold(
        bottom: const TabBar(
          tabs: [Tab(text: 'Items'), Tab(text: 'Categories'), Tab(text: 'Menu')],
        ),
        body: Loader<ProductsData>(
          depsKey: '${store.id}|${range.key}',
          load: (force) => loadProducts(repo, store.id, range, force),
          skeleton: const ListSkeleton(),
          builder: (context, d) => TabBarView(
            children: [
              _ItemsTab(d: d),
              _CategoriesTab(d: d),
              _MenuTab(d: d),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- Items

enum ItemSort { revenue, qty, profit, margin, name }

extension ItemSortLabel on ItemSort {
  String get label => switch (this) {
        ItemSort.revenue => 'Revenue',
        ItemSort.qty => 'Qty sold',
        ItemSort.profit => 'Profit',
        ItemSort.margin => 'Margin',
        ItemSort.name => 'Name',
      };
}

class _ItemsTab extends StatefulWidget {
  const _ItemsTab({required this.d});

  final ProductsData d;

  @override
  State<_ItemsTab> createState() => _ItemsTabState();
}

class _ItemsTabState extends State<_ItemsTab> with AutomaticKeepAliveClientMixin {
  ItemSort _sort = ItemSort.revenue;
  String _q = '';
  bool _showUnsold = false;

  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final c = context.colors;
    final sp = widget.d.sales;
    final q = _q.toLowerCase();
    final rows = sp.rows.where((r) => q.isEmpty || r.name.toLowerCase().contains(q) || r.category.toLowerCase().contains(q)).toList();
    switch (_sort) {
      case ItemSort.revenue:
        rows.sort((a, b) => b.revenue.compareTo(a.revenue));
      case ItemSort.qty:
        rows.sort((a, b) => b.qtySold.compareTo(a.qtySold));
      case ItemSort.profit:
        rows.sort((a, b) => b.profit.compareTo(a.profit));
      case ItemSort.margin:
        rows.sort((a, b) => b.profitPercent.compareTo(a.profitPercent));
      case ItemSort.name:
        rows.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    }
    final soldIds = sp.rows.map((r) => r.itemId).toSet();
    final unsold = widget.d.items
        .where((i) => i.enabled && !soldIds.contains(i.id))
        .where((i) => q.isEmpty || i.name.toLowerCase().contains(q))
        .toList()
      ..sort((a, b) => a.name.compareTo(b.name));
    final maxMetric = rows.isEmpty
        ? 1.0
        : rows.map((r) => _metric(r)).fold<double>(0, (a, b) => a > b ? a : b);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        TileGrid(children: [
          KpiTile(label: 'Units sold', value: sp.unitsSold, money: false, icon: Icons.local_dining_outlined, showDelta: false),
          KpiTile(label: 'Items sold', value: sp.itemsSold, money: false, icon: Icons.restaurant_menu_rounded, showDelta: false, footnote: '${unsold.length} not sold'),
          KpiTile(label: 'Item revenue', value: sp.revenue, icon: Icons.payments_outlined, showDelta: false),
          KpiTile(
            label: 'Gross profit',
            value: sp.profit,
            icon: Icons.trending_up_rounded,
            showDelta: false,
            footnote: sp.itemsWithCostSold > 0 ? '${Fmt.percent(sp.trackedMargin)} margin on costed items' : 'Add item costs to see profit',
          ),
        ]),
        const SizedBox(height: 16),
        TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search items or categories'),
          onChanged: (v) => setState(() => _q = v),
        ),
        const SizedBox(height: 10),
        ChoiceChips<ItemSort>(
          options: ItemSort.values,
          selected: _sort,
          label: (s) => s.label,
          onSelected: (s) => setState(() => _sort = s),
        ),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          const EmptyState(icon: Icons.restaurant_menu_rounded, title: 'No item sales in this period')
        else
          SectionCard(
            padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
            child: Column(
              children: [
                for (var i = 0; i < rows.length; i++)
                  RankRow(
                    rank: i + 1,
                    title: rows[i].name,
                    subtitle: _subtitle(rows[i]),
                    value: _valueText(rows[i]),
                    share: maxMetric > 0 ? _metric(rows[i]) / maxMetric : 0,
                    onTap: () => showItemSheet(context, widget.d, rows[i].itemId, fallbackName: rows[i].name),
                  ),
              ],
            ),
          ),
        if (unsold.isNotEmpty) ...[
          const SizedBox(height: 16),
          SectionCard(
            title: 'Not sold in this period',
            subtitle: '${unsold.length} active menu items had no sales',
            trailing: IconButton(
              icon: Icon(_showUnsold ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: c.textMuted),
              onPressed: () => setState(() => _showUnsold = !_showUnsold),
            ),
            onTap: () => setState(() => _showUnsold = !_showUnsold),
            child: !_showUnsold
                ? const SizedBox.shrink()
                : Column(
                    children: [
                      for (final i in unsold)
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(i.name, style: context.text.bodyMedium),
                          subtitle: Text(i.categoryName.isEmpty ? 'Uncategorised' : i.categoryName, style: context.text.labelSmall),
                          trailing: Text(Fmt.money(i.price), style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                          onTap: () => showItemSheet(context, widget.d, i.id),
                        ),
                    ],
                  ),
          ),
        ],
      ],
    );
  }

  double _metric(SalesProfitRow r) => switch (_sort) {
        ItemSort.qty => r.qtySold.toDouble(),
        ItemSort.profit => r.profit < 0 ? 0 : r.profit,
        ItemSort.margin => r.profitPercent < 0 ? 0 : r.profitPercent,
        _ => r.revenue,
      };

  String _valueText(SalesProfitRow r) => switch (_sort) {
        ItemSort.qty => '${Fmt.number(r.qtySold)} sold',
        ItemSort.profit => r.hasCostData ? Fmt.money(r.profit) : '—',
        ItemSort.margin => r.hasCostData ? Fmt.percent(r.profitPercent) : '—',
        _ => Fmt.money(r.revenue),
      };

  String _subtitle(SalesProfitRow r) {
    final parts = <String>[r.category];
    if (_sort != ItemSort.qty) parts.add('${Fmt.number(r.qtySold)} sold');
    if (_sort != ItemSort.revenue && _sort != ItemSort.name) parts.add(Fmt.money(r.revenue));
    if (r.hasCostData && _sort != ItemSort.margin) parts.add('${Fmt.percent(r.profitPercent, digits: 0)} margin');
    return parts.join(' · ');
  }
}

/// Item detail: price, cost, sales in period.
Future<void> showItemSheet(BuildContext context, ProductsData d, String itemId, {String? fallbackName}) {
  final item = d.items.where((i) => i.id == itemId).firstOrNull;
  final sale = d.salesById[itemId];
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      final c = ctx.colors;
      final range = ctx.read<Session>().range;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: Text(item?.name ?? fallbackName ?? 'Item', style: ctx.text.titleLarge)),
                  if (item != null && !item.enabled) const Pill('Disabled', icon: Icons.visibility_off_outlined),
                  if (item?.isFavourite == true) ...[
                    const SizedBox(width: 6),
                    Icon(Icons.star_rounded, color: c.accent, size: 20),
                  ],
                ],
              ),
              const SizedBox(height: 2),
              Text(item?.categoryName.isNotEmpty == true ? item!.categoryName : (sale?.category ?? ''), style: ctx.text.bodySmall),
              if (item?.description.isNotEmpty == true) ...[
                const SizedBox(height: 8),
                Text(item!.description, style: ctx.text.bodyMedium?.copyWith(color: c.textSecondary)),
              ],
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: c.cardAlt, borderRadius: BorderRadius.circular(16)),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    StatPair('Price', item != null ? Fmt.money2(item.price) : '—'),
                    StatPair('Cost', item?.hasCost == true ? Fmt.money2(item!.totalCost) : '—'),
                    StatPair('Margin', item?.hasCost == true ? Fmt.percent(item!.profitPercent) : '—'),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Text('Sales · ${range.label}', style: ctx.text.titleSmall),
              const SizedBox(height: 4),
              InfoRow('Quantity sold', Fmt.number(sale?.qtySold ?? 0)),
              InfoRow('Revenue', Fmt.money(sale?.revenue ?? 0)),
              if (sale?.hasCostData == true) ...[
                InfoRow('Preparation cost', Fmt.money(sale!.prepCost)),
                InfoRow('Gross profit', Fmt.money(sale.profit), bold: true),
              ],
              if (item != null) ...[
                const Divider(height: 24),
                if (item.taxPercent > 0) InfoRow('GST', Fmt.percent(item.taxPercent, digits: 0)),
                if (item.hsnCode.isNotEmpty) InfoRow('HSN/SAC', item.hsnCode),
              ],
            ],
          ),
        ),
      );
    },
  );
}

// ----------------------------------------------------------- Categories

class _CategoriesTab extends StatelessWidget {
  const _CategoriesTab({required this.d});

  final ProductsData d;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final totals = {for (final t in d.categorySales.totals) t.categoryId: t};
    final itemCount = <String, int>{};
    for (final i in d.items) {
      itemCount[i.categoryId] = (itemCount[i.categoryId] ?? 0) + 1;
    }
    final cats = [...d.categories]
      ..sort((a, b) => (totals[b.id]?.revenue ?? 0).compareTo(totals[a.id]?.revenue ?? 0));
    final maxRev = d.categorySales.totals.isEmpty ? 1.0 : d.categorySales.totals.first.revenue;
    final slices = topWithOther(d.categorySales.totals.map((t) => Slice(t.category, t.revenue, t.count)).toList(), 5);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        SectionCard(
          title: 'Revenue by category',
          subtitle: '${d.categorySales.totals.length} categories sold · ${Fmt.number(d.categorySales.totalCount)} units',
          child: DonutChart(
            centerLabel: 'Menu sales',
            slices: [for (final s in slices) DonutSlice(s.key, s.value, detail: '${Fmt.number(s.count)} sold', isOther: s.key == 'Other')],
          ),
        ),
        const SizedBox(height: 12),
        SectionCard(
          title: 'All categories',
          subtitle: '${d.categories.length} categories · ${d.items.length} items',
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: d.categories.isEmpty
              ? const EmptyState(icon: Icons.category_outlined, title: 'No categories')
              : Column(
                  children: [
                    for (final cat in cats)
                      InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => _showCategory(context, cat, totals[cat.id]),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(color: c.accentSoft, borderRadius: BorderRadius.circular(12)),
                                child: Text(Fmt.initials(cat.name),
                                    style: context.text.labelLarge?.copyWith(color: c.accent, fontWeight: FontWeight.w800)),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(children: [
                                      Flexible(child: Text(cat.name, style: context.text.titleSmall, overflow: TextOverflow.ellipsis)),
                                      if (!cat.enabled) ...[const SizedBox(width: 6), const Pill('Disabled')],
                                    ]),
                                    const SizedBox(height: 2),
                                    Text(
                                      '${itemCount[cat.id] ?? 0} items · ${Fmt.number(totals[cat.id]?.count ?? 0)} sold',
                                      style: context.text.labelSmall?.copyWith(color: c.textMuted),
                                    ),
                                    const SizedBox(height: 6),
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(4),
                                      child: LinearProgressIndicator(
                                        minHeight: 4,
                                        value: maxRev > 0 ? ((totals[cat.id]?.revenue ?? 0) / maxRev).clamp(0, 1).toDouble() : 0,
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
                                  Text(Fmt.money(totals[cat.id]?.revenue ?? 0), style: context.text.titleSmall),
                                  Text(
                                    d.categorySales.totalRevenue > 0
                                        ? Fmt.percent((totals[cat.id]?.revenue ?? 0) / d.categorySales.totalRevenue * 100)
                                        : '0%',
                                    style: context.text.labelSmall?.copyWith(color: c.textMuted),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }

  void _showCategory(BuildContext context, Category cat, CategorySale? sale) {
    final items = d.items.where((i) => i.categoryId == cat.id).toList();
    final sales = d.salesById;
    items.sort((a, b) => (sales[b.id]?.revenue ?? 0).compareTo(sales[a.id]?.revenue ?? 0));
    final maxRev = items.isEmpty ? 0.0 : (sales[items.first.id]?.revenue ?? 0);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        maxChildSize: 0.95,
        builder: (ctx, ctrl) => ListView(
          controller: ctrl,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            Text(cat.name, style: ctx.text.titleLarge),
            if (cat.description.isNotEmpty) Text(cat.description, style: ctx.text.bodySmall),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: ctx.colors.cardAlt, borderRadius: BorderRadius.circular(16)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  StatPair('Items', '${items.length}'),
                  StatPair('Units sold', Fmt.number(sale?.count ?? 0)),
                  StatPair('Revenue', Fmt.money(sale?.revenue ?? 0)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < items.length; i++)
              RankRow(
                rank: i + 1,
                title: items[i].name,
                subtitle: '${Fmt.money(items[i].price)} · ${Fmt.number(sales[items[i].id]?.qtySold ?? 0)} sold',
                value: Fmt.money(sales[items[i].id]?.revenue ?? 0),
                share: maxRev > 0 ? (sales[items[i].id]?.revenue ?? 0) / maxRev : 0,
                onTap: () => showItemSheet(context, d, items[i].id),
              ),
          ],
        ),
      ),
    );
  }
}

// ----------------------------------------------------------------- Menu

class _MenuTab extends StatefulWidget {
  const _MenuTab({required this.d});

  final ProductsData d;

  @override
  State<_MenuTab> createState() => _MenuTabState();
}

class _MenuTabState extends State<_MenuTab> with AutomaticKeepAliveClientMixin {
  String _q = '';
  String? _cat;

  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final c = context.colors;
    final q = _q.toLowerCase();
    final cats = widget.d.categories;
    final items = widget.d.items
        .where((i) => _cat == null || i.categoryId == _cat)
        .where((i) => q.isEmpty || i.name.toLowerCase().contains(q))
        .toList();
    final byCat = <String, List<MenuItem>>{};
    for (final i in items) {
      byCat.putIfAbsent(i.categoryId, () => []).add(i);
    }
    final order = [
      ...cats.map((c) => c.id).where(byCat.containsKey),
      ...byCat.keys.where((k) => !cats.any((c) => c.id == k)),
    ];
    final enabled = widget.d.items.where((i) => i.enabled).length;
    final costed = widget.d.items.where((i) => i.hasCost).toList();
    final avgMargin = costed.isEmpty ? 0.0 : costed.fold<double>(0, (s, i) => s + i.profitPercent) / costed.length;
    final avgPrice = widget.d.items.isEmpty ? 0.0 : widget.d.items.fold<double>(0, (s, i) => s + i.price) / widget.d.items.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        SectionCard(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              StatPair('Active items', '$enabled / ${widget.d.items.length}'),
              StatPair('Avg. price', Fmt.money(avgPrice)),
              StatPair('Avg. margin', costed.isEmpty ? '—' : Fmt.percent(avgMargin)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search menu'),
          onChanged: (v) => setState(() => _q = v),
        ),
        const SizedBox(height: 10),
        ChoiceChips<String?>(
          options: [null, ...cats.map((c) => c.id)],
          selected: _cat,
          label: (id) => id == null ? 'All' : cats.firstWhere((c) => c.id == id).name,
          onSelected: (id) => setState(() => _cat = id),
        ),
        const SizedBox(height: 4),
        if (items.isEmpty) const EmptyState(icon: Icons.search_off_rounded, title: 'No menu items found'),
        for (final cid in order) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
            child: Text(
              '${cats.where((c) => c.id == cid).firstOrNull?.name ?? 'Uncategorised'} · ${byCat[cid]!.length}',
              style: context.text.labelLarge?.copyWith(color: c.textSecondary),
            ),
          ),
          SectionCard(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Column(
              children: [
                for (final i in byCat[cid]!)
                  ListTile(
                    onTap: () => showItemSheet(context, widget.d, i.id),
                    title: Row(children: [
                      Flexible(
                        child: Text(i.name,
                            style: context.text.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: i.enabled ? null : c.textMuted,
                            ),
                            overflow: TextOverflow.ellipsis),
                      ),
                      if (i.isFavourite) ...[const SizedBox(width: 4), Icon(Icons.star_rounded, size: 14, color: c.accent)],
                    ]),
                    subtitle: Text(
                      [
                        if (!i.enabled) 'Disabled',
                        if (i.hasCost) 'Cost ${Fmt.money(i.totalCost)}',
                        if (i.taxPercent > 0) 'GST ${Fmt.percent(i.taxPercent, digits: 0)}',
                      ].join(' · ').ifEmptyThen('No cost set'),
                      style: context.text.labelSmall?.copyWith(color: c.textMuted),
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(Fmt.money(i.price), style: context.text.titleSmall),
                        if (i.hasCost)
                          Text(
                            '${Fmt.percent(i.profitPercent, digits: 0)} margin',
                            style: context.text.labelSmall?.copyWith(
                              color: i.profitPercent >= 0 ? StatusColors.up(context.brightness) : StatusColors.down(context.brightness),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

extension on String {
  String ifEmptyThen(String other) => isEmpty ? other : this;
}
