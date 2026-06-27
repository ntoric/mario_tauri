class Item {
  final String id;
  final String storeId;
  final String categoryId;
  final String? categoryName;
  final String name;
  final String? description;
  final double price;
  final String? hsnCode;
  final double? taxPercent;
  final bool isActive;

  Item({
    required this.id,
    required this.storeId,
    required this.categoryId,
    this.categoryName,
    required this.name,
    this.description,
    required this.price,
    this.hsnCode,
    this.taxPercent,
    required this.isActive,
  });


  static double _parseDouble(dynamic value) {
    if (value == null) return 0.0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0.0;
  }


  factory Item.fromJson(Map<String, dynamic> json) {
    return Item(
      id: json['id']?.toString() ?? '',

      storeId:
          json['storeId']?.toString() ??
          json['store_id']?.toString() ??
          '',

      categoryId:
          json['categoryId']?.toString() ??
          json['category_id']?.toString() ??
          '',

      name: json['name']?.toString() ?? '',

      description:
          json['description']?.toString() ?? '',

      price: _parseDouble(json['price']),

      hsnCode:
          json['hsnCode']?.toString() ??
          json['hsn_code']?.toString() ??
          '',

      taxPercent: _parseDouble(
        json['taxPercent'] ?? json['tax_percent'],
      ),

      isActive:
          json['isActive'] ??
          json['is_active'] ??
          true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'storeId': storeId,
      'categoryId': categoryId,
      'categoryName': categoryName,
      'name': name,
      'description': description,
      'price': price,
      'hsnCode': hsnCode,
      'taxPercent': taxPercent,
      'isActive': isActive,
    };
  }
}