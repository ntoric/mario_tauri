class TableModel {
  final String id;
  final String storeId;
  final int number;
  final String? name;
  final int seats;
  final Map<String, dynamic>? position;
  final bool isActive;
  final String? section;

  TableModel({
    required this.id,
    required this.storeId,
    required this.number,
    this.name,
    required this.seats,
    this.position,
    required this.isActive,
    this.section,
  });

  // Display label: alphanumeric name (e.g. "1A") when set, else "T<number>".
  String get label => (name != null && name!.isNotEmpty) ? name! : 'T$number';

  static int _parseInt(dynamic val) {
    if (val == null) return 0;
    if (val is int) return val;
    if (val is num) return val.toInt();
    return int.tryParse(val.toString()) ?? 0;
  }

  factory TableModel.fromJson(Map<String, dynamic> json) {
    final parsedName = json['name']?.toString();
    final parsedSection = json['section']?.toString();
    return TableModel(
      id: json['id'],
      storeId: json['storeId'] ?? json['store_id'],
      number: _parseInt(json['number']),
      name: (parsedName != null && parsedName.isNotEmpty) ? parsedName : null,
      seats: _parseInt(json['seats']),
      position: json['position'],
      isActive: json['isActive'] ?? json['is_active'] ?? true,
      section:
          (parsedSection != null && parsedSection.isNotEmpty)
              ? parsedSection
              : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'storeId': storeId,
      'number': number,
      if (name != null) 'name': name,
      'seats': seats,
      'position': position,
      'isActive': isActive,
      if (section != null) 'section': section,
    };
  }
}

/// A named floor/area bucket for grouping tables. Sections exist in the
/// backend catalog independently of tables; the one flagged [isDefault] is
/// where tables with no explicit section are grouped.
class TableSection {
  final String id;
  final String storeId;
  final String name;
  final bool isDefault;
  final DateTime? createdAt;

  TableSection({
    required this.id,
    required this.storeId,
    required this.name,
    this.isDefault = false,
    this.createdAt,
  });

  factory TableSection.fromJson(Map<String, dynamic> json) {
    return TableSection(
      id: json['id']?.toString() ?? '',
      storeId: json['storeId']?.toString() ?? json['store_id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      isDefault: json['isDefault'] ?? json['is_default'] ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }
}