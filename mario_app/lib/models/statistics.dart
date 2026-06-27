class SystemStats {
  final int users;
  final int stores;
  final int categories;
  final int items;
  final int orders;
  final int tables;
  final int bills;

  SystemStats({
    required this.users,
    required this.stores,
    required this.categories,
    required this.items,
    required this.orders,
    required this.tables,
    required this.bills,
  });

  factory SystemStats.fromJson(Map<String, dynamic> json) {
    return SystemStats(
      users: json['users'] ?? 0,
      stores: json['stores'] ?? 0,
      categories: json['categories'] ?? 0,
      items: json['items'] ?? 0,
      orders: json['orders'] ?? 0,
      tables: json['tables'] ?? 0,
      bills: json['bills'] ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'users': users,
      'stores': stores,
      'categories': categories,
      'items': items,
      'orders': orders,
      'tables': tables,
      'bills': bills,
    };
  }
}

class SalesData {
  final DateTime date;
  final double amount;
  final int orderCount;

  SalesData({
    required this.date,
    required this.amount,
    required this.orderCount,
  });

  factory SalesData.fromJson(Map<String, dynamic> json) {
    return SalesData(
      date: DateTime.parse(json['date']),
      amount: (json['amount'] as num).toDouble(),
      orderCount: json['orderCount'] ?? 0,
    );
  }
}

class PaymentMethodStats {
  final String method;
  final double amount;
  final int count;
  final double percentage;

  PaymentMethodStats({
    required this.method,
    required this.amount,
    required this.count,
    required this.percentage,
  });
}