import 'package:flutter/material.dart';
import '../models/order.dart';
import '../models/table.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';

/// Table picker + move-order flow. Returns true when the order was moved.
Future<bool> showMoveTableDialog(
  BuildContext parentContext,
  Order order,
  List<TableModel> tables,
  DataProvider data,
) async {
  final availableTables = tables
      .where((t) => t.id != order.tableId && !data.isTableOccupied(t.id))
      .toList();

  if (availableTables.isEmpty) {
    ScaffoldMessenger.of(parentContext).showSnackBar(
      const SnackBar(
        content: Text('No available tables to move to'),
        backgroundColor: AppColors.warning,
      ),
    );
    return false;
  }

  final navigator = Navigator.of(parentContext);
  final scaffoldMessenger = ScaffoldMessenger.of(parentContext);

  final table = await showDialog<TableModel>(
    context: parentContext,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
      ),
      contentPadding: EdgeInsets.zero,
      titlePadding: EdgeInsets.zero,
      content: Container(
        width: double.maxFinite,
        padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
        decoration: ClayStyles.surface(radiusValue: 30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Move Order to Table',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.dark,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Choose a free table for this active order',
              style: TextStyle(
                color: AppColors.gray500,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 18),
            GridView.builder(
              shrinkWrap: true,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                childAspectRatio: 1,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
              ),
              itemCount: availableTables.length,
              itemBuilder: (itemBuilderContext, index) {
                final table = availableTables[index];
                return InkWell(
                  onTap: () => Navigator.pop(dialogContext, table),
                  borderRadius: ClayStyles.radius(18),
                  child: Container(
                    decoration: ClayStyles.surface(
                      radiusValue: 18,
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          AppColors.gray100,
                          AppColors.clayBlue.withOpacity(0.65),
                        ],
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          table.label,
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: AppColors.dark,
                          ),
                        ),
                        Text(
                          '${table.seats} seats',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.gray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  if (table == null || !parentContext.mounted) return false;

  showDialog(
    context: parentContext,
    barrierDismissible: false,
    builder: (loadingContext) => Center(
      child: CircularProgressIndicator(
        color: AppColors.primary,
      ),
    ),
  );

  try {
    final success = await data.moveOrderToTable(
      order.id,
      table.id,
      table.number,
    );

    navigator.pop();

    scaffoldMessenger.showSnackBar(
      SnackBar(
        content: Text(success
            ? 'Order moved to ${table.label}'
            : (data.error ?? 'Failed to move order.')),
        backgroundColor: success ? AppColors.success : AppColors.danger,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
    return success;
  } catch (e) {
    navigator.pop();
    scaffoldMessenger.showSnackBar(
      SnackBar(
        content: Text('Error: ${e.toString()}'),
        backgroundColor: AppColors.danger,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
    return false;
  }
}

/// Occupied-table picker + merge-orders flow. The picked table's order merges
/// into [order] and its table is freed. Returns true when merged.
Future<bool> showMergeBillDialog(
  BuildContext parentContext,
  Order order,
  List<TableModel> tables,
  DataProvider data,
) async {
  // Only tables with an active order can be merged into this one.
  final occupiedTables = tables
      .where((t) => t.id != order.tableId && data.isTableOccupied(t.id))
      .toList();

  if (occupiedTables.isEmpty) {
    ScaffoldMessenger.of(parentContext).showSnackBar(
      const SnackBar(
        content: Text('No other occupied tables to merge with'),
        backgroundColor: AppColors.warning,
      ),
    );
    return false;
  }

  final navigator = Navigator.of(parentContext);
  final scaffoldMessenger = ScaffoldMessenger.of(parentContext);

  final table = await showDialog<TableModel>(
    context: parentContext,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
      ),
      contentPadding: EdgeInsets.zero,
      titlePadding: EdgeInsets.zero,
      content: Container(
        width: double.maxFinite,
        padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
        decoration: ClayStyles.surface(radiusValue: 30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Merge Bill',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.dark,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Pick an occupied table — its order merges into ${order.tableLabel} and the table is freed',
              style: TextStyle(
                color: AppColors.gray500,
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 18),
            GridView.builder(
              shrinkWrap: true,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                childAspectRatio: 1,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
              ),
              itemCount: occupiedTables.length,
              itemBuilder: (itemBuilderContext, index) {
                final table = occupiedTables[index];
                final otherOrder = data.getOrderForTable(table.id);
                return InkWell(
                  onTap: () => Navigator.pop(dialogContext, table),
                  borderRadius: ClayStyles.radius(18),
                  child: Container(
                    decoration: ClayStyles.surface(
                      radiusValue: 18,
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          AppColors.gray100,
                          AppColors.clayBlue.withOpacity(0.65),
                        ],
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          table.label,
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: AppColors.dark,
                          ),
                        ),
                        Text(
                          '₹${(otherOrder?.totalAmount ?? 0).toStringAsFixed(0)}',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.gray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: const Text('Cancel'),
              ),
            ),
          ],
        ),
      ),
    ),
  );

  final otherOrder = table == null ? null : data.getOrderForTable(table.id);
  if (table == null || otherOrder == null || !parentContext.mounted) {
    return false;
  }

  showDialog(
    context: parentContext,
    barrierDismissible: false,
    builder: (loadingContext) => Center(
      child: CircularProgressIndicator(
        color: AppColors.primary,
      ),
    ),
  );

  try {
    final merged = await data.mergeOrders(order.id, otherOrder.id);

    navigator.pop();

    scaffoldMessenger.showSnackBar(
      SnackBar(
        content: Text(merged != null
            ? '${table.label} order merged — table freed'
            : (data.error ?? 'Failed to merge orders.')),
        backgroundColor: merged != null ? AppColors.success : AppColors.danger,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
    return merged != null;
  } catch (e) {
    navigator.pop();
    scaffoldMessenger.showSnackBar(
      SnackBar(
        content: Text('Error: ${e.toString()}'),
        backgroundColor: AppColors.danger,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
    return false;
  }
}

/// Confirm + cancel-order flow. Returns true when the order was cancelled.
Future<bool> cancelOrderFlow(
  BuildContext context,
  Order order,
  DataProvider data,
) async {
  final navigator = Navigator.of(context);
  final scaffoldMessenger = ScaffoldMessenger.of(context);

  final confirm = await showDialog<bool>(
    context: navigator.context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Cancel Order?'),
      content: const Text('Are you sure you want to cancel this order?'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('No'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.danger,
          ),
          child: const Text('Yes, Cancel'),
        ),
      ],
    ),
  );

  if (confirm != true) return false;

  showDialog(
    context: navigator.context,
    barrierDismissible: false,
    builder: (loadingContext) => Center(
      child: CircularProgressIndicator(
        color: AppColors.primary,
      ),
    ),
  );

  try {
    final success = await data.cancelOrder(order.id);
    navigator.pop();

    scaffoldMessenger.showSnackBar(
      SnackBar(
        content: Text(success
            ? 'Order cancelled and table released'
            : (data.error ?? 'Failed to cancel order.')),
        backgroundColor: AppColors.danger,
      ),
    );
    return success;
  } catch (e) {
    navigator.pop();
    scaffoldMessenger.showSnackBar(
      SnackBar(
        content: Text('Error: ${e.toString()}'),
        backgroundColor: AppColors.danger,
      ),
    );
    return false;
  }
}
