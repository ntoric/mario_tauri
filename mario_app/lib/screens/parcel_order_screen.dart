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
import '../widgets/order_ui.dart';

class ParcelOrderScreen extends StatefulWidget {
  final VoidCallback? onOrderSuccess;
  final bool showBack;
  final List<OrderItem>? initialItems;

  const ParcelOrderScreen({
    super.key,
    this.onOrderSuccess,
    this.showBack = false,
    this.initialItems,
  });

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
    if (widget.initialItems != null) {
      _orderItems.addAll(widget.initialItems!);
    }
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

  int get _itemCount =>
      _orderItems.fold<int>(0, (sum, item) => sum + item.quantity);

  int _quantityFor(String itemId) {
    for (final orderItem in _orderItems) {
      if (orderItem.itemId == itemId) return orderItem.quantity;
    }
    return 0;
  }

  String _categoryNameFor(Item item, List<Category> categories) {
    if (item.categoryName != null && item.categoryName!.isNotEmpty) {
      return item.categoryName!;
    }
    for (final category in categories) {
      if (category.id == item.categoryId) return category.name;
    }
    return 'Uncategorized';
  }

  Future<void> _confirmClearAll({VoidCallback? onCleared}) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Clear all items?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
            ),
            child: const Text('Clear'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _orderItems.clear());
      onCleared?.call();
    }
  }

  void _openOrderSummary() {
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(0.35),
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => SizedBox(
          height: MediaQuery.of(context).size.height * 0.88,
          child: _buildOrderItemsPanel(
            showHandle: true,
            onMutated: () => setSheetState(() {}),
            onClearAll: () => _confirmClearAll(
              onCleared: () => Navigator.pop(sheetContext),
            ),
            onAddMore: () => Navigator.pop(sheetContext),
            onAction: _orderItems.isEmpty
                ? null
                : () {
                    Navigator.pop(sheetContext);
                    _showCustomerDetailsDialog();
                  },
          ),
        ),
      ),
    );
  }

  Widget _buildOrderItemsPanel({
    required bool showHandle,
    VoidCallback? onMutated,
    VoidCallback? onClearAll,
    VoidCallback? onAddMore,
    VoidCallback? onAction,
  }) {
    return OrderItemsPanel(
      items: _orderItems,
      subtitle: '$_itemCount items • Parcel Order',
      subtotal: _subtotal,
      tax: _taxAmount,
      total: _total,
      actionLabel: 'Create Order',
      onIncrement: (item) {
        _addItem(item);
        onMutated?.call();
      },
      onDecrement: (itemId) {
        _removeItem(itemId);
        onMutated?.call();
      },
      onDelete: (itemId) {
        _deleteItem(itemId);
        onMutated?.call();
      },
      onClearAll: onClearAll ??
          () => _confirmClearAll(
                onCleared: () => setState(() => _showSummary = false),
              ),
      onAddMore: onAddMore ?? () => setState(() => _showSummary = false),
      onAction:
          onAction ?? (_orderItems.isEmpty ? null : _showCustomerDetailsDialog),
      isSaving: _isSaving,
      showHandle: showHandle,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final data = context.watch<DataProvider>();
    final categories = data.categories.toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
    final items = data.items.where((item) {
      final matchesCategory =
          _selectedCategoryId == null || item.categoryId == _selectedCategoryId;
      final matchesSearch = _searchQuery.isEmpty ||
          item.name.toLowerCase().contains(_searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    }).toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });

    final isWide = ResponsiveHelper.isTablet(context) ||
        ResponsiveHelper.isDesktop(context);

    final itemsList = Column(
      children: [
        SafeArea(
          bottom: false,
          child: ScreenHeader(
            title: 'Parcel order',
            showBack: widget.showBack,
            subtitle: auth.currentStore?.displayName,
            showSubtitleChevron: true,
            onSubtitleTap: () => AppHeader.showStoreSwitcher(context),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: OrderSearchField(
            onChanged: (value) => setState(() => _searchQuery = value),
          ),
        ),
        if (categories.isNotEmpty)
          CategoryChipsRow(
            categories: categories,
            selectedId: _selectedCategoryId,
            onSelected: (id) => setState(() => _selectedCategoryId = id),
          ),
        Expanded(
          child: _isLoadingItems
              ? const Center(child: CircularProgressIndicator())
              : items.isEmpty
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
                            _searchQuery.isNotEmpty ||
                                    _selectedCategoryId != null
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
                      padding: EdgeInsets.fromLTRB(16, 8, 16,
                          16 + MediaQuery.of(context).padding.bottom),
                      itemCount: items.length,
                      itemBuilder: (context, index) {
                        final item = items[index];
                        return MenuItemCard(
                          item: item,
                          categoryName: _categoryNameFor(item, categories),
                          quantity: _quantityFor(item.id),
                          onAdd: () => _addItem(item),
                          onRemove: () => _removeItem(item.id),
                          enabled: !_isSaving,
                        );
                      },
                    ),
        ),
      ],
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      extendBody: true,
      body: isWide
          ? Stack(
              children: [
                Positioned.fill(child: itemsList),
                if (_showSummary)
                  Positioned.fill(
                    child: GestureDetector(
                      onTap: () => setState(() => _showSummary = false),
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
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 300),
                  curve: Curves.easeInOutCubic,
                  right: _showSummary ? 0 : -420,
                  top: 0,
                  bottom: 0,
                  width: 400,
                  child: _buildOrderItemsPanel(showHandle: false),
                ),
              ],
            )
          : itemsList,
      bottomNavigationBar: _orderItems.isEmpty
          ? null
          : CartSummaryBar(
              count: _itemCount,
              total: _total,
              actionLabel: 'Create order',
              isSaving: _isSaving,
              onOpenCart: () {
                if (isWide) {
                  setState(() => _showSummary = true);
                } else {
                  _openOrderSummary();
                }
              },
              onAction: _isSaving ? null : _showCustomerDetailsDialog,
            ),
    );
  }

  void _showCustomerDetailsDialogUI(BuildContext context) {
    showDialog(
      context: context,
      barrierDismissible: !_isSaving,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          final palette = context.watch<ThemeProvider>().currentTheme;
          return AlertDialog(
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
                    color: palette.primary.withOpacity(0.1),
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
                          color: palette.primary,
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
                      activeColor: palette.primary,
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
                      activeColor: palette.primary,
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
                      activeColor: palette.primary,
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
                backgroundColor: palette.primary,
                foregroundColor: Colors.white,
              ),
            ),
          ],
          );
        },
      ),
    );
  }
}
