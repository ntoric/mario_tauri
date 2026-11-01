import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../theme/app_theme.dart';
import 'common.dart';

/// Tappable store name for app bars; opens the store picker.
class StoreSwitcherTitle extends StatelessWidget {
  const StoreSwitcherTitle({super.key, this.subtitle, this.title});

  final String? subtitle;

  /// Page title for pushed sub-pages; the store name moves underneath.
  final String? title;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final store = s.store;
    final c = context.colors;
    final canSwitch = s.stores.length > 1;
    if (title != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title!, style: context.text.titleLarge, overflow: TextOverflow.ellipsis),
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => showStorePicker(context),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Flexible(
                child: Text(store?.displayName ?? '',
                    style: context.text.labelMedium?.copyWith(color: c.textMuted), overflow: TextOverflow.ellipsis),
              ),
              Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: c.textMuted),
            ]),
          ),
        ],
      );
    }
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => showStorePicker(context),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            StoreAvatar(store, size: 36),
            const SizedBox(width: 10),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          store?.name ?? 'No store',
                          style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      Icon(Icons.keyboard_arrow_down_rounded, size: 20, color: canSwitch ? c.textPrimary : c.textMuted),
                    ],
                  ),
                  Text(
                    subtitle ?? (store?.branch.isNotEmpty == true ? store!.branch : '${s.stores.length} store${s.stores.length == 1 ? '' : 's'}'),
                    style: context.text.labelSmall?.copyWith(color: c.textMuted),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> showStorePicker(BuildContext context) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => const _StorePickerSheet(),
  );
}

class _StorePickerSheet extends StatefulWidget {
  const _StorePickerSheet();

  @override
  State<_StorePickerSheet> createState() => _StorePickerSheetState();
}

class _StorePickerSheetState extends State<_StorePickerSheet> {
  String _query = '';
  bool _refreshing = false;

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    try {
      await context.read<Session>().refreshStores();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final c = context.colors;
    final q = _query.toLowerCase();
    final list = s.stores
        .where((st) => q.isEmpty || st.name.toLowerCase().contains(q) || st.branch.toLowerCase().contains(q) || st.location.toLowerCase().contains(q))
        .toList();
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 12, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Switch store', style: context.text.titleLarge),
                        const SizedBox(height: 2),
                        Text('Stores assigned to you by your administrator', style: context.text.bodySmall),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Refresh store list',
                    onPressed: _refreshing ? null : _refresh,
                    icon: _refreshing
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
            ),
            if (s.stores.length > 5)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: TextField(
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Search stores'),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
            const SizedBox(height: 8),
            Flexible(
              child: list.isEmpty
                  ? const EmptyState(icon: Icons.storefront_outlined, title: 'No stores found')
                  : ListView.separated(
                      shrinkWrap: true,
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (_, i) {
                        final st = list[i];
                        final selected = st.id == s.store?.id;
                        return Material(
                          color: selected ? c.accentSoft : Colors.transparent,
                          borderRadius: BorderRadius.circular(16),
                          child: ListTile(
                            onTap: () {
                              s.selectStore(st);
                              Navigator.pop(context);
                            },
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            leading: StoreAvatar(st, size: 44),
                            title: Text(st.name, style: context.text.titleSmall),
                            subtitle: Text(
                              [st.branch, st.location].where((e) => e.isNotEmpty).join(' · ').ifEmpty('—'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: context.text.bodySmall,
                            ),
                            trailing: selected
                                ? Icon(Icons.check_circle_rounded, color: c.accent)
                                : Icon(Icons.chevron_right_rounded, color: c.textMuted),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}
