import 'package:intl/intl.dart';

import 'format.dart';

enum RangePreset { today, yesterday, last7, last30, thisMonth, lastMonth, thisYear, custom }

extension RangePresetLabel on RangePreset {
  String get label => switch (this) {
        RangePreset.today => 'Today',
        RangePreset.yesterday => 'Yesterday',
        RangePreset.last7 => 'Last 7 days',
        RangePreset.last30 => 'Last 30 days',
        RangePreset.thisMonth => 'This month',
        RangePreset.lastMonth => 'Last month',
        RangePreset.thisYear => 'This year',
        RangePreset.custom => 'Custom',
      };

  String get short => switch (this) {
        RangePreset.today => 'Today',
        RangePreset.yesterday => 'Yesterday',
        RangePreset.last7 => '7D',
        RangePreset.last30 => '30D',
        RangePreset.thisMonth => 'MTD',
        RangePreset.lastMonth => 'Last month',
        RangePreset.thisYear => 'YTD',
        RangePreset.custom => 'Custom',
      };
}

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// An inclusive range of calendar days. All report endpoints accept
/// `YYYY-MM-DD` bounds and treat the end date as the whole day.
class DateRange {
  final RangePreset preset;
  final DateTime start;
  final DateTime end;

  DateRange._(this.preset, DateTime start, DateTime end)
      : start = _day(start),
        end = _day(end);

  factory DateRange.preset(RangePreset p, {DateTime? now}) {
    final t = _day(now ?? DateTime.now());
    return switch (p) {
      RangePreset.today => DateRange._(p, t, t),
      RangePreset.yesterday => DateRange._(p, t.subtract(const Duration(days: 1)), t.subtract(const Duration(days: 1))),
      RangePreset.last7 => DateRange._(p, t.subtract(const Duration(days: 6)), t),
      RangePreset.last30 => DateRange._(p, t.subtract(const Duration(days: 29)), t),
      RangePreset.thisMonth => DateRange._(p, DateTime(t.year, t.month, 1), t),
      RangePreset.lastMonth => DateRange._(p, DateTime(t.year, t.month - 1, 1), DateTime(t.year, t.month, 0)),
      RangePreset.thisYear => DateRange._(p, DateTime(t.year, 1, 1), t),
      RangePreset.custom => DateRange._(p, t, t),
    };
  }

  factory DateRange.custom(DateTime start, DateTime end) =>
      DateRange._(RangePreset.custom, start.isAfter(end) ? end : start, start.isAfter(end) ? start : end);

  int get days => end.difference(start).inDays + 1;

  bool get isSingleDay => days == 1;

  /// The equally long period immediately before this one, for comparisons.
  DateRange get previous {
    final prevEnd = start.subtract(const Duration(days: 1));
    return DateRange._(RangePreset.custom, prevEnd.subtract(Duration(days: days - 1)), prevEnd);
  }

  static final _api = DateFormat('yyyy-MM-dd');
  String get startParam => _api.format(start);
  String get endParam => _api.format(end);

  /// Every day in the range, in order.
  List<DateTime> get allDays => List.generate(days, (i) => start.add(Duration(days: i)));

  String get label {
    if (preset != RangePreset.custom) return preset.label;
    if (isSingleDay) return Fmt.date(start);
    if (start.year == end.year) return '${Fmt.shortDate(start)} – ${Fmt.shortDate(end)}';
    return '${Fmt.date(start)} – ${Fmt.date(end)}';
  }

  String get subtitle => isSingleDay ? Fmt.date(start) : '${Fmt.shortDate(start)} – ${Fmt.date(end)}';

  String get key => '$startParam|$endParam';

  @override
  bool operator ==(Object other) => other is DateRange && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);
}
