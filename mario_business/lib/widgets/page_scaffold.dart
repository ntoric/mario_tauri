import 'package:flutter/material.dart';

import 'range_bar.dart';
import 'store_switcher.dart';

/// Standard tab page: store switcher in the app bar, optional period
/// filter underneath, and the body below.
class PageScaffold extends StatelessWidget {
  const PageScaffold({
    super.key,
    required this.body,
    this.showRange = true,
    this.actions,
    this.title,
    this.bottom,
  });

  final Widget body;
  final bool showRange;
  final List<Widget>? actions;

  /// Plain title instead of the store switcher (pushed sub-pages).
  final String? title;

  /// Extra widget under the period filter (e.g. tabs).
  final PreferredSizeWidget? bottom;

  @override
  Widget build(BuildContext context) {
    final rangeH = showRange ? 66.0 : 0.0;
    final extraH = bottom?.preferredSize.height ?? 0;
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        titleSpacing: title == null ? 12 : null,
        title: title != null ? StoreSwitcherTitle(title: title) : const StoreSwitcherTitle(),
        actions: [...?actions, const SizedBox(width: 8)],
        bottom: rangeH + extraH > 0
            ? PreferredSize(
                preferredSize: Size.fromHeight(rangeH + extraH),
                child: Column(
                  children: [
                    if (showRange) const Padding(padding: EdgeInsets.only(bottom: 8), child: RangeBar()),
                    if (bottom != null) bottom!,
                  ],
                ),
              )
            : null,
      ),
      body: body,
    );
  }
}
