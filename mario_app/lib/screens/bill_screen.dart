import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/order.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';

// Forces typed/pasted input to uppercase — used for GSTIN fields.
class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    return TextEditingValue(
      text: newValue.text.toUpperCase(),
      selection: newValue.selection,
    );
  }
}

class BillScreen extends StatefulWidget {
  final Order order;

  const BillScreen({super.key, required this.order});

  @override
  State<BillScreen> createState() => _BillScreenState();
}

class _BillScreenState extends State<BillScreen> {
  static final RegExp _gstinRegex = RegExp(
    r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',
  );

  String _selectedPaymentMethod = 'cash';
  final _customerNameController = TextEditingController();
  final _buyerGstinController = TextEditingController();
  final _buyerNameController = TextEditingController();
  String? _gstinError;
  bool _isGenerating = false;

  // Authoritative bill breakdown computed by the backend (POST /bills/preview).
  // Null until loaded, or if the preview call fails — in which case the
  // screen falls back to the order's own subtotal/tax figures.
  Map<String, dynamic>? _preview;
  Timer? _previewDebounce;

  final List<Map<String, dynamic>> _paymentMethods = [
    {'id': 'cash', 'name': 'Cash', 'icon': Icons.money},
    {'id': 'card', 'name': 'Card', 'icon': Icons.credit_card},
    {'id': 'upi', 'name': 'UPI', 'icon': Icons.qr_code},
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refreshPreview());
  }

  @override
  void dispose() {
    _previewDebounce?.cancel();
    _customerNameController.dispose();
    _buyerGstinController.dispose();
    _buyerNameController.dispose();
    super.dispose();
  }

  bool _isValidGstin(String gstin) => _gstinRegex.hasMatch(gstin);

  // GST fields are hidden when the store has tax switched off.
  bool get _taxOn =>
      context.read<AuthProvider>().currentStore?.taxEnabled ?? false;

  Future<void> _refreshPreview() async {
    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();
    final storeId = auth.currentStore?.id;
    if (storeId == null) return;

    final gstin = _buyerGstinController.text.trim().toUpperCase();
    final preview = await data.previewBill({
      'storeId': storeId,
      'orderId': widget.order.id,
      if (gstin.isNotEmpty && _isValidGstin(gstin)) 'buyerGstin': gstin,
    });
    if (mounted) {
      setState(() => _preview = preview);
    }
  }

  void _onGstinChanged(String _) {
    final gstin = _buyerGstinController.text.trim().toUpperCase();
    setState(() {
      _gstinError =
          gstin.isEmpty || _isValidGstin(gstin) ? null : 'Invalid GSTIN format';
    });
    // The buyer's GSTIN determines place-of-supply/B2B treatment, so the
    // server-side preview refreshes as the user types (debounced).
    _previewDebounce?.cancel();
    _previewDebounce =
        Timer(const Duration(milliseconds: 300), _refreshPreview);
  }

  Future<void> _generateBill() async {
    final gstin = _buyerGstinController.text.trim().toUpperCase();
    if (gstin.isNotEmpty && !_isValidGstin(gstin)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Please enter a valid GSTIN'),
          backgroundColor: AppColors.danger,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
      return;
    }

    setState(() => _isGenerating = true);

    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();

    try {
      // The server computes all totals and allocates the invoice number —
      // the client only identifies the order, payment and buyer.
      final customerName = _customerNameController.text.trim();
      final buyerName = _buyerNameController.text.trim();
      final billData = {
        'orderId': widget.order.id,
        'storeId': auth.currentStore!.id,
        'paymentMethod': _selectedPaymentMethod,
        if (customerName.isNotEmpty) 'customerName': customerName,
        if (widget.order.customerMobile?.isNotEmpty == true)
          'customerMobile': widget.order.customerMobile,
        if (gstin.isNotEmpty) 'buyerGstin': gstin,
        if (buyerName.isNotEmpty) 'buyerName': buyerName,
      };

      String successMessage;
      if (auth.currentStore?.remoteBillingEnabled == true) {
        // The bill is still issued server-side; it's queued to the remote
        // printer, so no invoice number comes back to the app.
        final ok = await data.enqueueBill(billData);
        if (!ok) {
          throw Exception(data.error ?? 'Failed to send bill to printer');
        }
        successMessage = 'Bill sent to printer';
      } else {
        final bill = await data.createBill(billData);
        if (bill == null) {
          throw Exception(data.error ?? 'Failed to create bill');
        }
        successMessage = bill.invoiceNo != null
            ? 'Bill ${bill.invoiceNo} generated'
            : 'Bill generated';
      }
      await data.completeOrder(widget.order.id,
          paymentMethod: _selectedPaymentMethod);

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(successMessage),
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
    context.watch<ThemeProvider>();
    final order = widget.order;
    final subtotal = order.totalAmount - order.taxAmount;
    final previewTotal = (_preview?['total'] as num?)?.toDouble();

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
                    '₹${(previewTotal ?? order.totalAmount).toStringAsFixed(0)}',
                    style: const TextStyle(
                      fontSize: 44,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -1,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.gray100.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      order.tableLabel,
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
            Padding(
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
                color: AppColors.gray100,
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
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 15,
                                      color: AppColors.dark,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${item.quantity} x ₹${item.item.price.toStringAsFixed(0)}',
                                    style: TextStyle(
                                      fontSize: 13,
                                      color: AppColors.gray500,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '₹${itemTotal.toStringAsFixed(0)}',
                              style: TextStyle(
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
                    // Authoritative breakdown from the server when the
                    // preview succeeded; otherwise the order's own figures.
                    if (_preview != null)
                      ..._buildPreviewRows(_preview!)
                    else ...[
                      _buildBillRow('Subtotal', subtotal),
                      if (order.taxAmount > 0)
                        _buildBillRow('Tax', order.taxAmount),
                      const SizedBox(height: 8),
                      _buildBillRow('Total', order.totalAmount, isBold: true),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Padding(
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
                          color: isSelected
                              ? AppColors.primary
                              : AppColors.gray100,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isSelected
                                ? AppColors.primary
                                : AppColors.gray300,
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
                              color:
                                  isSelected ? Colors.white : AppColors.gray500,
                              size: 24,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              method['name'],
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: isSelected
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                                color: isSelected
                                    ? Colors.white
                                    : AppColors.gray600,
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
            const SizedBox(height: 16),
            // Optional B2B section — supplying a buyer GSTIN makes the
            // backend issue a B2B tax invoice.
            if (_taxOn)
              Container(
                decoration: BoxDecoration(
                  color: AppColors.gray100,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Theme(
                  data: Theme.of(context)
                      .copyWith(dividerColor: Colors.transparent),
                  child: ExpansionTile(
                    tilePadding: const EdgeInsets.symmetric(horizontal: 16),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    leading: Icon(
                      Icons.business_outlined,
                      color: AppColors.gray600,
                      size: 22,
                    ),
                    title: Text(
                      'Business customer (B2B)',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.dark,
                      ),
                    ),
                    subtitle: Text(
                      'Add GSTIN for a tax invoice',
                      style: TextStyle(fontSize: 12, color: AppColors.gray500),
                    ),
                    children: [
                      TextField(
                        controller: _buyerGstinController,
                        textCapitalization: TextCapitalization.characters,
                        inputFormatters: [
                          UpperCaseTextFormatter(),
                          LengthLimitingTextInputFormatter(15),
                        ],
                        decoration: InputDecoration(
                          labelText: 'Buyer GSTIN (optional)',
                          hintText: 'e.g. 27ABCDE1234F1Z5',
                          prefixIcon: const Icon(Icons.badge_outlined),
                          errorText: _gstinError,
                        ),
                        onChanged: _onGstinChanged,
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _buyerNameController,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          labelText: 'Buyer / Business Name (optional)',
                          prefixIcon: Icon(Icons.storefront_outlined),
                        ),
                      ),
                    ],
                  ),
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
                          valueColor:
                              AlwaysStoppedAnimation<Color>(Colors.white),
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

  // Renders the server-computed breakdown: taxable value, per-rate
  // CGST/SGST (or UTGST) / IGST rows from taxSummary, round off and total.
  List<Widget> _buildPreviewRows(Map<String, dynamic> preview) {
    double amount(String key) => (preview[key] as num?)?.toDouble() ?? 0;

    final rows = <Widget>[
      _buildBillRow('Taxable Value', amount('taxableValue'), decimals: 2),
    ];

    final isUtgst = preview['utgst'] == true;
    final summary = preview['taxSummary'] as List? ?? [];
    for (final entry in summary) {
      if (entry is! Map) continue;
      final rate = (entry['rate'] as num?)?.toDouble() ?? 0;
      final cgst = (entry['cgst'] as num?)?.toDouble() ?? 0;
      final sgst = (entry['sgst'] as num?)?.toDouble() ?? 0;
      final igst = (entry['igst'] as num?)?.toDouble() ?? 0;
      if (igst != 0) {
        rows.add(_buildBillRow('IGST ${_fmtRate(rate)}%', igst, decimals: 2));
      } else if (cgst != 0 || sgst != 0) {
        final half = _fmtRate(rate / 2);
        rows.add(_buildBillRow('CGST $half%', cgst, decimals: 2));
        rows.add(_buildBillRow('${isUtgst ? 'UTGST' : 'SGST'} $half%', sgst,
            decimals: 2));
      }
    }

    final roundOff = amount('roundOff');
    if (roundOff != 0) {
      rows.add(_buildBillRow('Round Off', roundOff, decimals: 2));
    }
    rows.add(const SizedBox(height: 8));
    rows.add(_buildBillRow('Total', amount('total'), isBold: true));
    return rows;
  }

  String _fmtRate(double rate) => rate == rate.truncateToDouble()
      ? rate.toStringAsFixed(0)
      : rate.toStringAsFixed(1);

  Widget _buildBillRow(String label, double amount,
      {bool isBold = false, int decimals = 0}) {
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
            '₹${amount.toStringAsFixed(decimals)}',
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
