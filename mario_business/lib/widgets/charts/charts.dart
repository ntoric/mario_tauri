import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';

/// Axis top with four evenly spaced, round ticks (e.g. 0/2K/4K/6K/8K).
double _niceMax(double v) {
  if (v <= 0) return 4;
  final step = v / 4;
  final exp = math.pow(10, (math.log(step) / math.ln10).floor()).toDouble();
  final f = step / exp;
  final nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * exp * 4;
}

TextStyle _axisStyle(BuildContext context) =>
    context.text.labelSmall!.copyWith(color: context.colors.textMuted, fontSize: 10, fontWeight: FontWeight.w500);

/// A named series for [TrendChart].
class TrendSeries {
  final String name;
  final List<double> values;
  final Color color;
  final bool filled;
  const TrendSeries(this.name, this.values, this.color, {this.filled = false});
}

/// Line chart over time (one shared money axis). Crosshair tooltip shows
/// every series for the touched x.
class TrendChart extends StatelessWidget {
  const TrendChart({
    super.key,
    required this.labels,
    required this.series,
    this.height = 220,
    this.valueFormat = Fmt.compactMoney,
    this.tooltipFormat = Fmt.money,
  });

  /// Tooltip / axis label for each x index.
  final List<String> labels;
  final List<TrendSeries> series;
  final double height;
  final String Function(num) valueFormat;
  final String Function(num) tooltipFormat;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final n = labels.length;
    final maxV = series.expand((s) => s.values).fold<double>(0, math.max);
    final top = _niceMax(maxV);
    final labelEvery = n <= 8 ? 1 : (n / 6).ceil();

    return SizedBox(
      height: height,
      child: LineChart(
        LineChartData(
          minX: 0,
          maxX: math.max(0, n - 1).toDouble(),
          minY: 0,
          maxY: top,
          gridData: FlGridData(
            drawVerticalLine: false,
            horizontalInterval: top / 4,
            getDrawingHorizontalLine: (_) => FlLine(color: c.grid, strokeWidth: 1),
          ),
          borderData: FlBorderData(show: false),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 44,
                interval: top / 4,
                getTitlesWidget: (v, meta) => SideTitleWidget(
                  meta: meta,
                  child: Text(valueFormat(v), style: _axisStyle(context)),
                ),
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 26,
                interval: 1,
                getTitlesWidget: (v, meta) {
                  final i = v.round();
                  if (i < 0 || i >= n || v != i.toDouble()) return const SizedBox();
                  if (i % labelEvery != 0 && i != n - 1) return const SizedBox();
                  if (i == n - 1 && i % labelEvery != 0 && (n - 1) % labelEvery < labelEvery / 2) return const SizedBox();
                  return SideTitleWidget(meta: meta, child: Text(labels[i], style: _axisStyle(context)));
                },
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            handleBuiltInTouches: true,
            getTouchedSpotIndicator: (bar, idx) => idx
                .map((_) => TouchedSpotIndicatorData(
                      FlLine(color: c.textMuted.withValues(alpha: 0.5), strokeWidth: 1),
                      FlDotData(
                        getDotPainter: (s, p, b, i) => FlDotCirclePainter(
                          radius: 4.5,
                          color: b.color ?? c.accent,
                          strokeWidth: 2,
                          strokeColor: c.card,
                        ),
                      ),
                    ))
                .toList(),
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => c.cardAlt,
              tooltipBorder: BorderSide(color: c.border),
              tooltipBorderRadius: BorderRadius.circular(10),
              fitInsideHorizontally: true,
              fitInsideVertically: true,
              getTooltipItems: (spots) => spots.map((s) {
                final ser = series[s.barIndex];
                final isFirst = s == spots.first;
                return LineTooltipItem(
                  isFirst ? '${labels[s.x.round()]}\n' : '',
                  context.text.labelSmall!.copyWith(color: c.textMuted, fontWeight: FontWeight.w600),
                  textAlign: TextAlign.left,
                  children: [
                    TextSpan(text: '● ', style: TextStyle(color: ser.color, fontSize: 11)),
                    TextSpan(
                      text: series.length > 1 ? '${ser.name}  ' : '',
                      style: context.text.labelSmall!.copyWith(color: c.textSecondary),
                    ),
                    TextSpan(
                      text: tooltipFormat(s.y),
                      style: context.text.labelMedium!.copyWith(color: c.textPrimary, fontWeight: FontWeight.w700),
                    ),
                  ],
                );
              }).toList(),
            ),
          ),
          lineBarsData: [
            for (final s in series)
              LineChartBarData(
                spots: [for (var i = 0; i < s.values.length; i++) FlSpot(i.toDouble(), s.values[i])],
                color: s.color,
                barWidth: 2,
                isCurved: true,
                curveSmoothness: 0.25,
                preventCurveOverShooting: true,
                isStrokeCapRound: true,
                dotData: FlDotData(show: n == 1),
                belowBarData: BarAreaData(
                  show: s.filled,
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [s.color.withValues(alpha: 0.22), s.color.withValues(alpha: 0.0)],
                  ),
                ),
              ),
          ],
        ),
        duration: const Duration(milliseconds: 250),
      ),
    );
  }
}

/// Vertical bars for one series (e.g. revenue by hour). Bars share one
/// colour; the highlighted index (peak) is drawn at full strength and the
/// rest slightly muted.
class ColumnChart extends StatelessWidget {
  const ColumnChart({
    super.key,
    required this.labels,
    required this.values,
    this.tooltipLabels,
    this.height = 200,
    this.highlight,
    this.color,
    this.labelEvery,
    this.valueFormat = Fmt.compactMoney,
    this.tooltipFormat = Fmt.money,
  });

  final List<String> labels;
  final List<double> values;

  /// Longer per-bar text for tooltips (defaults to [labels]).
  final List<String>? tooltipLabels;
  final double height;
  final int? highlight;
  final Color? color;
  final int? labelEvery;
  final String Function(num) valueFormat;
  final String Function(num) tooltipFormat;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final col = color ?? c.accent;
    final n = values.length;
    final top = _niceMax(values.fold<double>(0, math.max));
    final every = labelEvery ?? (n <= 8 ? 1 : (n / 6).ceil());

    return SizedBox(
      height: height,
      child: LayoutBuilder(builder: (context, box) {
        final barW = ((box.maxWidth - 44) / math.max(1, n) * 0.62).clamp(3.0, 28.0);
        return BarChart(
          BarChartData(
            maxY: top,
            minY: 0,
            alignment: BarChartAlignment.spaceAround,
            gridData: FlGridData(
              drawVerticalLine: false,
              horizontalInterval: top / 4,
              getDrawingHorizontalLine: (_) => FlLine(color: c.grid, strokeWidth: 1),
            ),
            borderData: FlBorderData(show: false),
            titlesData: FlTitlesData(
              topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
              leftTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  reservedSize: 44,
                  interval: top / 4,
                  getTitlesWidget: (v, meta) =>
                      SideTitleWidget(meta: meta, child: Text(valueFormat(v), style: _axisStyle(context))),
                ),
              ),
              bottomTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  reservedSize: 24,
                  getTitlesWidget: (v, meta) {
                    final i = v.round();
                    if (i < 0 || i >= n || i % every != 0) return const SizedBox();
                    return SideTitleWidget(meta: meta, child: Text(labels[i], style: _axisStyle(context)));
                  },
                ),
              ),
            ),
            barTouchData: BarTouchData(
              touchTooltipData: BarTouchTooltipData(
                getTooltipColor: (_) => c.cardAlt,
                tooltipBorder: BorderSide(color: c.border),
                tooltipBorderRadius: BorderRadius.circular(10),
                fitInsideHorizontally: true,
                fitInsideVertically: true,
                getTooltipItem: (group, gi, rod, ri) => BarTooltipItem(
                  '${(tooltipLabels ?? labels)[group.x]}\n',
                  context.text.labelSmall!.copyWith(color: c.textMuted, fontWeight: FontWeight.w600),
                  children: [
                    TextSpan(
                      text: tooltipFormat(rod.toY),
                      style: context.text.labelMedium!.copyWith(color: c.textPrimary, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ),
            barGroups: [
              for (var i = 0; i < n; i++)
                BarChartGroupData(x: i, barRods: [
                  BarChartRodData(
                    toY: values[i],
                    width: barW,
                    color: highlight == null || highlight == i ? col : col.withValues(alpha: 0.45),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                  ),
                ]),
            ],
          ),
          duration: const Duration(milliseconds: 250),
        );
      }),
    );
  }
}

/// A slice for [DonutChart].
class DonutSlice {
  final String label;
  final double value;
  final String? detail;
  final bool isOther;
  const DonutSlice(this.label, this.value, {this.detail, this.isOther = false});
}

/// Part-to-whole donut (≤ 6 slices) with a legend that repeats every value,
/// so identity never depends on colour alone.
class DonutChart extends StatefulWidget {
  const DonutChart({
    super.key,
    required this.slices,
    this.centerLabel,
    this.centerValue,
    this.valueFormat = Fmt.money,
    this.size = 168,
  });

  final List<DonutSlice> slices;
  final String? centerLabel;
  final String? centerValue;
  final String Function(num) valueFormat;
  final double size;

  @override
  State<DonutChart> createState() => _DonutChartState();
}

class _DonutChartState extends State<DonutChart> {
  int? _touched;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final b = context.brightness;
    final total = widget.slices.fold<double>(0, (s, e) => s + e.value);
    Color colorOf(int i) =>
        widget.slices[i].isOther ? ChartPalette.other(b) : ChartPalette.series(i, b);

    if (total <= 0) {
      return SizedBox(
        height: 80,
        child: Center(child: Text('No data for this period', style: context.text.bodySmall)),
      );
    }

    final touched = _touched != null && _touched! < widget.slices.length ? widget.slices[_touched!] : null;

    return Column(
      children: [
        SizedBox(
          height: widget.size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              PieChart(
                PieChartData(
                  sectionsSpace: 2,
                  centerSpaceRadius: widget.size * 0.32,
                  startDegreeOffset: -90,
                  pieTouchData: PieTouchData(
                    touchCallback: (event, res) {
                      if (!event.isInterestedForInteractions || res?.touchedSection == null) {
                        if (_touched != null) setState(() => _touched = null);
                        return;
                      }
                      final i = res!.touchedSection!.touchedSectionIndex;
                      if (i != _touched) setState(() => _touched = i < 0 ? null : i);
                    },
                  ),
                  sections: [
                    for (var i = 0; i < widget.slices.length; i++)
                      PieChartSectionData(
                        value: widget.slices[i].value,
                        color: colorOf(i),
                        radius: _touched == i ? widget.size * 0.19 : widget.size * 0.16,
                        showTitle: false,
                      ),
                  ],
                ),
                duration: const Duration(milliseconds: 200),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    touched?.label ?? widget.centerLabel ?? 'Total',
                    style: context.text.labelSmall?.copyWith(color: c.textMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: widget.size * 0.6),
                    child: FittedBox(
                      child: Text(
                        touched != null ? widget.valueFormat(touched.value) : (widget.centerValue ?? widget.valueFormat(total)),
                        style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  if (touched != null)
                    Text(Fmt.percent(touched.value / total * 100),
                        style: context.text.labelSmall?.copyWith(color: c.textSecondary)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        for (var i = 0; i < widget.slices.length; i++)
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => setState(() => _touched = _touched == i ? null : i),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(color: colorOf(i), borderRadius: BorderRadius.circular(3)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      widget.slices[i].label,
                      style: context.text.bodyMedium?.copyWith(
                        fontWeight: _touched == i ? FontWeight.w700 : FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (widget.slices[i].detail != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 10),
                      child: Text(widget.slices[i].detail!, style: context.text.labelSmall?.copyWith(color: c.textMuted)),
                    ),
                  SizedBox(
                    width: 46,
                    child: Text(
                      Fmt.percent(widget.slices[i].value / total * 100, digits: 0),
                      textAlign: TextAlign.right,
                      style: context.text.labelMedium?.copyWith(color: c.textSecondary),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(widget.valueFormat(widget.slices[i].value),
                      style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Weekday × hour revenue heatmap using a single-hue (accent) ramp.
class HourHeatmap extends StatefulWidget {
  const HourHeatmap({super.key, required this.grid, this.fromHour = 6, this.toHour = 23});

  /// [weekday-1][hour] → revenue.
  final List<List<double>> grid;
  final int fromHour;
  final int toHour;

  @override
  State<HourHeatmap> createState() => _HourHeatmapState();
}

class _HourHeatmapState extends State<HourHeatmap> {
  (int, int)? _sel;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Trim to hours that actually have sales so the grid stays legible.
    var from = widget.fromHour, to = widget.toHour;
    final active = [for (var h = 0; h < 24; h++) if (widget.grid.any((r) => r[h] > 0)) h];
    if (active.isNotEmpty) {
      from = math.min(from, active.first);
      to = math.max(math.min(to, 23), active.last);
    }
    final hours = [for (var h = from; h <= to; h++) h];
    final maxV = widget.grid.expand((r) => r).fold<double>(0, math.max);
    Color cell(double v) {
      if (v <= 0) return c.cardAlt;
      final t = (v / maxV).clamp(0.0, 1.0);
      return c.accent.withValues(alpha: 0.15 + 0.85 * t);
    }

    final sel = _sel;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        LayoutBuilder(builder: (context, box) {
          const labelW = 30.0;
          const gap = 2.0;
          final cw = ((box.maxWidth - labelW) / hours.length) - gap;
          final ch = math.min(22.0, math.max(14.0, cw));
          return Column(
            children: [
              for (var d = 0; d < 7; d++)
                Padding(
                  padding: const EdgeInsets.only(bottom: gap),
                  child: Row(
                    children: [
                      SizedBox(width: labelW, child: Text(Fmt.weekday(d + 1), style: _axisStyle(context))),
                      for (final h in hours)
                        GestureDetector(
                          onTap: () => setState(() => _sel = sel == (d, h) ? null : (d, h)),
                          child: Container(
                            width: cw,
                            height: ch,
                            margin: const EdgeInsets.only(right: gap),
                            decoration: BoxDecoration(
                              color: cell(widget.grid[d][h]),
                              borderRadius: BorderRadius.circular(4),
                              border: sel == (d, h) ? Border.all(color: c.textPrimary, width: 1.5) : null,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              Row(
                children: [
                  const SizedBox(width: labelW),
                  for (final h in hours)
                    SizedBox(
                      width: cw + gap,
                      child: (h - from) % 3 == 0
                          ? Text(Fmt.hour(h), style: _axisStyle(context).copyWith(fontSize: 9), overflow: TextOverflow.visible, softWrap: false)
                          : null,
                    ),
                ],
              ),
            ],
          );
        }),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: Text(
                sel == null
                    ? 'Tap a cell to see revenue'
                    : '${Fmt.weekday(sel.$1 + 1)} ${Fmt.hour(sel.$2)}–${Fmt.hour((sel.$2 + 1) % 24)}: ${Fmt.money(widget.grid[sel.$1][sel.$2])}',
                style: context.text.labelMedium?.copyWith(color: sel == null ? c.textMuted : c.textPrimary, fontWeight: FontWeight.w600),
              ),
            ),
            Text('Less', style: _axisStyle(context)),
            const SizedBox(width: 4),
            for (final t in [0.0, 0.25, 0.5, 0.75, 1.0])
              Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.only(right: 2),
                decoration: BoxDecoration(
                  color: t == 0 ? c.cardAlt : c.accent.withValues(alpha: 0.15 + 0.85 * t),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            const SizedBox(width: 2),
            Text('More', style: _axisStyle(context)),
          ],
        ),
      ],
    );
  }
}

/// Legend row for multi-series line charts.
class ChartLegend extends StatelessWidget {
  const ChartLegend(this.items, {super.key});

  final List<(String, Color)> items;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 16,
      runSpacing: 6,
      children: [
        for (final (label, color) in items)
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 14, height: 3, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 6),
            Text(label, style: context.text.labelSmall?.copyWith(color: context.colors.textSecondary)),
          ]),
      ],
    );
  }
}
