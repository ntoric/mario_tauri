import 'json.dart';

/// A line on an order or legacy bill.
class LineItem {
  final String itemId;
  final String name;
  final String categoryId;
  final String categoryName;
  final int quantity;
  final double unitPrice;
  final double taxPercent;
  final String notes;

  const LineItem({
    required this.itemId,
    required this.name,
    required this.categoryId,
    required this.categoryName,
    required this.quantity,
    required this.unitPrice,
    required this.taxPercent,
    required this.notes,
  });

  factory LineItem.fromJson(Json j) {
    final item = asMap(j['item']);
    final unit = jNum(j, 'unitPrice');
    return LineItem(
      itemId: jStr(j, 'itemId'),
      name: jStr(item, 'name', 'Item'),
      categoryId: jStr(item, 'categoryId'),
      categoryName: jStr(item, 'categoryName'),
      quantity: jInt(j, 'quantity'),
      unitPrice: unit > 0 ? unit : jNum(item, 'price'),
      taxPercent: jNum(j, 'taxPercent'),
      notes: jStr(j, 'notes'),
    );
  }

  double get amount => unitPrice * quantity;
}

/// A computed GST line on a bill issued through the GST pipeline.
class BillLine {
  final String itemId;
  final String name;
  final String hsnCode;
  final double quantity;
  final double unitPrice;
  final double taxableValue;
  final double taxRate;
  final double cgst;
  final double sgst;
  final double igst;
  final double total;

  const BillLine({
    required this.itemId,
    required this.name,
    required this.hsnCode,
    required this.quantity,
    required this.unitPrice,
    required this.taxableValue,
    required this.taxRate,
    required this.cgst,
    required this.sgst,
    required this.igst,
    required this.total,
  });

  factory BillLine.fromJson(Json j) => BillLine(
        itemId: jStr(j, 'itemId'),
        name: jStr(j, 'name', 'Item'),
        hsnCode: jStr(j, 'hsnCode'),
        quantity: jNum(j, 'quantity'),
        unitPrice: jNum(j, 'unitPrice'),
        taxableValue: jNum(j, 'taxableValue'),
        taxRate: jNum(j, 'taxRate'),
        cgst: jNum(j, 'cgst'),
        sgst: jNum(j, 'sgst'),
        igst: jNum(j, 'igst'),
        total: jNum(j, 'total'),
      );
}

class Bill {
  final String id;
  final String orderId;
  final String invoiceNo;
  final int tableNumber;
  final String tableName;
  final double subtotal;
  final double taxTotal;
  final double discount;
  final double total;
  final double roundOff;
  final double creditedTotal;
  final String paymentMethod;
  final String customerName;
  final String customerMobile;
  final String status;
  final String orderSource;
  final String generatedBy;
  final DateTime generatedAt;
  final List<LineItem> items;
  final List<BillLine> lines;
  final String buyerGstin;
  final String buyerName;

  const Bill({
    required this.id,
    required this.orderId,
    required this.invoiceNo,
    required this.tableNumber,
    required this.tableName,
    required this.subtotal,
    required this.taxTotal,
    required this.discount,
    required this.total,
    required this.roundOff,
    required this.creditedTotal,
    required this.paymentMethod,
    required this.customerName,
    required this.customerMobile,
    required this.status,
    required this.orderSource,
    required this.generatedBy,
    required this.generatedAt,
    required this.items,
    required this.lines,
    required this.buyerGstin,
    required this.buyerName,
  });

  factory Bill.fromJson(Json j) => Bill(
        id: jStr(j, 'id'),
        orderId: jStr(j, 'orderId'),
        invoiceNo: jStr(j, 'invoiceNo'),
        tableNumber: jInt(j, 'tableNumber'),
        tableName: jStr(j, 'tableName'),
        subtotal: jNum(j, 'subtotal'),
        taxTotal: jNum(j, 'taxTotal'),
        discount: jNum(j, 'discount'),
        total: jNum(j, 'total'),
        roundOff: jNum(j, 'roundOff'),
        creditedTotal: jNum(j, 'creditedTotal'),
        paymentMethod: jStr(j, 'paymentMethod'),
        customerName: jStr(j, 'customerName'),
        customerMobile: jStr(j, 'customerMobile'),
        status: jStr(j, 'status', 'active'),
        orderSource: jStr(j, 'orderSource'),
        generatedBy: jStr(j, 'generatedBy'),
        generatedAt: jDate(j, 'generatedAt') ?? DateTime.now(),
        items: jList(j, 'items', LineItem.fromJson),
        lines: jList(j, 'lines', BillLine.fromJson),
        buyerGstin: jStr(j, 'buyerGstin'),
        buyerName: jStr(j, 'buyerName'),
      );

  bool get isCancelled => status == 'cancelled';

  /// Table 0 is used for parcel / takeaway orders.
  bool get isParcel => tableNumber == 0 && tableName.isEmpty;

  String get tableLabel {
    if (tableName.isNotEmpty) return tableName;
    if (tableNumber > 0) return 'Table $tableNumber';
    return 'Parcel';
  }

  /// Dine-in / Parcel / Swiggy / Zomato — the channel a sale came through.
  String get channel {
    final src = orderSource.toLowerCase();
    if (src.isNotEmpty && src != 'pos') return src;
    return isParcel ? 'parcel' : 'dine_in';
  }

  int get itemCount => items.isNotEmpty
      ? items.fold(0, (s, i) => s + i.quantity)
      : lines.fold(0, (s, l) => s + l.quantity.round());
}

class Order {
  final String id;
  final int tableNumber;
  final String tableName;
  final String status;
  final String orderType;
  final String orderSource;
  final String customerName;
  final double totalAmount;
  final double taxAmount;
  final double discountAmount;
  final String paymentMethod;
  final String createdBy;
  final DateTime createdAt;
  final DateTime? cancelledAt;
  final List<LineItem> items;

  const Order({
    required this.id,
    required this.tableNumber,
    required this.tableName,
    required this.status,
    required this.orderType,
    required this.orderSource,
    required this.customerName,
    required this.totalAmount,
    required this.taxAmount,
    required this.discountAmount,
    required this.paymentMethod,
    required this.createdBy,
    required this.createdAt,
    required this.cancelledAt,
    required this.items,
  });

  factory Order.fromJson(Json j) => Order(
        id: jStr(j, 'id'),
        tableNumber: jInt(j, 'tableNumber'),
        tableName: jStr(j, 'tableName'),
        status: jStr(j, 'status'),
        orderType: jStr(j, 'orderType'),
        orderSource: jStr(j, 'orderSource'),
        customerName: jStr(j, 'customerName'),
        totalAmount: jNum(j, 'totalAmount'),
        taxAmount: jNum(j, 'taxAmount'),
        discountAmount: jNum(j, 'discountAmount'),
        paymentMethod: jStr(j, 'paymentMethod'),
        createdBy: jStr(j, 'createdBy'),
        createdAt: jDate(j, 'createdAt') ?? DateTime.now(),
        cancelledAt: jDate(j, 'cancelledAt'),
        items: jList(j, 'items', LineItem.fromJson),
      );

  String get tableLabel {
    if (tableName.isNotEmpty) return tableName;
    if (tableNumber > 0) return 'Table $tableNumber';
    return 'Parcel';
  }

  int get itemCount => items.fold(0, (s, i) => s + i.quantity);

  double get itemsTotal => items.fold(0.0, (s, i) => s + i.amount);

  double get value => totalAmount > 0 ? totalAmount : itemsTotal;
}

class Expense {
  final String id;
  final String categoryName;
  final String title;
  final String description;
  final double amount;
  final DateTime date;
  final String paymentMethod;
  final String vendor;
  final String createdBy;

  const Expense({
    required this.id,
    required this.categoryName,
    required this.title,
    required this.description,
    required this.amount,
    required this.date,
    required this.paymentMethod,
    required this.vendor,
    required this.createdBy,
  });

  factory Expense.fromJson(Json j) => Expense(
        id: jStr(j, 'id'),
        categoryName: jStr(j, 'categoryName', 'Uncategorised'),
        title: jStr(j, 'title', 'Expense'),
        description: jStr(j, 'description'),
        amount: jNum(j, 'amount'),
        date: jDate(j, 'expenseDate') ?? jDate(j, 'createdAt') ?? DateTime.now(),
        paymentMethod: jStr(j, 'paymentMethod'),
        vendor: jStr(j, 'vendor'),
        createdBy: jStr(j, 'createdBy'),
      );
}
