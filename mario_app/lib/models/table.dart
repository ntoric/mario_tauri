class TableModel {
  final String id;
  final String storeId;
  final int number;
  final int seats;
  final Map<String, dynamic>? position;
  final bool isActive;

  TableModel({
    required this.id,
    required this.storeId,
    required this.number,
    required this.seats,
    this.position,
    required this.isActive,
  });

  static int _parseInt(dynamic val) {
    if (val == null) return 0;
    if (val is int) return val;
    if (val is num) return val.toInt();
    return int.tryParse(val.toString()) ?? 0;
  }

  factory TableModel.fromJson(Map<String, dynamic> json) {
    return TableModel(
      id: json['id'],
      storeId: json['storeId'] ?? json['store_id'],
      number: _parseInt(json['number']),
      seats: _parseInt(json['seats']),
      position: json['position'],
      isActive: json['isActive'] ?? json['is_active'] ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'storeId': storeId,
      'number': number,
      'seats': seats,
      'position': position,
      'isActive': isActive,
    };
  }
}