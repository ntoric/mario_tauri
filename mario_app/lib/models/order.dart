import 'item.dart';

class Order {
  final String id;
  final String storeId;
  final String tableId;
  final int tableNumber;
  final List<OrderItem> items;
  final String status;
  final double totalAmount;
  final double taxAmount;
  final double discountAmount;
  final String? paymentMethod;
  final String? paymentStatus;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String createdBy;

  Order({
    required this.id,
    required this.storeId,
    required this.tableId,
    required this.tableNumber,
    required this.items,
    required this.status,
    required this.totalAmount,
    required this.taxAmount,
    required this.discountAmount,
    this.paymentMethod,
    this.paymentStatus,
    required this.createdAt,
    required this.updatedAt,
    required this.createdBy,
  });

  static DateTime _parseDateTime(dynamic jsonVal) {
    if (jsonVal == null) return DateTime.now();
    if (jsonVal is DateTime) return jsonVal;
    return DateTime.parse(jsonVal.toString());
  }

  static double _parseDouble(dynamic val) {
    if (val == null) return 0.0;
    if (val is num) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0.0;
  }

  static int _parseInt(dynamic val) {
    if (val == null) return 0;
    if (val is int) return val;
    if (val is num) return val.toInt();
    return int.tryParse(val.toString()) ?? 0;
  }

  // factory Order.fromJson(Map<String, dynamic> json) {
  //   return Order(
  //     id: json['id'],
  //     storeId: json['storeId'] ?? json['store_id'],
  //     tableId: json['tableId'] ?? json['table_id'],
  //     tableNumber: _parseInt(json['tableNumber'] ?? json['table_number']),
  //     items: (json['items'] as List?)
  //             ?.map((i) => OrderItem.fromJson(i))
  //             .toList() ??
  //         [],
  //     status: json['status'],
  //     totalAmount: _parseDouble(json['totalAmount'] ?? json['total_amount']),
  //     taxAmount: _parseDouble(json['taxAmount'] ?? json['tax_amount']),
  //     discountAmount: _parseDouble(json['discountAmount'] ?? json['discount_amount']),
  //     paymentMethod: json['paymentMethod'] ?? json['payment_method'],
  //     paymentStatus: json['paymentStatus'] ?? json['payment_status'],
  //     createdAt: _parseDateTime(json['createdAt'] ?? json['created_at']),
  //     updatedAt: _parseDateTime(json['updatedAt'] ?? json['updated_at']),
  //     createdBy: json['createdBy'] ?? json['created_by'],
  //   );
  // }
    factory Order.fromJson(Map<String, dynamic> json) {
      return Order(
        id: json['id']?.toString() ?? '',
        storeId: json['storeId']?.toString() ??
            json['store_id']?.toString() ??
            '',
        tableId: json['tableId']?.toString() ??
            json['table_id']?.toString() ??
            '',
        tableNumber: _parseInt(json['tableNumber'] ?? json['table_number']),
        items: (json['items'] as List?)
                ?.map((i) => OrderItem.fromJson(i))
                .toList() ??
            [],
        status: json['status']?.toString() ?? 'active',
        totalAmount:
            _parseDouble(json['totalAmount'] ?? json['total_amount']),
        taxAmount:
            _parseDouble(json['taxAmount'] ?? json['tax_amount']),
        discountAmount:
            _parseDouble(json['discountAmount'] ?? json['discount_amount']),
        paymentMethod:
            json['paymentMethod'] ?? json['payment_method'],
        paymentStatus:
            json['paymentStatus'] ?? json['payment_status'],
        createdAt:
            _parseDateTime(json['createdAt'] ?? json['created_at']),
        updatedAt:
            _parseDateTime(json['updatedAt'] ?? json['updated_at']),
        createdBy: json['createdBy']?.toString() ??
            json['created_by']?.toString() ??
            '',
      );
    }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'storeId': storeId,
      'tableId': tableId,
      'tableNumber': tableNumber,
      'items': items.map((i) => i.toJson()).toList(),
      'status': status,
      'totalAmount': totalAmount,
      'taxAmount': taxAmount,
      'discountAmount': discountAmount,
      'paymentMethod': paymentMethod,
      'paymentStatus': paymentStatus,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
      'createdBy': createdBy,
    };
  }

  bool get isActive => status == 'active';
  bool get isCompleted => status == 'completed';
  bool get isCancelled => status == 'cancelled';

  double get subtotal => totalAmount - taxAmount + discountAmount;
}

class OrderItem {
  final String itemId;
  final Item item;
  final int quantity;
  final double? unitPrice;
  final double? taxPercent;
  final String? notes;

  OrderItem({
    required this.itemId,
    required this.item,
    required this.quantity,
    this.unitPrice,
    this.taxPercent,
    this.notes,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    return OrderItem(
      itemId: json['itemId'] ?? json['item_id'],
      item: Item.fromJson(json['item']),
      quantity: Order._parseInt(json['quantity']),
      unitPrice: json['unitPrice'] != null || json['unit_price'] != null
          ? Order._parseDouble(json['unitPrice'] ?? json['unit_price'])
          : null,
      taxPercent: json['taxPercent'] != null || json['tax_percent'] != null
          ? Order._parseDouble(json['taxPercent'] ?? json['tax_percent'])
          : null,
      notes: json['notes'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'itemId': itemId,
      'item': item.toJson(),
      'quantity': quantity,
      'unitPrice': unitPrice,
      'taxPercent': taxPercent,
      'notes': notes,
    };
  }

  double get totalPrice => (unitPrice ?? item.price) * quantity;
}