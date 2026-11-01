import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/date_range.dart';
import '../state/session.dart';
import '../theme/app_theme.dart';

const _quickPresets = [
  RangePreset.today,
  RangePreset.yesterday,
  RangePreset.last7,
  RangePreset.last30,
  RangePreset.thisMonth,
  RangePreset.lastMonth,
  RangePreset.thisYear,
];

/// One-row period filter shared by every screen: preset chips plus a
/// custom-range button. Changing it updates all screens.
class RangeBar extends StatelessWidget {
  const RangeBar({super.key});

  Future<void> _pickCustom(BuildContext context) async {
    final s = context.read<Session>();
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: DateTimeRange(start: s.range.start, end: s.range.end),
      helpText: 'Select report period',
      saveText: 'Apply',
    );
    if (picked != null) s.setRange(DateRange.custom(picked.start, picked.end));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final c = context.colors;
    final current = s.range;
    return SizedBox(
      height: 40,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _Chip(
            label: current.preset == RangePreset.custom ? current.label : 'Custom',
            icon: Icons.calendar_month_rounded,
            selected: current.preset == RangePreset.custom,
            onTap: () => _pickCustom(context),
          ),
          for (final p in _quickPresets)
            _Chip(label: p.label, selected: current.preset == p, onTap: () => s.setRange(DateRange.preset(p))),
          const SizedBox(width: 4),
        ].map((w) => Padding(padding: const EdgeInsets.only(right: 8), child: w)).toList(),
      ),
    ).withBottom(
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
        child: Text(current.subtitle, style: context.text.labelSmall?.copyWith(color: c.textMuted)),
      ),
    );
  }
}

extension on Widget {
  Widget withBottom(Widget bottom) => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [this, bottom]);
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap, this.icon});

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: selected ? c.accent : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: selected ? c.accent : c.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 16, color: selected ? Theme.of(context).colorScheme.onPrimary : c.textSecondary),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: context.text.labelLarge?.copyWith(
                  color: selected ? Theme.of(context).colorScheme.onPrimary : c.textSecondary,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
