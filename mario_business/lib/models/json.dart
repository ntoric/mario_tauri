/// Lenient JSON readers: the backend omits empty fields (`omitempty`) and
/// sometimes sends numbers as strings, so every read has a safe default.
typedef Json = Map<String, dynamic>;

String jStr(Json j, String k, [String d = '']) {
  final v = j[k];
  if (v == null) return d;
  return v.toString();
}

double jNum(Json j, String k, [double d = 0]) {
  final v = j[k];
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? d;
  return d;
}

int jInt(Json j, String k, [int d = 0]) {
  final v = j[k];
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? double.tryParse(v)?.round() ?? d;
  return d;
}

bool jBool(Json j, String k, [bool d = false]) {
  final v = j[k];
  if (v is bool) return v;
  if (v is String) return v == 'true';
  return d;
}

DateTime? jDate(Json j, String k) {
  final v = j[k];
  if (v is! String || v.isEmpty) return null;
  final d = DateTime.tryParse(v);
  // Go's zero time ("0001-01-01T00:00:00Z") means "not set".
  if (d == null || d.year <= 1) return null;
  return d.toLocal();
}

List<T> jList<T>(Json j, String k, T Function(Json) f) {
  final v = j[k];
  if (v is! List) return <T>[];
  return v.whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList();
}

List<T> asList<T>(dynamic v, T Function(Json) f) {
  if (v is! List) return <T>[];
  return v.whereType<Map>().map((e) => f(Map<String, dynamic>.from(e))).toList();
}

Json asMap(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
