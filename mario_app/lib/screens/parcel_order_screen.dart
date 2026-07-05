import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'dart:ui';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
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
  bool _isLoadingItems = false;
  bool _isSaving = false;
  bool _showSummary = false;

  // Customer details
  final TextEditingController _customerNameController = TextEditingController();
  final TextEditingController _customerMobileController =
      TextEditingController();
  String _paymentMethod = 'cash';

  @override
  void initState() {
    super.initState();
    _fetchCategoriesAndItems();
  }

  @override
  void dispose() {
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

      final itemsData = _orderItems
          .map((i) => {
                'itemId': i.itemId,
                'quantity': i.quantity,
                'unitPrice': i.item.price,
                'taxPercent': i.item.taxPercent ?? 0,
                'item': i.item.toJson(),
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
    final data = context.watch<DataProvider>();
    final categories = data.categories;
    final items = data.items.where((item) {
      final matchesCategory =
          _selectedCategoryId == null || item.categoryId == _selectedCategoryId;
      final matchesSearch = _searchQuery.isEmpty ||
          item.name.toLowerCase().contains(_searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    }).toList();

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
      floatingActionButton: _buildFloatingActionButton(),
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
                        style: const TextStyle(
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

  Widget? _buildFloatingActionButton() {
    final count = _orderItems.fold<int>(0, (sum, item) => sum + item.quantity);
    if (count == 0 && !_showSummary) return null;

    return FloatingActionButton(
      onPressed: () {
        setState(() {
          _showSummary = !_showSummary;
        });
      },
      backgroundColor: AppColors.primary,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior: Clip.none,
        children: [
          Icon(
            _showSummary ? Icons.close : Icons.shopping_cart,
            color: Colors.white,
            size: 26,
          ),
          if (count > 0 && !_showSummary)
            Positioned(
              right: -6,
              top: -6,
              child: AnimatedScale(
                scale: count > 0 ? 1.0 : 0.0,
                duration: const Duration(milliseconds: 200),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(
                    color: AppColors.danger,
                    shape: BoxShape.circle,
                  ),
                  constraints: const BoxConstraints(
                    minWidth: 20,
                    minHeight: 20,
                  ),
                  child: Center(
                    child: Text(
                      '$count',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget? _buildBottomNavigationBar() {
    if (_orderItems.isEmpty) return null;

    final count = _orderItems.fold<int>(0, (sum, item) => sum + item.quantity);

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
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
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Total ($count ${count == 1 ? 'item' : 'items'})',
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.gray600,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '₹${_total.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              ElevatedButton.icon(
                onPressed: _isSaving ? null : _showCustomerDetailsDialog,
                icon: _isSaving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.shopping_bag, size: 20),
                label: const Text('Create Order'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  elevation: 2,
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
    return Column(
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const Text(
                'Order Items',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const Spacer(),
              Text(
                '${_orderItems.length} items',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.gray600,
                ),
              ),
            ],
          ),
        ),

        const Divider(height: 1),

        // Order Items List
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _orderItems.length,
            itemBuilder: (context, index) {
              final orderItem = _orderItems[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              orderItem.item.name,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 15,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '₹${orderItem.item.price.toStringAsFixed(2)}',
                              style: TextStyle(
                                color: AppColors.gray600,
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Row(
                        children: [
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline),
                            onPressed: () => _removeItem(orderItem.itemId),
                            iconSize: 24,
                          ),
                          Text(
                            '${orderItem.quantity}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.add_circle_outline),
                            onPressed: () => _addItem(orderItem.item),
                            iconSize: 24,
                          ),
                          IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () => _deleteItem(orderItem.itemId),
                            iconSize: 24,
                            color: AppColors.danger,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),

        // Total Summary
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.light,
            border: Border(
              top: BorderSide(color: AppColors.gray200),
            ),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Subtotal'),
                  Text('₹${_subtotal.toStringAsFixed(2)}'),
                ],
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Tax'),
                  Text('₹${_taxAmount.toStringAsFixed(2)}'),
                ],
              ),
              const Divider(),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Total',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                  Text(
                    '₹${_total.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildItemsSection(List<Category> categories, List<Item> items) {
    if (_isLoadingItems) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        // Search Bar
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            onChanged: (value) => setState(() => _searchQuery = value),
            decoration: InputDecoration(
              hintText: 'Search items...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () => setState(() => _searchQuery = ''),
                    )
                  : null,
              contentPadding: const EdgeInsets.symmetric(
                vertical: 12,
                horizontal: 16,
              ),
              fillColor: AppColors.light,
              filled: true,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
          ),
        ),

        // Category Filter
        if (categories.isNotEmpty)
          SizedBox(
            height: 50,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                _buildCategoryChip(
                  label: 'All',
                  isSelected: _selectedCategoryId == null,
                  onTap: () {
                    setState(() => _selectedCategoryId = null);
                  },
                ),
                const SizedBox(width: 8),
                ...categories.map((cat) {
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: _buildCategoryChip(
                      label: cat.name,
                      isSelected: _selectedCategoryId == cat.id,
                      onTap: () {
                        setState(() {
                          _selectedCategoryId =
                              _selectedCategoryId == cat.id ? null : cat.id;
                        });
                      },
                    ),
                  );
                }),
              ],
            ),
          ),

        const SizedBox(height: 8),

        // Items List
        Expanded(
          child: items.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.fastfood_outlined,
                        size: 64,
                        color: AppColors.gray400,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        _searchQuery.isNotEmpty || _selectedCategoryId != null
                            ? 'No matching items found'
                            : 'No items available',
                        style: const TextStyle(
                          fontSize: 16,
                          color: AppColors.gray600,
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
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
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      elevation: 1,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: InkWell(
                        onTap: () => _addItem(item),
                        borderRadius: BorderRadius.circular(12),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      item.name,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color:
                                            AppColors.primary.withOpacity(0.1),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        category.name,
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: AppColors.primary,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                '₹${item.price.toStringAsFixed(2)}',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.primary,
                                  fontSize: 18,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Icon(
                                Icons.add_circle_outline,
                                color: AppColors.primary,
                                size: 28,
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildCategoryChip({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          alignment: Alignment.center,
          constraints: const BoxConstraints(minHeight: 36),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: isSelected
                ? AppColors.primary.withOpacity(0.2)
                : AppColors.gray200,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.transparent),
            boxShadow: [
              BoxShadow(
                color: AppColors.dark.withOpacity(0.15),
                blurRadius: 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              height: 1,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              color: AppColors.primary,
            ),
          ),
        ),
      ),
    );
  }
}
