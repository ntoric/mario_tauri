import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/date_range.dart';
import '../../data/owner_repository.dart';
import '../../state/session.dart';
import '../../widgets/loader.dart';
import '../../widgets/page_scaffold.dart';

/// Pushed report page: title + store, period filter, and a loader keyed on
/// store and period.
class ReportPage<T> extends StatelessWidget {
  const ReportPage({
    super.key,
    required this.title,
    required this.load,
    required this.builder,
    this.showRange = true,
    this.skeleton,
  });

  final String title;
  final Future<T> Function(OwnerRepository repo, String storeId, DateRange range, bool force) load;
  final Widget Function(BuildContext context, T data, DateRange range) builder;
  final bool showRange;
  final Widget? skeleton;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final repo = context.read<OwnerRepository>();
    final store = s.store;
    if (store == null) return const SizedBox.shrink();
    final range = s.range;
    return PageScaffold(
      title: title,
      showRange: showRange,
      body: Loader<T>(
        depsKey: showRange ? '${store.id}|${range.key}' : store.id,
        load: (force) => load(repo, store.id, range, force),
        skeleton: skeleton,
        builder: (context, d) => builder(context, d, range),
      ),
    );
  }
}

/// Standard padded report list.
class ReportList extends StatelessWidget {
  const ReportList({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          children[i],
        ],
      ],
    );
  }
}
