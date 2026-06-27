class Category {
  final String id;
  final String storeId;
  final String name;
  final String? description;
  final bool isActive;

  Category({
    required this.id,
    required this.storeId,
    required this.name,
    this.description,
    required this.isActive,
  });

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: json['id'],
      storeId: json['storeId'] ?? json['store_id'],
      name: json['name'],
      description: json['description'],
      isActive: json['isActive'] ?? json['is_active'] ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'storeId': storeId,
      'name': name,
      'description': description,
      'isActive': isActive,
    };
  }
}