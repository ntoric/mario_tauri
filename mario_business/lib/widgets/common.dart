import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../models/store.dart';
import '../theme/app_theme.dart';
import '../theme/palettes.dart';
import '../theme/theme_controller.dart';

/// Card with an optional header row.
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    this.title,
    this.subtitle,
    this.trailing,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
  });

  final String? title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: c.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: padding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (title != null) ...[
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(title!, style: context.text.titleMedium),
                          if (subtitle != null) ...[
                            const SizedBox(height: 2),
                            Text(subtitle!, style: context.text.bodySmall?.copyWith(color: c.textMuted)),
                          ],
                        ],
                      ),
                    ),
                    if (trailing != null) trailing!,
                  ],
                ),
                const SizedBox(height: 16),
              ],
              child,
            ],
          ),
        ),
      ),
    );
  }
}

/// Up/down change versus the previous period. Colour is backed by an arrow
/// and a sign so it never carries meaning alone.
class DeltaBadge extends StatelessWidget {
  const DeltaBadge(this.pct, {super.key, this.invert = false, this.compact = false});

  final double? pct;

  /// For costs, going up is bad.
  final bool invert;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (pct == null) {
      return Text('New', style: context.text.labelSmall?.copyWith(color: c.textMuted, fontWeight: FontWeight.w600));
    }
    final v = pct!;
    final flat = v.abs() < 0.05;
    final good = invert ? v < 0 : v > 0;
    final color = flat ? c.textMuted : (good ? StatusColors.up(context.brightness) : StatusColors.down(context.brightness));
    final icon = flat ? Icons.remove_rounded : (v > 0 ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded);
    final txt = '${v.abs() >= 1000 ? '999+' : v.abs().toStringAsFixed(v.abs() >= 100 ? 0 : 1)}%';
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 5 : 7, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: compact ? 11 : 13, color: color),
          const SizedBox(width: 2),
          Text(txt, style: context.text.labelSmall?.copyWith(color: color, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Headline number tile.
class KpiTile extends StatelessWidget {
  const KpiTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.delta,
    this.invertDelta = false,
    this.footnote,
    this.money = true,
    this.onTap,
    this.showDelta = true,
    this.display,
  });

  final String label;
  final num value;

  /// Pre-formatted value (overrides money/number formatting).
  final String? display;
  final IconData icon;
  final double? delta;
  final bool invertDelta;
  final String? footnote;
  final bool money;
  final bool showDelta;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final compact = context.watch<ThemeController>().compactNumbers;
    final text = display != null
        ? display!
        : money
        ? (compact ? Fmt.compactMoney(value) : Fmt.money(value))
        : (compact ? Fmt.compact(value) : Fmt.number(value));
    return SectionCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: c.accentSoft, borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, size: 17, color: c.accent),
              ),
              const Spacer(),
              if (showDelta) DeltaBadge(delta, invert: invertDelta, compact: true),
            ],
          ),
          const SizedBox(height: 14),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(text, style: context.text.titleLarge?.copyWith(fontSize: 21, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 2),
          Text(label, style: context.text.bodySmall?.copyWith(color: c.textSecondary), maxLines: 1, overflow: TextOverflow.ellipsis),
          if (footnote != null) ...[
            const SizedBox(height: 2),
            Text(footnote!, style: context.text.labelSmall?.copyWith(color: c.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ],
      ),
    );
  }
}

/// Two-column responsive grid of tiles.
class TileGrid extends StatelessWidget {
  const TileGrid({super.key, required this.children, this.spacing = 12});

  final List<Widget> children;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final cols = box.maxWidth > 700 ? 4 : 2;
      final w = (box.maxWidth - spacing * (cols - 1)) / cols;
      return Wrap(
        spacing: spacing,
        runSpacing: spacing,
        children: [for (final c in children) SizedBox(width: w, child: c)],
      );
    });
  }
}

/// Small label/value pair used in summary rows.
class StatPair extends StatelessWidget {
  const StatPair(this.label, this.value, {super.key, this.align = CrossAxisAlignment.start});

  final String label;
  final String value;
  final CrossAxisAlignment align;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: align,
      children: [
        Text(label, style: context.text.labelSmall?.copyWith(color: context.colors.textMuted)),
        const SizedBox(height: 3),
        Text(value, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
      ],
    );
  }
}

/// Key/value line inside detail sheets.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.bold = false, this.valueColor});

  final String label;
  final String value;
  final bool bold;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final style = bold ? context.text.titleSmall : context.text.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: context.text.bodyMedium?.copyWith(color: context.colors.textSecondary))),
          const SizedBox(width: 12),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.right,
                style: style?.copyWith(fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: valueColor)),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.message, this.action});

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(color: c.cardAlt, shape: BoxShape.circle),
            child: Icon(icon, size: 28, color: c.textMuted),
          ),
          const SizedBox(height: 14),
          Text(title, style: context.text.titleMedium, textAlign: TextAlign.center),
          if (message != null) ...[
            const SizedBox(height: 6),
            Text(message!, style: context.text.bodySmall, textAlign: TextAlign.center),
          ],
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final forbidden = error is ApiException && (error as ApiException).isForbidden;
    return EmptyState(
      icon: forbidden ? Icons.lock_outline_rounded : Icons.cloud_off_rounded,
      title: forbidden ? 'No access to this store' : 'Couldn\'t load data',
      message: forbidden
          ? 'This store is no longer assigned to you. Ask your administrator, or pull down to refresh your store list.'
          : error.toString(),
      action: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(minimumSize: const Size(140, 44)),
        onPressed: onRetry,
        icon: const Icon(Icons.refresh_rounded, size: 18),
        label: const Text('Try again'),
      ),
    );
  }
}

/// Pulsing placeholder block.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({super.key, this.height = 16, this.width, this.radius = 12});

  final double height;
  final double? width;
  final double radius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = context.colors.cardAlt;
    final hi = context.colors.border;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Container(
        height: widget.height,
        width: widget.width,
        decoration: BoxDecoration(
          color: Color.lerp(base, hi, _c.value),
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
  }
}

class DefaultSkeleton extends StatelessWidget {
  const DefaultSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(children: [
          Expanded(child: SkeletonBox(height: 118, radius: 20)),
          SizedBox(width: 12),
          Expanded(child: SkeletonBox(height: 118, radius: 20)),
        ]),
        SizedBox(height: 12),
        Row(children: [
          Expanded(child: SkeletonBox(height: 118, radius: 20)),
          SizedBox(width: 12),
          Expanded(child: SkeletonBox(height: 118, radius: 20)),
        ]),
        SizedBox(height: 16),
        SkeletonBox(height: 260, radius: 20),
        SizedBox(height: 16),
        SkeletonBox(height: 200, radius: 20),
      ],
    );
  }
}

class ListSkeleton extends StatelessWidget {
  const ListSkeleton({super.key, this.rows = 8});

  final int rows;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < rows; i++) ...[
          const SkeletonBox(height: 68, radius: 16),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

/// Store logo (base64 data URL or remote URL) with an initials fallback.
class StoreAvatar extends StatelessWidget {
  const StoreAvatar(this.store, {super.key, this.size = 40});

  final Store? store;
  final double size;

  static final Map<String, Uint8List?> _decoded = {};

  Uint8List? _bytes(String raw) {
    return _decoded.putIfAbsent(raw, () {
      try {
        final data = raw.contains(',') ? raw.substring(raw.indexOf(',') + 1) : raw;
        return base64Decode(data);
      } catch (_) {
        return null;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final logo = store?.logoUrl ?? '';
    Widget? image;
    if (logo.startsWith('http')) {
      image = Image.network(logo, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox());
    } else if (logo.isNotEmpty) {
      final b = _bytes(logo);
      if (b != null) image = Image.memory(b, fit: BoxFit.cover, gaplessPlayback: true, errorBuilder: (_, __, ___) => const SizedBox());
    }
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: c.accentSoft,
        borderRadius: BorderRadius.circular(size * 0.3),
        border: Border.all(color: c.border),
      ),
      clipBehavior: Clip.antiAlias,
      alignment: Alignment.center,
      child: image ??
          Text(Fmt.initials(store?.name ?? '?'),
              style: TextStyle(color: c.accent, fontWeight: FontWeight.w800, fontSize: size * 0.36)),
    );
  }
}

/// Rounded tag.
class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color, this.icon});

  final String text;
  final Color? color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final col = color ?? context.colors.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: col.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 12, color: col), const SizedBox(width: 4)],
        Text(text, style: context.text.labelSmall?.copyWith(color: col, fontWeight: FontWeight.w700)),
      ]),
    );
  }
}

/// Section heading between cards.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
      child: Row(
        children: [
          Expanded(child: Text(title, style: context.text.titleMedium)),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(action!, style: context.text.labelLarge?.copyWith(color: context.colors.accent)),
            ),
        ],
      ),
    );
  }
}

/// Ranked row with a share bar — used for top items, categories, staff.
class RankRow extends StatelessWidget {
  const RankRow({
    super.key,
    required this.rank,
    required this.title,
    this.subtitle,
    required this.value,
    required this.share,
    this.color,
    this.onTap,
  });

  final int rank;
  final String title;
  final String? subtitle;
  final String value;

  /// 0..1 of the largest row.
  final double share;
  final Color? color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final barColor = color ?? c.accent;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            SizedBox(
              width: 26,
              child: Text('$rank', style: context.text.labelLarge?.copyWith(color: c.textMuted)),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(title,
                            style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                      ),
                      const SizedBox(width: 8),
                      Text(value, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                    ],
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: context.text.labelSmall?.copyWith(color: c.textMuted)),
                  ],
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: share.clamp(0, 1).toDouble(),
                      minHeight: 5,
                      backgroundColor: c.cardAlt,
                      valueColor: AlwaysStoppedAnimation(barColor),
                    ),
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

/// Toggle row of options (segment control) that scrolls horizontally.
class ChoiceChips<T> extends StatelessWidget {
  const ChoiceChips({super.key, required this.options, required this.selected, required this.label, required this.onSelected});

  final List<T> options;
  final T selected;
  final String Function(T) label;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final o in options)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: _Pill(label: label(o), selected: o == selected, onTap: () => onSelected(o)),
            ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: selected ? c.accentSoft : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: selected ? c.accent : c.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            softWrap: false,
            style: context.text.labelLarge?.copyWith(
              color: selected ? c.accent : c.textSecondary,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
