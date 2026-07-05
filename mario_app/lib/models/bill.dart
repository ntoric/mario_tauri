class Bill {
  final String id;
  final String storeId;
  final String orderId;
  final int tableNumber;
  final String? invoiceNo;
  final List<BillItem> items;
  final double subtotal;
  final double taxTotal;
  final double discount;
  final double total;
  final String? paymentMethod;
  final String? customerName;
  final bool isPrinted;
  final DateTime generatedAt;
  final String generatedBy;

  Bill({
    required this.id,
    required this.storeId,
    required this.orderId,
    required this.tableNumber,
    this.invoiceNo,
    required this.items,
    required this.subtotal,
    required this.taxTotal,
    required this.discount,
    required this.total,
    this.paymentMethod,
    this.customerName,
    required this.isPrinted,
    required this.generatedAt,
    required this.generatedBy,
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

  factory Bill.fromJson(Map<String, dynamic> json) {
    return Bill(
      id: json['id'],
      storeId: json['storeId'] ?? json['store_id'],
      orderId: json['orderId'] ?? json['order_id'],
      tableNumber: _parseInt(json['tableNumber'] ?? json['table_number']),
      invoiceNo: json['invoiceNo'] ?? json['invoice_no'],
      items: (json['items'] as List?)
              ?.map((i) => BillItem.fromJson(i))
              .toList() ??
          [],
      subtotal: _parseDouble(json['subtotal']),
      taxTotal: _parseDouble(json['taxTotal'] ?? json['tax_total']),
      discount: _parseDouble(json['discount'] ?? json['discount']),
      total: _parseDouble(json['total']),
      paymentMethod: json['paymentMethod'] ?? json['payment_method'],
      customerName: json['customerName'] ?? json['customer_name'],
      isPrinted: json['isPrinted'] ?? json['is_printed'] ?? false,
      generatedAt: _parseDateTime(json['generatedAt'] ?? json['generated_at']),
      generatedBy: json['generatedBy'] ?? json['generated_by'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'storeId': storeId,
      'orderId': orderId,
      'tableNumber': tableNumber,
      'invoiceNo': invoiceNo,
      'items': items.map((i) => i.toJson()).toList(),
      'subtotal': subtotal,
      'taxTotal': taxTotal,
      'discount': discount,
      'total': total,
      'paymentMethod': paymentMethod,
      'customerName': customerName,
      'isPrinted': isPrinted,
      'generatedAt': generatedAt.toIso8601String(),
      'generatedBy': generatedBy,
    };
  }
}

class BillItem {
  final String itemId;
  final String itemName;
  final int quantity;
  final double unitPrice;
  final double totalPrice;

  BillItem({
    required this.itemId,
    required this.itemName,
    required this.quantity,
    required this.unitPrice,
    required this.totalPrice,
  });

  factory BillItem.fromJson(Map<String, dynamic> json) {
    final qty = Bill._parseInt(json['quantity']);
    final price = Bill._parseDouble(json['unitPrice'] ?? json['unit_price']);
    return BillItem(
      itemId: json['itemId'] ?? json['item_id'],
      itemName: json['itemName'] ?? json['item_name'] ?? json['item']?['name'] ?? 'Unknown',
      quantity: qty,
      unitPrice: price,
      totalPrice: price * qty.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'itemId': itemId,
      'itemName': itemName,
      'quantity': quantity,
      'unitPrice': unitPrice,
      'totalPrice': totalPrice,
    };
  }
}