import 'json.dart';

class Category {
  final String id;
  final String name;
  final String description;
  final bool enabled;
  final int sortOrder;

  const Category({
    required this.id,
    required this.name,
    required this.description,
    required this.enabled,
    required this.sortOrder,
  });

  factory Category.fromJson(Json j) => Category(
        id: jStr(j, 'id'),
        name: jStr(j, 'name', 'Category'),
        description: jStr(j, 'description'),
        enabled: jBool(j, 'enabled', true) && jBool(j, 'isActive', true),
        sortOrder: jInt(j, 'sortOrder'),
      );
}

class MenuItem {
  final String id;
  final String categoryId;
  final String categoryName;
  final String name;
  final String description;
  final double price;
  final double taxPercent;
  final String hsnCode;
  final bool enabled;
  final bool isFavourite;
  final double totalCost;
  final double profit;
  final double profitPercent;

  const MenuItem({
    required this.id,
    required this.categoryId,
    required this.categoryName,
    required this.name,
    required this.description,
    required this.price,
    required this.taxPercent,
    required this.hsnCode,
    required this.enabled,
    required this.isFavourite,
    required this.totalCost,
    required this.profit,
    required this.profitPercent,
  });

  factory MenuItem.fromJson(Json j) => MenuItem(
        id: jStr(j, 'id'),
        categoryId: jStr(j, 'categoryId'),
        categoryName: jStr(j, 'categoryName'),
        name: jStr(j, 'name', 'Item'),
        description: jStr(j, 'description'),
        price: jNum(j, 'price'),
        taxPercent: jNum(j, 'taxPercent'),
        hsnCode: jStr(j, 'hsnCode'),
        enabled: jBool(j, 'enabled', true) && jBool(j, 'isActive', true),
        isFavourite: jBool(j, 'isFavourite'),
        totalCost: jNum(j, 'totalCost'),
        profit: jNum(j, 'profit'),
        profitPercent: jNum(j, 'profitPercent'),
      );

  bool get hasCost => totalCost > 0;
}
