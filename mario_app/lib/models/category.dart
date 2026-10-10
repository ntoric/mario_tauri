class Category {
  final String id;
  final String storeId;
  final String name;
  final String? description;
  final bool isActive;
  final bool enabled;
  final bool isFavourite;

  Category({
    required this.id,
    required this.storeId,
    required this.name,
    this.description,
    required this.isActive,
    this.enabled = true,
    this.isFavourite = false,
  });

  Category copyWith({bool? isFavourite}) {
    return Category(
      id: id,
      storeId: storeId,
      name: name,
      description: description,
      isActive: isActive,
      enabled: enabled,
      isFavourite: isFavourite ?? this.isFavourite,
    );
  }

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: json['id'],
      storeId: json['storeId'] ?? json['store_id'],
      name: json['name'],
      description: json['description'],
      isActive: json['isActive'] ?? json['is_active'] ?? true,
      enabled: json['enabled'] ?? true,
      isFavourite: json['isFavourite'] ?? json['is_favourite'] ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'storeId': storeId,
      'name': name,
      'description': description,
      'isActive': isActive,
      'enabled': enabled,
      'isFavourite': isFavourite,
    };
  }
}