import 'catalog.dart';
import 'json.dart';
import 'sales.dart';

/// GET /reports/revenue — headline totals plus (unless summaryOnly) every
/// bill and expense in the period.
class RevenueReport {
  final double totalRevenue;
  final double totalExpenses;
  final double netProfit;
  final int totalOrders;
  final int totalBills;
  final int totalExpenseCount;
  final double averageOrderValue;
  final List<Bill> bills;
  final List<Expense> expenses;

  const RevenueReport({
    required this.totalRevenue,
    required this.totalExpenses,
    required this.netProfit,
    required this.totalOrders,
    required this.totalBills,
    required this.totalExpenseCount,
    required this.averageOrderValue,
    required this.bills,
    required this.expenses,
  });

  factory RevenueReport.fromJson(Json j) => RevenueReport(
        totalRevenue: jNum(j, 'totalRevenue'),
        totalExpenses: jNum(j, 'totalExpenses'),
        netProfit: jNum(j, 'netProfit'),
        totalOrders: jInt(j, 'totalOrders'),
        totalBills: jInt(j, 'totalBills'),
        totalExpenseCount: jInt(j, 'totalExpenseCount'),
        averageOrderValue: jNum(j, 'averageOrderValue'),
        bills: jList(j, 'bills', Bill.fromJson),
        expenses: jList(j, 'expenses', Expense.fromJson),
      );

  /// Average bill value. Falls back to revenue/bills when the server's
  /// order-based average is unavailable.
  double get avgBill => totalBills > 0 ? totalRevenue / totalBills : averageOrderValue;
}

class SalesProfitRow {
  final String itemId;
  final String name;
  final String category;
  final int qtySold;
  final double revenue;
  final double prepCost;
  final double profit;
  final double profitPercent;
  final bool hasCostData;

  const SalesProfitRow({
    required this.itemId,
    required this.name,
    required this.category,
    required this.qtySold,
    required this.revenue,
    required this.prepCost,
    required this.profit,
    required this.profitPercent,
    required this.hasCostData,
  });

  factory SalesProfitRow.fromJson(Json j) => SalesProfitRow(
        itemId: jStr(j, 'itemId'),
        name: jStr(j, 'name', 'Item'),
        category: jStr(j, 'category', 'Uncategorised'),
        qtySold: jInt(j, 'qtySold'),
        revenue: jNum(j, 'revenue'),
        prepCost: jNum(j, 'prepCost'),
        profit: jNum(j, 'profit'),
        profitPercent: jNum(j, 'profitPercent'),
        hasCostData: jBool(j, 'hasCostData'),
      );
}

/// GET /reports/sales-profit — per item sales with preparation cost.
class SalesProfitReport {
  final List<SalesProfitRow> rows;
  final int unitsSold;
  final double revenue;
  final double prepCost;
  final double profit;
  final double trackedRevenue;
  final double untrackedRevenue;
  final int itemsSold;
  final int itemsWithCostSold;

  const SalesProfitReport({
    required this.rows,
    required this.unitsSold,
    required this.revenue,
    required this.prepCost,
    required this.profit,
    required this.trackedRevenue,
    required this.untrackedRevenue,
    required this.itemsSold,
    required this.itemsWithCostSold,
  });

  factory SalesProfitReport.fromJson(Json j) => SalesProfitReport(
        rows: jList(j, 'rows', SalesProfitRow.fromJson),
        unitsSold: jInt(j, 'unitsSold'),
        revenue: jNum(j, 'revenue'),
        prepCost: jNum(j, 'prepCost'),
        profit: jNum(j, 'profit'),
        trackedRevenue: jNum(j, 'trackedRevenue'),
        untrackedRevenue: jNum(j, 'untrackedRevenue'),
        itemsSold: jInt(j, 'itemsSold'),
        itemsWithCostSold: jInt(j, 'itemsWithCostSold'),
      );

  /// Margin on the revenue that has cost data behind it.
  double get trackedMargin => trackedRevenue > 0 ? profit / trackedRevenue * 100 : 0;
}

class CategorySale {
  final String categoryId;
  final String category;
  final int count;
  final double revenue;

  const CategorySale({required this.categoryId, required this.category, required this.count, required this.revenue});

  factory CategorySale.fromJson(Json j) => CategorySale(
        categoryId: jStr(j, 'categoryId'),
        category: jStr(j, 'category', 'Uncategorised'),
        count: jInt(j, 'count'),
        revenue: jNum(j, 'revenue'),
      );
}

class DatedSale {
  final String id;
  final String name;
  final String category;
  final String date;
  final int count;
  final double revenue;

  const DatedSale({
    required this.id,
    required this.name,
    required this.category,
    required this.date,
    required this.count,
    required this.revenue,
  });
}

/// GET /reports/top-selling-categories
class CategorySalesReport {
  final List<CategorySale> totals;
  final List<DatedSale> rows;
  final int totalCount;
  final double totalRevenue;

  const CategorySalesReport({required this.totals, required this.rows, required this.totalCount, required this.totalRevenue});

  factory CategorySalesReport.fromJson(Json j) {
    final totals = jList(j, 'categoryTotals', CategorySale.fromJson)..sort((a, b) => b.revenue.compareTo(a.revenue));
    return CategorySalesReport(
      totals: totals,
      rows: jList(
        j,
        'rows',
        (r) => DatedSale(
          id: jStr(r, 'categoryId'),
          name: jStr(r, 'category', 'Uncategorised'),
          category: jStr(r, 'category'),
          date: jStr(r, 'date'),
          count: jInt(r, 'count'),
          revenue: jNum(r, 'revenue'),
        ),
      ),
      totalCount: jInt(j, 'totalCount'),
      totalRevenue: jNum(j, 'totalRevenue'),
    );
  }
}

class MenuProfitEntry {
  final MenuItem item;
  final double totalCost;
  final double profit;
  final double profitPercent;
  final List<CostComponent> costs;

  const MenuProfitEntry({
    required this.item,
    required this.totalCost,
    required this.profit,
    required this.profitPercent,
    required this.costs,
  });

  factory MenuProfitEntry.fromJson(Json j) => MenuProfitEntry(
        item: MenuItem.fromJson(asMap(j['item'])),
        totalCost: jNum(j, 'totalCost'),
        profit: jNum(j, 'profit'),
        profitPercent: jNum(j, 'profitPercent'),
        costs: jList(j, 'expenses', CostComponent.fromJson),
      );
}

class CostComponent {
  final String name;
  final double amount;

  const CostComponent({required this.name, required this.amount});

  factory CostComponent.fromJson(Json j) => CostComponent(name: jStr(j, 'name', 'Cost'), amount: jNum(j, 'amount'));
}

/// GET /reports/menu-profit — menu economics (price vs. preparation cost).
class MenuProfitReport {
  final List<MenuProfitEntry> rows;
  final int totalItems;
  final int itemsWithCostCount;
  final double totalSellingValue;
  final double totalCost;
  final double totalProfit;
  final double averageProfitPercent;

  const MenuProfitReport({
    required this.rows,
    required this.totalItems,
    required this.itemsWithCostCount,
    required this.totalSellingValue,
    required this.totalCost,
    required this.totalProfit,
    required this.averageProfitPercent,
  });

  factory MenuProfitReport.fromJson(Json j) => MenuProfitReport(
        rows: jList(j, 'rows', MenuProfitEntry.fromJson),
        totalItems: jInt(j, 'totalItems'),
        itemsWithCostCount: jInt(j, 'itemsWithCostCount'),
        totalSellingValue: jNum(j, 'totalSellingValue'),
        totalCost: jNum(j, 'totalCost'),
        totalProfit: jNum(j, 'totalProfit'),
        averageProfitPercent: jNum(j, 'averageProfitPercent'),
      );
}

class ExpenseByCategory {
  final String category;
  final double amount;
  final int count;

  const ExpenseByCategory({required this.category, required this.amount, required this.count});

  factory ExpenseByCategory.fromJson(Json j) => ExpenseByCategory(
        category: jStr(j, 'categoryName', 'Uncategorised'),
        amount: jNum(j, 'totalAmount'),
        count: jInt(j, 'expenseCount'),
      );
}

class GstTotals {
  final double taxableValue;
  final double cgst;
  final double sgst;
  final double igst;
  final double cess;

  const GstTotals({required this.taxableValue, required this.cgst, required this.sgst, required this.igst, required this.cess});

  factory GstTotals.fromJson(Json j) => GstTotals(
        taxableValue: jNum(j, 'taxableValue'),
        cgst: jNum(j, 'cgst'),
        sgst: jNum(j, 'sgst'),
        igst: jNum(j, 'igst'),
        cess: jNum(j, 'cess'),
      );

  double get totalTax => cgst + sgst + igst + cess;
}

class GstRateRow {
  final double rate;
  final GstTotals totals;

  const GstRateRow({required this.rate, required this.totals});
}

/// GET /reports/gst/summary
class GstSummary {
  final String registrationType;
  final int invoiceCount;
  final int cancelledCount;
  final double invoiceValue;
  final GstTotals invoices;
  final int creditNoteCount;
  final double creditNoteTotal;
  final GstTotals net;
  final List<GstRateRow> rateWise;
  final int legacyBillsExcluded;
  final double? compositionTax;

  const GstSummary({
    required this.registrationType,
    required this.invoiceCount,
    required this.cancelledCount,
    required this.invoiceValue,
    required this.invoices,
    required this.creditNoteCount,
    required this.creditNoteTotal,
    required this.net,
    required this.rateWise,
    required this.legacyBillsExcluded,
    required this.compositionTax,
  });

  factory GstSummary.fromJson(Json j) {
    final inv = asMap(j['invoices']);
    final cn = asMap(j['creditNotes']);
    final comp = j['composition'] is Map ? asMap(j['composition']) : null;
    final rates = (j['rateWise'] is List ? j['rateWise'] as List : const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .map((r) => GstRateRow(rate: jNum(r, 'rate'), totals: GstTotals.fromJson(r)))
        .toList()
      ..sort((a, b) => a.rate.compareTo(b.rate));
    return GstSummary(
      registrationType: jStr(j, 'registrationType'),
      invoiceCount: jInt(inv, 'count'),
      cancelledCount: jInt(inv, 'cancelledCount'),
      invoiceValue: jNum(inv, 'invoiceValue'),
      invoices: GstTotals.fromJson(inv),
      creditNoteCount: jInt(cn, 'count'),
      creditNoteTotal: jNum(cn, 'total'),
      net: GstTotals.fromJson(asMap(j['net'])),
      rateWise: rates,
      legacyBillsExcluded: jInt(j, 'legacyBillsExcluded'),
      compositionTax: comp == null ? null : jNum(comp, 'total'),
    );
  }
}
