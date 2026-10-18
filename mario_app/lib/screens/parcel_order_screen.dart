import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'dart:ui';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/item.dart';
import '../models/order.dart';
import '../models/category.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';

class ParcelOrderScreen extends StatefulWidget {
  final VoidCallback? onOrderSuccess;

  const ParcelOrderScreen({super.key, this.onOrderSuccess});

  @override
  State<ParcelOrderScreen> createState() => _ParcelOrderScreenState();
}

class _ParcelOrderScreenState extends State<ParcelOrderScreen> {
  final List<OrderItem> _orderItems = [];
  String? _selectedCategoryId;
  String _searchQuery = '';
  String _sortMode = 'name';
  bool _isLoadingItems = false;
  bool _isSaving = false;
  bool _showSummary = false;
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _notesController = TextEditingController();

  // Customer details
  final TextEditingController _customerNameController = TextEditingController();
  final TextEditingController _customerMobileController =
      TextEditingController();
  String _paymentMethod = 'cash';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() => _searchQuery = _searchController.text);
    });
    _fetchCategoriesAndItems();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _notesController.dispose();
    _customerNameController.dispose();
    _customerMobileController.dispose();
    super.dispose();
  }

  Future<void> _fetchCategoriesAndItems() async {
    setState(() => _isLoadingItems = true);
    try {
      final auth = context.read<AuthProvider>();
      if (auth.currentStore != null) {
        final data = context.read<DataProvider>();
        await Future.wait([
          data.loadCategories(auth.currentStore!.id),
          data.loadItems(auth.currentStore!.id),
        ]);
      }
    } catch (e) {
      print('Error fetching categories and items: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoadingItems = false);
      }
    }
  }

  double get _subtotal => _orderItems.fold(
        0,
        (sum, item) => sum + (item.item.price * item.quantity),
      );

  double get _taxAmount => _orderItems.fold(
        0,
        (sum, item) =>
            sum +
            (item.item.price *
                item.quantity *
                (item.item.taxPercent ?? 0) /
                100),
      );

  double get _total => _subtotal + _taxAmount;

  void _addItem(Item item) {
    setState(() {
      final existingIndex = _orderItems.indexWhere((i) => i.itemId == item.id);
      if (existingIndex >= 0) {
        _orderItems[existingIndex] = OrderItem(
          itemId: item.id,
          item: item,
          quantity: _orderItems[existingIndex].quantity + 1,
        );
      } else {
        _orderItems.add(OrderItem(
          itemId: item.id,
          item: item,
          quantity: 1,
        ));
      }
    });
  }

  void _removeItem(String itemId) {
    setState(() {
      final existingIndex = _orderItems.indexWhere((i) => i.itemId == itemId);
      if (existingIndex >= 0) {
        if (_orderItems[existingIndex].quantity > 1) {
          _orderItems[existingIndex] = OrderItem(
            itemId: itemId,
            item: _orderItems[existingIndex].item,
            quantity: _orderItems[existingIndex].quantity - 1,
          );
        } else {
          _orderItems.removeAt(existingIndex);
        }
      }
    });
  }

  void _deleteItem(String itemId) {
    setState(() {
      _orderItems.removeWhere((i) => i.itemId == itemId);
    });
  }

  void _showFeedback(String message, {bool isError = false}) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              isError ? Icons.error_outline : Icons.check_circle_outline,
              color: Colors.white,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
            ),
          ],
        ),
        backgroundColor: isError ? AppColors.danger : AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        margin: const EdgeInsets.all(16),
        duration: const Duration(seconds: 3),
      ),
    );

    try {
      Fluttertoast.showToast(
        msg: message,
        toastLength: Toast.LENGTH_SHORT,
        gravity: ToastGravity.BOTTOM,
        backgroundColor: isError ? AppColors.danger : AppColors.success,
        textColor: Colors.white,
        fontSize: 15.0,
      );
    } catch (_) {}
  }

  void _showCustomerDetailsDialog() {
    if (_orderItems.isEmpty) {
      _showFeedback('Please add items to the order', isError: true);
      return;
    }
    setState(() {
      _showSummary = false;
    });
    _showCustomerDetailsDialogUI(context);
  }

  Future<void> _submitOrder() async {
    if (_orderItems.isEmpty) return;

    setState(() => _isSaving = true);

    try {
      final auth = context.read<AuthProvider>();
      final data = context.read<DataProvider>();
      final storeId = auth.currentStore!.id;

      final orderNote = _notesController.text.trim();
      final itemsData = _orderItems
          .asMap()
          .entries
          .map((e) => {
                'itemId': e.value.itemId,
                'quantity': e.value.quantity,
                'unitPrice': e.value.item.price,
                'taxPercent': e.value.item.taxPercent ?? 0,
                // No order-level notes column — attach to the first item so it
                // reaches the kitchen/bill.
                'notes': e.key == 0 && orderNote.isNotEmpty
                    ? orderNote
                    : e.value.notes,
                'item': e.value.item.toJson(),
              })
          .toList();

      final order = await data.createParcelOrder(
        items: itemsData,
        totalAmount: _total,
        taxAmount: _taxAmount,
        storeId: storeId,
        paymentMethod: _paymentMethod,
        customerName: _customerNameController.text.trim().isEmpty
            ? null
            : _customerNameController.text.trim(),
        customerMobile: _customerMobileController.text.trim().isEmpty
            ? null
            : _customerMobileController.text.trim(),
      );

      if (order != null) {
        _showFeedback('Parcel order created successfully');
        if (mounted) {
          setState(() {
            _orderItems.clear();
            _showSummary = false;
            _notesController.clear();
            _customerNameController.clear();
            _customerMobileController.clear();
          });
          widget.onOrderSuccess?.call();
        }
      } else {
        _showFeedback(
          data.error ?? 'Failed to create parcel order. Please try again.',
          isError: true,
        );
      }
    } catch (e) {
      _showFeedback('Error processing order: ${e.toString()}', isError: true);
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<ThemeProvider>();
    final data = context.watch<DataProvider>();
    // IDs of disabled categories — items belonging to these are hidden from ordering.
    final disabledCategoryIds =
        data.categories.where((c) => !c.enabled).map((c) => c.id).toSet();
    final categoryNames = {for (var c in data.categories) c.id: c.name};
    final categories = data.categories.where((c) => c.enabled).toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        if (a.sortOrder != b.sortOrder) {
          return a.sortOrder.compareTo(b.sortOrder);
        }
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
    final categoryRank = {
      for (var i = 0; i < categories.length; i++) categories[i].id: i
    };
    final items = data.items.where((item) {
      if (!item.enabled) return false;
      if (disabledCategoryIds.contains(item.categoryId)) return false;
      final matchesCategory =
          _selectedCategoryId == null || item.categoryId == _selectedCategoryId;
      final query = _searchQuery.toLowerCase();
      final matchesSearch = _searchQuery.isEmpty ||
          item.name.toLowerCase().contains(query) ||
          (categoryNames[item.categoryId] ?? '').toLowerCase().contains(query);
      return matchesCategory && matchesSearch;
    }).toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        final ra = categoryRank[a.categoryId] ?? 1 << 30;
        final rb = categoryRank[b.categoryId] ?? 1 << 30;
        if (ra != rb) return ra - rb;
        switch (_sortMode) {
          case 'name_desc':
            return b.name.toLowerCase().compareTo(a.name.toLowerCase());
          case 'price_asc':
            return a.price.compareTo(b.price);
          case 'price_desc':
            return b.price.compareTo(a.price);
          default:
            return a.name.toLowerCase().compareTo(b.name.toLowerCase());
        }
      });

    final isTablet = ResponsiveHelper.isTablet(context) ||
        ResponsiveHelper.isDesktop(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Parcel Order',
      ),
      body: Stack(
        children: [
          // Menu Items Section
          Positioned.fill(
            child: _buildItemsSection(categories, items),
          ),

          // Glassmorphic Backdrop Blur
          if (_showSummary)
            Positioned.fill(
              child: GestureDetector(
                onTap: () {
                  setState(() {
                    _showSummary = false;
                  });
                },
                child: TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0.0, end: 1.0),
                  duration: const Duration(milliseconds: 250),
                  builder: (context, value, child) {
                    return Container(
                      color: Colors.black.withOpacity(0.3 * value),
                      child: BackdropFilter(
                        filter: ImageFilter.blur(
                          sigmaX: 5.0 * value,
                          sigmaY: 5.0 * value,
                        ),
                        child: const SizedBox.expand(),
                      ),
                    );
                  },
                ),
              ),
            ),

          // Sliding collapsible summary panel
          _buildSlidingSummaryPanel(isTablet),
        ],
      ),
      bottomNavigationBar: _buildBottomNavigationBar(),
    );
  }

  void _showCustomerDetailsDialogUI(BuildContext context) {
    showDialog(
      context: context,
      barrierDismissible: !_isSaving,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Customer Details'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Total Amount Display
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Total Amount',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        '₹${_total.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Customer Name
                TextField(
                  controller: _customerNameController,
                  decoration: const InputDecoration(
                    labelText: 'Customer Name (optional)',
                    hintText: 'e.g. John Doe',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                  enabled: !_isSaving,
                ),
                const SizedBox(height: 16),

                // Mobile Number
                TextField(
                  controller: _customerMobileController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Mobile Number (optional)',
                    hintText: 'e.g. 9876543210',
                    prefixIcon: Icon(Icons.phone_outlined),
                  ),
                  enabled: !_isSaving,
                ),
                const SizedBox(height: 20),

                // Payment Method
                const Text(
                  'Payment Method',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Column(
                  children: [
                    RadioListTile<String>(
                      title: const Text('Cash'),
                      value: 'cash',
                      groupValue: _paymentMethod,
                      onChanged: _isSaving
                          ? null
                          : (value) {
                              setDialogState(() => _paymentMethod = value!);
                              setState(() => _paymentMethod = value!);
                            },
                      activeColor: AppColors.primary,
                    ),
                    RadioListTile<String>(
                      title: const Text('Card'),
                      value: 'card',
                      groupValue: _paymentMethod,
                      onChanged: _isSaving
                          ? null
                          : (value) {
                              setDialogState(() => _paymentMethod = value!);
                              setState(() => _paymentMethod = value!);
                            },
                      activeColor: AppColors.primary,
                    ),
                    RadioListTile<String>(
                      title: const Text('UPI'),
                      value: 'upi',
                      groupValue: _paymentMethod,
                      onChanged: _isSaving
                          ? null
                          : (value) {
                              setDialogState(() => _paymentMethod = value!);
                              setState(() => _paymentMethod = value!);
                            },
                      activeColor: AppColors.primary,
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: _isSaving
                  ? null
                  : () {
                      Navigator.pop(dialogContext);
                    },
              child: const Text('Cancel'),
            ),
            ElevatedButton.icon(
              onPressed: _isSaving
                  ? null
                  : () async {
                      Navigator.pop(dialogContext);
                      await _submitOrder();
                    },
              icon: _isSaving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.check_circle_outline, size: 20),
              label: Text(_isSaving ? 'Processing...' : 'Submit'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget? _buildBottomNavigationBar() {
    if (_orderItems.isEmpty) return null;

    final count = _orderItems.fold<int>(0, (sum, item) => sum + item.quantity);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.gray100,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.08),
            blurRadius: 10,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10.0),
          child: Row(
            children: [
              // Cart icon with count badge
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      color: AppColors.primarySoft.withOpacity(0.6),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      Icons.shopping_cart_outlined,
                      color: AppColors.primary,
                      size: 22,
                    ),
                  ),
                  Positioned(
                    right: -4,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(
                        color: AppColors.danger,
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(
                        minWidth: 18,
                        minHeight: 18,
                      ),
                      child: Center(
                        child: Text(
                          '$count',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Total ($count ${count == 1 ? 'item' : 'items'})',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.gray600,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '₹${_total.toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              ElevatedButton(
                onPressed: () {
                  setState(() => _showSummary = true);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  elevation: 0,
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Review Order',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    SizedBox(width: 4),
                    Icon(Icons.chevron_right, size: 18),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSlidingSummaryPanel(bool isWideScreen) {
    if (isWideScreen) {
      // Right slide-in sidebar panel for tablets and desktops
      return AnimatedPositioned(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOutCubic,
        right: _showSummary ? 0 : -420,
        top: 0,
        bottom: 0,
        width: 400,
        child: Card(
          margin: EdgeInsets.zero,
          elevation: 16,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.horizontal(left: Radius.circular(20)),
          ),
          child: ClipRRect(
            borderRadius:
                const BorderRadius.horizontal(left: Radius.circular(20)),
            child: _buildOrderSummaryContent(),
          ),
        ),
      );
    } else {
      // Bottom slide-up panel for mobile screens
      return AnimatedPositioned(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOutCubic,
        left: 0,
        right: 0,
        bottom: _showSummary ? 0 : -MediaQuery.of(context).size.height,
        height: MediaQuery.of(context).size.height * 0.75,
        child: Card(
          margin: EdgeInsets.zero,
          elevation: 16,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            child: Column(
              children: [
                const SizedBox(height: 12),
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.gray400,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Expanded(
                  child: _buildOrderSummaryContent(),
                ),
              ],
            ),
          ),
        ),
      );
    }
  }

  Widget _buildOrderSummaryContent() {
    final count = _orderItems.fold<int>(0, (s, i) => s + i.quantity);
    final data = context.read<DataProvider>();
    final categoryNames = {for (var c in data.categories) c.id: c.name};

    return Container(
      color: AppColors.background,
      child: Column(
        children: [
          // Header: Order Items + count + Clear All
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 16, 10),
            child: Row(
              children: [
                Text(
                  'Order Items',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '$count ${count == 1 ? 'item' : 'items'}',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.gray500,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: _orderItems.isEmpty
                      ? null
                      : () => setState(() {
                            _orderItems.clear();
                            _showSummary = false;
                          }),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.danger.withOpacity(0.10),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.delete_outline,
                          size: 15,
                          color: AppColors.danger,
                        ),
                        SizedBox(width: 4),
                        Text(
                          'Clear All',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.danger,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Cart items + notes (scrollable)
          Expanded(
            child: _orderItems.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.shopping_cart_outlined,
                          size: 64,
                          color: AppColors.gray400,
                        ),
                        SizedBox(height: 16),
                        Text(
                          'No items added yet',
                          style: TextStyle(color: AppColors.gray600),
                        ),
                      ],
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: [
                      ..._orderItems.map(
                        (oi) => _cartCard(
                          oi,
                          categoryNames[oi.item.categoryId] ??
                              oi.item.categoryName ??
                              'Uncategorized',
                        ),
                      ),
                      const SizedBox(height: 6),
                      _dashedDivider(),
                      const SizedBox(height: 18),
                      Row(
                        children: [
                          Icon(
                            Icons.description_outlined,
                            size: 16,
                            color: AppColors.gray700,
                          ),
                          SizedBox(width: 6),
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: 'Order Notes ',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.dark,
                                  ),
                                ),
                                TextSpan(
                                  text: '(Optional)',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w400,
                                    color: AppColors.gray500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _notesController,
                        maxLines: 3,
                        minLines: 2,
                        decoration: InputDecoration(
                          hintText:
                              'Add special instructions for this parcel order...',
                          hintStyle: TextStyle(
                            fontSize: 13,
                            color: AppColors.gray400,
                          ),
                          filled: true,
                          fillColor: Colors.white,
                          contentPadding: const EdgeInsets.all(14),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                  ),
          ),

          // Order Summary card + CTA
          Container(
            margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.gray100,
              borderRadius: BorderRadius.circular(20),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: AppColors.primarySoft.withOpacity(0.7),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          Icons.receipt_long,
                          size: 16,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'Order Summary',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: AppColors.dark,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _summaryRow(
                      'Subtotal ($count ${count == 1 ? 'item' : 'items'})',
                      _subtotal),
                  const SizedBox(height: 8),
                  _summaryRow('Tax', _taxAmount),
                  Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Divider(height: 1, color: AppColors.gray200),
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Total',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: AppColors.dark,
                        ),
                      ),
                      Text(
                        '₹${_total.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _isSaving ? null : _showCustomerDetailsDialog,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 15),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (_isSaving)
                            const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          else ...[
                            const Icon(Icons.shopping_bag_outlined, size: 20),
                            const SizedBox(width: 8),
                            const Text(
                              'Create Parcel Order',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(Icons.arrow_forward, size: 18),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryRow(String label, double amount) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(fontSize: 13.5, color: AppColors.gray700),
        ),
        Text(
          '₹${amount.toStringAsFixed(2)}',
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: AppColors.dark,
          ),
        ),
      ],
    );
  }

  Widget _dashedDivider() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final dashCount = (constraints.maxWidth / 9).floor();
        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(
            dashCount,
            (_) => Container(width: 4, height: 1.2, color: AppColors.gray300),
          ),
        );
      },
    );
  }

  Widget _cartCard(OrderItem orderItem, String categoryName) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.gray100,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: AppColors.primarySoft.withOpacity(0.6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.fastfood_outlined,
              size: 26,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  orderItem.item.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
                const SizedBox(height: 5),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft.withOpacity(0.7),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    categoryName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryDark,
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '₹${orderItem.item.price.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap:
                        _isSaving ? null : () => _removeItem(orderItem.itemId),
                    child: Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        color: AppColors.gray200,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.remove,
                        size: 15,
                        color: AppColors.gray700,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 9),
                    child: Text(
                      '${orderItem.quantity}',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: _isSaving ? null : () => _addItem(orderItem.item),
                    child: Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        color: AppColors.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.add,
                        size: 15,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: _isSaving ? null : () => _deleteItem(orderItem.itemId),
            child: const Icon(
              Icons.delete_outline,
              size: 18,
              color: AppColors.danger,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItemsSection(List<Category> categories, List<Item> items) {
    if (_isLoadingItems) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        // Search + sort button
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
          child: Row(
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.gray100,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: ClayStyles.raisedShadow(
                      blur: 14,
                      darkOffset: const Offset(5, 5),
                      lightOffset: const Offset(-5, -5),
                    ),
                  ),
                  child: TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search menu items...',
                      hintStyle: TextStyle(
                        fontSize: 14,
                        color: AppColors.gray400,
                      ),
                      prefixIcon: Icon(
                        Icons.search,
                        color: AppColors.gray500,
                        size: 20,
                      ),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                              icon: Icon(
                                Icons.close,
                                size: 18,
                                color: AppColors.gray500,
                              ),
                              onPressed: () => _searchController.clear(),
                            )
                          : null,
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 13),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: _showSortSheet,
                child: Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    color: AppColors.gray100,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: ClayStyles.raisedShadow(
                      blur: 14,
                      darkOffset: const Offset(5, 5),
                      lightOffset: const Offset(-5, -5),
                    ),
                  ),
                  child: Icon(
                    Icons.tune_rounded,
                    color: AppColors.gray700,
                    size: 20,
                  ),
                ),
              ),
            ],
          ),
        ),

        // Category pills
        if (categories.isNotEmpty)
          SizedBox(
            height: 40,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: categories.length + 1,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return _categoryPill(
                    label: 'All',
                    isSelected: _selectedCategoryId == null,
                    onTap: () => setState(() => _selectedCategoryId = null),
                  );
                }
                final cat = categories[index - 1];
                return _categoryPill(
                  label: cat.name,
                  isSelected: _selectedCategoryId == cat.id,
                  onTap: () => setState(() {
                    _selectedCategoryId =
                        _selectedCategoryId == cat.id ? null : cat.id;
                  }),
                );
              },
            ),
          ),
        const SizedBox(height: 12),

        // Items list
        Expanded(
          child: items.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.fastfood_outlined,
                        size: 64,
                        color: AppColors.gray400,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        _searchQuery.isNotEmpty || _selectedCategoryId != null
                            ? 'No matching items found'
                            : 'No items available',
                        style: TextStyle(
                          fontSize: 16,
                          color: AppColors.gray600,
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  itemCount: items.length,
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final category = categories.firstWhere(
                      (cat) => cat.id == item.categoryId,
                      orElse: () => Category(
                          id: '',
                          name: 'Uncategorized',
                          storeId: '',
                          isActive: true),
                    );
                    return _buildItemCard(item, category.name);
                  },
                ),
        ),
      ],
    );
  }

  Widget _categoryPill({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 18),
          decoration: BoxDecoration(
            color: isSelected ? AppColors.primary : Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: AppColors.dark.withOpacity(0.08),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: isSelected ? Colors.white : AppColors.gray700,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildItemCard(Item item, String categoryName) {
    final qty = _orderItems
        .where((i) => i.itemId == item.id)
        .fold<int>(0, (s, i) => s + i.quantity);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.gray100,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: AppColors.primarySoft.withOpacity(0.6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.fastfood_outlined,
              size: 26,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
                const SizedBox(height: 5),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft.withOpacity(0.7),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    categoryName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryDark,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            '₹${item.price.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(width: 10),
          if (qty == 0)
            GestureDetector(
              onTap: _isSaving ? null : () => _addItem(item),
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.add, color: Colors.white, size: 18),
              ),
            )
          else
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                GestureDetector(
                  onTap: _isSaving ? null : () => _removeItem(item.id),
                  child: Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: AppColors.gray100,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.primary, width: 1.4),
                    ),
                    child: Icon(
                      Icons.remove,
                      color: AppColors.primary,
                      size: 15,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    '$qty',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: _isSaving ? null : () => _addItem(item),
                  child: Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.add,
                      color: Colors.white,
                      size: 15,
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }

  void _showSortSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        Widget option(String mode, String label) {
          final selected = _sortMode == mode;
          return ListTile(
            onTap: () {
              setState(() => _sortMode = mode);
              Navigator.pop(ctx);
            },
            leading: Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_off_outlined,
              color: selected ? AppColors.primary : AppColors.gray500,
              size: 20,
            ),
            title: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? AppColors.primary : AppColors.dark,
              ),
            ),
          );
        }

        return Container(
          decoration: BoxDecoration(
            color: AppColors.gray100,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.fromLTRB(8, 14, 8, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Text(
                  'Sort by',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.dark,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              option('name', 'Name (A–Z)'),
              option('name_desc', 'Name (Z–A)'),
              option('price_asc', 'Price: Low to High'),
              option('price_desc', 'Price: High to Low'),
            ],
          ),
        );
      },
    );
  }
}
