import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../models/order.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';

class BillScreen extends StatefulWidget {
  final Order order;

  const BillScreen({super.key, required this.order});

  @override
  State<BillScreen> createState() => _BillScreenState();
}

class _BillScreenState extends State<BillScreen> {
  String _selectedPaymentMethod = 'cash';
  final _customerNameController = TextEditingController();
  bool _isGenerating = false;

  final List<Map<String, dynamic>> _paymentMethods = [
    {'id': 'cash', 'name': 'Cash', 'icon': Icons.money},
    {'id': 'card', 'name': 'Card', 'icon': Icons.credit_card},
    {'id': 'upi', 'name': 'UPI', 'icon': Icons.qr_code},
  ];

  @override
  void dispose() {
    _customerNameController.dispose();
    super.dispose();
  }

  Future<void> _generateBill() async {
    setState(() => _isGenerating = true);

    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();

    try {
      final invoiceNo = await data.getNextInvoiceNo(auth.currentStore!.id);

      final billData = {
        'orderId': widget.order.id,
        'tableNumber': widget.order.tableNumber,
        'invoiceNo': invoiceNo,
        'items': widget.order.items
            .map((i) => {
                  'itemId': i.itemId,
                  'quantity': i.quantity,
                  'unitPrice': i.item.price,
                })
            .toList(),
        'subtotal': widget.order.totalAmount - widget.order.taxAmount,
        'taxTotal': widget.order.taxAmount,
        'discount': 0,
        'total': widget.order.totalAmount,
        'paymentMethod': _selectedPaymentMethod,
        'customerName': _customerNameController.text.isEmpty
            ? null
            : _customerNameController.text,
        'storeId': auth.currentStore!.id,
      };

      if (auth.currentStore?.remoteBillingEnabled == true) {
        await data.enqueueBill(billData);
      } else {
        await data.createBill(billData);
      }
      await data.completeOrder(widget.order.id,
          paymentMethod: _selectedPaymentMethod);

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Bill generated: $invoiceNo'),
            backgroundColor: AppColors.success,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: ${e.toString()}'),
            backgroundColor: AppColors.danger,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      }
    } finally {
      setState(() => _isGenerating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final subtotal = order.totalAmount - order.taxAmount;

    return Scaffold(
      appBar: const AppHeader(
        title: 'Generate Bill',
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(28),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [AppColors.cardDark, AppColors.cardDarkLight],
                ),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Total Amount',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.white.withOpacity(0.6),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '₹${order.totalAmount.toStringAsFixed(0)}',
                    style: const TextStyle(
                      fontSize: 44,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -1,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      'Table ${order.tableNumber}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 12),
              child: Text(
                'ORDER ITEMS',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.gray500,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            Container(
              decoration: BoxDecoration(
                color: AppColors.light,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.dark.withOpacity(0.04),
                    blurRadius: 16,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ...order.items.map((item) {
                      final itemTotal = item.item.price * item.quantity;
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.item.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 15,
                                      color: AppColors.dark,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${item.quantity} x ₹${item.item.price.toStringAsFixed(0)}',
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: AppColors.gray500,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '₹${itemTotal.toStringAsFixed(0)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                                color: AppColors.dark,
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                    const Divider(height: 32),
                    _buildBillRow('Subtotal', subtotal),
                    if (order.taxAmount > 0)
                      _buildBillRow('Tax', order.taxAmount),
                    const SizedBox(height: 8),
                    _buildBillRow('Total', order.totalAmount, isBold: true),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            const Padding(
              padding: EdgeInsets.only(left: 4, bottom: 12),
              child: Text(
                'PAYMENT METHOD',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.gray500,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            Row(
              children: _paymentMethods.map((method) {
                final isSelected = _selectedPaymentMethod == method['id'];
                final isLast = method['id'] == 'upi';
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: isLast ? 0 : 10),
                    child: GestureDetector(
                      onTap: () {
                        setState(() {
                          _selectedPaymentMethod = method['id'];
                        });
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        decoration: BoxDecoration(
                          color: isSelected ? AppColors.primary : AppColors.light,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isSelected ? AppColors.primary : AppColors.gray300,
                            width: 1.5,
                          ),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(
                                    color: AppColors.primary.withOpacity(0.3),
                                    blurRadius: 12,
                                    offset: const Offset(0, 4),
                                  ),
                                ]
                              : null,
                        ),
                        child: Column(
                          children: [
                            Icon(
                              method['icon'],
                              color: isSelected ? Colors.white : AppColors.gray500,
                              size: 24,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              method['name'],
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                color: isSelected ? Colors.white : AppColors.gray600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _customerNameController,
              decoration: const InputDecoration(
                labelText: 'Customer Name (Optional)',
                prefixIcon: Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: _isGenerating ? null : _generateBill,
                child: _isGenerating
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Text(
                        'Generate Bill',
                        style: TextStyle(fontSize: 18),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBillRow(String label, double amount, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: isBold ? 18 : 14,
              fontWeight: isBold ? FontWeight.w800 : FontWeight.w500,
              color: isBold ? AppColors.dark : AppColors.gray500,
            ),
          ),
          Text(
            '₹${amount.toStringAsFixed(0)}',
            style: TextStyle(
              fontSize: isBold ? 22 : 14,
              fontWeight: isBold ? FontWeight.w800 : FontWeight.w600,
              color: isBold ? AppColors.primary : AppColors.dark,
              letterSpacing: isBold ? -0.5 : 0,
            ),
          ),
        ],
      ),
    );
  }
}
