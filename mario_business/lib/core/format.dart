import 'package:intl/intl.dart';

/// Formatting helpers. Amounts are Indian Rupees with Indian digit grouping.
class Fmt {
  Fmt._();

  static final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
  static final _money2 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
  static final _int = NumberFormat.decimalPattern('en_IN');

  static String money(num v) => _money.format(v);
  static String money2(num v) => _money2.format(v);
  static String number(num v) => _int.format(v);

  /// ₹1.2L / ₹3.4Cr / ₹12.5K — for chart axes and tight tiles.
  static String compactMoney(num v) => '₹${compact(v)}';

  static String compact(num v) {
    final a = v.abs();
    final sign = v < 0 ? '-' : '';
    String trim(double x) => x >= 100 ? x.toStringAsFixed(0) : x.toStringAsFixed(1).replaceAll('.0', '');
    if (a >= 1e7) return '$sign${trim(a / 1e7)}Cr';
    if (a >= 1e5) return '$sign${trim(a / 1e5)}L';
    if (a >= 1e3) return '$sign${trim(a / 1e3)}K';
    return '$sign${a.toStringAsFixed(0)}';
  }

  static String percent(num v, {int digits = 1}) => '${v.toStringAsFixed(digits)}%';

  static String date(DateTime d) => DateFormat('d MMM yyyy').format(d);
  static String shortDate(DateTime d) => DateFormat('d MMM').format(d);
  static String dateTime(DateTime d) => DateFormat('d MMM, h:mm a').format(d);
  static String time(DateTime d) => DateFormat('h:mm a').format(d);
  static String weekday(int weekday) => const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday - 1];

  static String hour(int h) {
    final suffix = h < 12 ? 'am' : 'pm';
    final hh = h % 12 == 0 ? 12 : h % 12;
    return '$hh$suffix';
  }

  /// "upi" -> "UPI", "dine_in" -> "Dine In", "" -> fallback.
  static String label(String raw, {String fallback = 'Other'}) {
    final s = raw.trim();
    if (s.isEmpty) return fallback;
    const upper = {'upi', 'pos', 'gst', 'cgst', 'sgst', 'igst'};
    return s
        .split(RegExp(r'[_\-\s]+'))
        .where((w) => w.isNotEmpty)
        .map((w) => upper.contains(w.toLowerCase()) ? w.toUpperCase() : '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}')
        .join(' ');
  }

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
