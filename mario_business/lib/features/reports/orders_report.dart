import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/date_range.dart';
import '../../core/format.dart';
import '../../data/owner_repository.dart';
import '../../models/sales.dart';
import '../../state/session.dart';
import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';
import '../../widgets/common.dart';
import '../../widgets/loader.dart';
import '../../widgets/page_scaffold.dart';

class _OrdersData {
  final List<Order> orders;
  final List<Order> live;
  final Map<String, String> names;
  _OrdersData(this.orders, this.live, this.names);
}

/// Staff id → name, provided to order tiles/sheets below the loader.
class _Names extends InheritedWidget {
  const _Names({required this.names, required super.child});

  final Map<String, String> names;

  static String of(BuildContext context, String id) =>
      context.getInheritedWidgetOfExactType<_Names>()?.names[id] ?? (id.isEmpty ? '' : 'Staff');

  @override
  bool updateShouldNotify(_Names old) => old.names != names;
}

/// Read-only order monitoring: open orders on the floor, completed and
/// cancelled orders for the period. No order actions are offered.
class OrdersReport extends StatelessWidget {
  const OrdersReport({super.key, this.initialLive = false});

  final bool initialLive;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final repo = context.read<OwnerRepository>();
    final store = s.store!;
    final range = s.range;
    return DefaultTabController(
      length: 2,
      initialIndex: initialLive ? 1 : 0,
      child: PageScaffold(
        title: 'Orders',
        bottom: const TabBar(tabs: [Tab(text: 'Period'), Tab(text: 'Open now')]),
        body: Loader<_OrdersData>(
          depsKey: '${store.id}|${range.key}',
          load: (force) async {
            final r = await Future.wait<Object>([
              repo.orders(store.id, range, force: force),
              repo.liveOrders(store.id, force: force),
              repo.userNames(force: force),
            ]);
            return _OrdersData(r[0] as List<Order>, r[1] as List<Order>, r[2] as Map<String, String>);
          },
          skeleton: const ListSkeleton(),
          builder: (context, d) => _Names(
            names: d.names,
            child: TabBarView(children: [
              _PeriodTab(orders: d.orders, range: range),
              _LiveTab(orders: d.live),
            ]),
          ),
        ),
      ),
    );
  }
}

class _PeriodTab extends StatefulWidget {
  const _PeriodTab({required this.orders, required this.range});

  final List<Order> orders;
  final DateRange range;

  @override
  State<_PeriodTab> createState() => _PeriodTabState();
}

class _PeriodTabState extends State<_PeriodTab> with AutomaticKeepAliveClientMixin {
  String? _status;

  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final c = context.colors;
    final b = context.brightness;
    final all = widget.orders;
    final count = <String, int>{};
    final value = <String, double>{};
    for (final o in all) {
      count[o.status] = (count[o.status] ?? 0) + 1;
      value[o.status] = (value[o.status] ?? 0) + o.value;
    }
    final cancelled = count['cancelled'] ?? 0;
    final rate = all.isEmpty ? 0.0 : cancelled / all.length * 100;
    final statuses = count.keys.toList()..sort((a, b) => count[b]!.compareTo(count[a]!));
    final list = all.where((o) => _status == null || o.status == _status).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        TileGrid(children: [
          KpiTile(label: 'Orders', value: all.length, money: false, icon: Icons.receipt_long_outlined, showDelta: false, footnote: all.length >= 1000 ? 'Showing latest 1000' : null),
          KpiTile(label: 'Completed', value: count['completed'] ?? 0, money: false, icon: Icons.check_circle_outline_rounded, showDelta: false, footnote: Fmt.money(value['completed'] ?? 0)),
          KpiTile(label: 'Cancelled', value: cancelled, money: false, icon: Icons.cancel_outlined, showDelta: false, footnote: '${Fmt.money(value['cancelled'] ?? 0)} lost'),
          KpiTile(label: 'Cancellation rate', value: rate, display: Fmt.percent(rate), icon: Icons.percent_rounded, showDelta: false),
        ]),
        if (cancelled > 0 && rate >= 5) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: StatusColors.warning.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(16)),
            child: Row(children: [
              const Icon(Icons.warning_amber_rounded, size: 20, color: StatusColors.warning),
              const SizedBox(width: 10),
              Expanded(
                child: Text('${Fmt.percent(rate)} of orders were cancelled in this period. Review them below.',
                    style: context.text.bodySmall?.copyWith(color: c.textPrimary)),
              ),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        ChoiceChips<String?>(
          options: [null, ...statuses],
          selected: _status,
          label: (s) => s == null ? 'All (${all.length})' : '${Fmt.label(s)} (${count[s]})',
          onSelected: (s) => setState(() => _status = s),
        ),
        const SizedBox(height: 10),
        if (list.isEmpty)
          const EmptyState(icon: Icons.receipt_long_outlined, title: 'No orders in this period')
        else
          SectionCard(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
            child: Column(children: [for (final o in list) OrderTile(order: o, statusColor: _statusColor(o.status, b, c))]),
          ),
      ],
    );
  }
}

Color _statusColor(String s, Brightness b, AppColors c) => switch (s) {
      'completed' || 'paid' => StatusColors.up(b),
      'cancelled' => StatusColors.down(b),
      'active' || 'open' => c.accent,
      _ => c.textSecondary,
    };

class _LiveTab extends StatelessWidget {
  const _LiveTab({required this.orders});

  final List<Order> orders;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final total = orders.fold<double>(0, (s, o) => s + o.value);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
      children: [
        SectionCard(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              StatPair('Open orders', '${orders.length}'),
              StatPair('Items', Fmt.number(orders.fold(0, (s, o) => s + o.itemCount))),
              StatPair('Not yet billed', Fmt.money(total)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
          child: Text('Pull down to refresh', style: context.text.labelSmall?.copyWith(color: c.textMuted)),
        ),
        if (orders.isEmpty)
          const EmptyState(icon: Icons.table_restaurant_outlined, title: 'No open orders', message: 'All tables are clear right now.')
        else
          SectionCard(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
            child: Column(children: [for (final o in orders) OrderTile(order: o, statusColor: c.accent, showAge: true)]),
          ),
      ],
    );
  }
}

class OrderTile extends StatelessWidget {
  const OrderTile({super.key, required this.order, required this.statusColor, this.showAge = false});

  final Order order;
  final Color statusColor;
  final bool showAge;

  String _age() {
    final m = DateTime.now().difference(order.createdAt).inMinutes;
    if (m < 1) return 'just now';
    if (m < 60) return '$m min';
    return '${m ~/ 60}h ${m % 60}m';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => _showOrder(context, order, statusColor),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: c.cardAlt, borderRadius: BorderRadius.circular(12)),
            alignment: Alignment.center,
            child: Text(
              order.tableNumber > 0 ? 'T${order.tableNumber}' : 'P',
              style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w800, color: c.textSecondary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(order.tableLabel, style: context.text.titleSmall),
              Text(
                '${order.itemCount} items · ${showAge ? 'open ${_age()}' : Fmt.dateTime(order.createdAt)}',
                style: context.text.labelSmall?.copyWith(color: c.textMuted),
              ),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(Fmt.money(order.value), style: context.text.titleSmall),
            const SizedBox(height: 2),
            Pill(Fmt.label(order.status), color: statusColor),
          ]),
        ]),
      ),
    );
  }
}

void _showOrder(BuildContext context, Order o, Color statusColor) {
  final takenBy = _Names.of(context, o.createdBy);
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.95,
      builder: (ctx, ctrl) => ListView(
        controller: ctrl,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        children: [
          Row(children: [
            Expanded(child: Text(o.tableLabel, style: ctx.text.titleLarge)),
            Pill(Fmt.label(o.status), color: statusColor),
          ]),
          Text(Fmt.dateTime(o.createdAt), style: ctx.text.bodySmall),
          const SizedBox(height: 14),
          for (final i in o.items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(i.name, style: ctx.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                    Text('${i.quantity} × ${Fmt.money2(i.unitPrice)}${i.notes.isNotEmpty ? ' · ${i.notes}' : ''}',
                        style: ctx.text.labelSmall?.copyWith(color: ctx.colors.textMuted)),
                  ]),
                ),
                Text(Fmt.money2(i.amount), style: ctx.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
              ]),
            ),
          const Divider(height: 24),
          if (o.discountAmount > 0) InfoRow('Discount', '− ${Fmt.money2(o.discountAmount)}'),
          if (o.taxAmount > 0) InfoRow('Tax', Fmt.money2(o.taxAmount)),
          InfoRow('Total', Fmt.money2(o.value), bold: true),
          const Divider(height: 24),
          if (o.paymentMethod.isNotEmpty) InfoRow('Payment', Fmt.label(o.paymentMethod)),
          if (o.orderSource.isNotEmpty) InfoRow('Source', Fmt.label(o.orderSource)),
          if (o.customerName.isNotEmpty) InfoRow('Customer', o.customerName),
          if (takenBy.isNotEmpty) InfoRow('Taken by', takenBy),
          if (o.cancelledAt != null) InfoRow('Cancelled at', Fmt.dateTime(o.cancelledAt!)),
        ],
      ),
    ),
  );
}
