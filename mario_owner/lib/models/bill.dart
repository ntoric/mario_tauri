class Bill {
  final String id;
  final String storeId;
  final String orderId;
  final int tableNumber;
  final String? tableName;
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

  // --- GST fields (absent on legacy bills) ---
  final String? documentType;
  final String? supplyType;
  final double? taxableValue;
  final double? cgst;
  final double? sgst;
  final double? igst;
  final double? roundOff;
  final String? placeOfSupplyName;
  final String? buyerGstin;
  final String? orderSource;
  final bool isUtgst;
  final double? creditedTotal;
  final String? fy;
  final List<BillLine> lines;
  final List<TaxSummary> taxSummary;

  Bill({
    required this.id,
    required this.storeId,
    required this.orderId,
    required this.tableNumber,
    this.tableName,
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
    this.documentType,
    this.supplyType,
    this.taxableValue,
    this.cgst,
    this.sgst,
    this.igst,
    this.roundOff,
    this.placeOfSupplyName,
    this.buyerGstin,
    this.orderSource,
    this.isUtgst = false,
    this.creditedTotal,
    this.fy,
    this.lines = const [],
    this.taxSummary = const [],
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
      tableName: (json['tableName'] ?? json['table_name'])?.toString(),
      invoiceNo: json['invoiceNo'] ?? json['invoice_no'],
      items: (json['items'] as List?)?.map((i) => BillItem.fromJson(i)).toList() ?? [],
      subtotal: _parseDouble(json['subtotal']),
      taxTotal: _parseDouble(json['taxTotal'] ?? json['tax_total']),
      discount: _parseDouble(json['discount'] ?? json['discount']),
      total: _parseDouble(json['total']),
      paymentMethod: json['paymentMethod'] ?? json['payment_method'],
      customerName: json['customerName'] ?? json['customer_name'],
      isPrinted: json['isPrinted'] ?? json['is_printed'] ?? false,
      generatedAt: _parseDateTime(json['generatedAt'] ?? json['generated_at']),
      generatedBy: json['generatedBy'] ?? json['generated_by'],
      // GST fields — all defensive; legacy bills simply won't have them.
      documentType: (json['documentType'] ?? json['document_type'])?.toString(),
      supplyType: (json['supplyType'] ?? json['supply_type'])?.toString(),
      taxableValue: json['taxableValue'] == null && json['taxable_value'] == null
          ? null
          : _parseDouble(json['taxableValue'] ?? json['taxable_value']),
      cgst: json['cgst'] == null ? null : _parseDouble(json['cgst']),
      sgst: json['sgst'] == null ? null : _parseDouble(json['sgst']),
      igst: json['igst'] == null ? null : _parseDouble(json['igst']),
      roundOff: json['roundOff'] == null && json['round_off'] == null
          ? null
          : _parseDouble(json['roundOff'] ?? json['round_off']),
      placeOfSupplyName:
          (json['placeOfSupplyName'] ?? json['place_of_supply_name'])
              ?.toString(),
      buyerGstin: (json['buyerGstin'] ?? json['buyer_gstin'])?.toString(),
      orderSource: (json['orderSource'] ?? json['order_source'])?.toString(),
      isUtgst: json['isUtgst'] ?? json['is_utgst'] ?? false,
      creditedTotal:
          json['creditedTotal'] == null && json['credited_total'] == null
              ? null
              : _parseDouble(json['creditedTotal'] ?? json['credited_total']),
      fy: json['fy']?.toString(),
      lines: (json['lines'] as List?)
              ?.map((l) => BillLine.fromJson(l))
              .toList() ??
          [],
      taxSummary: (json['taxSummary'] as List?)
              ?.map((t) => TaxSummary.fromJson(t))
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'storeId': storeId,
      'orderId': orderId,
      'tableNumber': tableNumber,
      if (tableName != null) 'tableName': tableName,
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
      'documentType': documentType,
      'supplyType': supplyType,
      'taxableValue': taxableValue,
      'cgst': cgst,
      'sgst': sgst,
      'igst': igst,
      'roundOff': roundOff,
      'placeOfSupplyName': placeOfSupplyName,
      'buyerGstin': buyerGstin,
      'orderSource': orderSource,
      'isUtgst': isUtgst,
      'creditedTotal': creditedTotal,
      'fy': fy,
      'lines': lines.map((l) => l.toJson()).toList(),
      'taxSummary': taxSummary.map((t) => t.toJson()).toList(),
    };
  }

  // Display label: alphanumeric table name when set, else the table number.
  String get tableLabel =>
      (tableName != null && tableName!.isNotEmpty) ? tableName! : '$tableNumber';

  /// True when the bill carries the new GST breakdown (line-level taxes or a
  /// tax summary). Legacy bills have none of these.
  bool get hasGstDetails =>
      lines.isNotEmpty || taxSummary.isNotEmpty || documentType != null;
}

/// A GST line item as returned by GET /api/bills/{id} `lines[]`.
class BillLine {
  final String name;
  final String? hsnCode;
  final double quantity;
  final double unitPrice;
  final double taxableValue;
  final double taxRate;
  final double cgst;
  final double sgst;
  final double igst;
  final double total;

  BillLine({
    required this.name,
    this.hsnCode,
    required this.quantity,
    required this.unitPrice,
    required this.taxableValue,
    required this.taxRate,
    required this.cgst,
    required this.sgst,
    required this.igst,
    required this.total,
  });

  factory BillLine.fromJson(Map<String, dynamic> json) {
    return BillLine(
      name: (json['name'] ?? json['itemName'] ?? json['item_name'] ?? 'Item')
          .toString(),
      hsnCode: (json['hsnCode'] ?? json['hsn_code'])?.toString(),
      quantity: Bill._parseDouble(json['quantity']),
      unitPrice: Bill._parseDouble(json['unitPrice'] ?? json['unit_price']),
      taxableValue:
          Bill._parseDouble(json['taxableValue'] ?? json['taxable_value']),
      taxRate: Bill._parseDouble(json['taxRate'] ?? json['tax_rate'] ?? json['rate']),
      cgst: Bill._parseDouble(json['cgst']),
      sgst: Bill._parseDouble(json['sgst']),
      igst: Bill._parseDouble(json['igst']),
      total: Bill._parseDouble(json['total']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'hsnCode': hsnCode,
      'quantity': quantity,
      'unitPrice': unitPrice,
      'taxableValue': taxableValue,
      'taxRate': taxRate,
      'cgst': cgst,
      'sgst': sgst,
      'igst': igst,
      'total': total,
    };
  }
}

/// Per-rate tax totals as returned by GET /api/bills/{id} `taxSummary[]`.
class TaxSummary {
  final double rate;
  final double taxableValue;
  final double cgst;
  final double sgst;
  final double igst;

  TaxSummary({
    required this.rate,
    required this.taxableValue,
    required this.cgst,
    required this.sgst,
    required this.igst,
  });

  factory TaxSummary.fromJson(Map<String, dynamic> json) {
    return TaxSummary(
      rate: Bill._parseDouble(json['rate']),
      taxableValue:
          Bill._parseDouble(json['taxableValue'] ?? json['taxable_value']),
      cgst: Bill._parseDouble(json['cgst']),
      sgst: Bill._parseDouble(json['sgst']),
      igst: Bill._parseDouble(json['igst']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'rate': rate,
      'taxableValue': taxableValue,
      'cgst': cgst,
      'sgst': sgst,
      'igst': igst,
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
