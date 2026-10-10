import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/theme_provider.dart';
import '../models/category.dart';
import '../models/item.dart';
import '../models/order.dart';
import '../utils/constants.dart';
import 'app_header.dart';

class ScreenHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final VoidCallback? onSubtitleTap;
  final bool showSubtitleChevron;

  /// null = auto-detect from `ModalRoute.canPop`.
  final bool? showBack;
  final bool showStoreAction;

  const ScreenHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.onSubtitleTap,
    this.showSubtitleChevron = false,
    this.showBack,
    this.showStoreAction = true,
  });

  @override
  Widget build(BuildContext context) {
    return HeaderBar(
      title: title,
      subtitle: subtitle,
      onSubtitleTap: onSubtitleTap,
      showSubtitleChevron: showSubtitleChevron && showStoreAction,
      showBack: showBack,
    );
  }
}

class OrderSearchField extends StatefulWidget {
  final ValueChanged<String> onChanged;
  final String hintText;

  const OrderSearchField({
    super.key,
    required this.onChanged,
    this.hintText = 'Search items...',
  });

  @override
  State<OrderSearchField> createState() => _OrderSearchFieldState();
}

class _OrderSearchFieldState extends State<OrderSearchField> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 54,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: TextField(
        controller: _controller,
        onChanged: widget.onChanged,
        style: const TextStyle(fontSize: 16, color: AppColors.dark),
        decoration: InputDecoration(
          hintText: widget.hintText,
          hintStyle: const TextStyle(fontSize: 16, color: AppColors.gray500),
          prefixIcon: const Icon(Icons.search, size: 26, color: AppColors.dark),
          suffixIcon: _controller.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.close,
                      size: 20, color: AppColors.gray600),
                  onPressed: () {
                    _controller.clear();
                    widget.onChanged('');
                    setState(() {});
                  },
                )
              : null,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        ),
      ),
    );
  }
}

class CategoryChipsRow extends StatelessWidget {
  final List<Category> categories;
  final String? selectedId;
  final ValueChanged<String?> onSelected;

  const CategoryChipsRow({
    super.key,
    required this.categories,
    required this.selectedId,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;

    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _chip(
              label: 'All',
              selected: selectedId == null,
              onTap: () => onSelected(null),
              palette: palette),
          for (final category in categories)
            _chip(
              label: category.name,
              selected: selectedId == category.id,
              onTap: () =>
                  onSelected(selectedId == category.id ? null : category.id),
              palette: palette,
            ),
        ],
      ),
    );
  }

  Widget _chip({
    required String label,
    required bool selected,
    required VoidCallback onTap,
    required AppThemeOption palette,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            decoration: BoxDecoration(
              color: selected ? palette.primaryDark : Colors.white,
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Center(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                  color: selected ? Colors.white : AppColors.dark,
                ),
                maxLines: 1,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ItemThumb extends StatelessWidget {
  final Item item;
  final double size;

  const ItemThumb({super.key, required this.item, this.size = 64});

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.white, palette.primarySoft],
        ),
      ),
      child: Icon(
        Icons.restaurant_rounded,
        size: size * 0.42,
        color: palette.primary.withOpacity(0.7),
      ),
    );
  }
}

class MenuItemCard extends StatelessWidget {
  final Item item;
  final String categoryName;
  final int quantity;
  final VoidCallback onAdd;
  final VoidCallback onRemove;
  final bool enabled;

  const MenuItemCard({
    super.key,
    required this.item,
    required this.categoryName,
    required this.quantity,
    required this.onAdd,
    required this.onRemove,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.black.withOpacity(0.04)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onAdd : null,
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                ItemThumb(item: item, size: 64),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (item.isFavourite)
                            const Padding(
                              padding: EdgeInsets.only(right: 4, top: 2),
                              child: Icon(Icons.star,
                                  size: 14, color: Colors.amber),
                            ),
                          Expanded(
                            child: Text(
                              item.name,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: AppColors.dark,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: palette.highlight.withOpacity(0.10),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          categoryName.toUpperCase(),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: palette.highlight,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        '₹${item.price.toStringAsFixed(2)}',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: palette.highlight,
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (quantity == 0)
                      InkWell(
                        onTap: enabled ? onAdd : null,
                        customBorder: const CircleBorder(),
                        child: Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            color: palette.primaryDark,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.add,
                              size: 20, color: Colors.white),
                        ),
                      )
                    else
                      Container(
                        padding: const EdgeInsets.all(3),
                        decoration: BoxDecoration(
                          color: palette.primarySoft,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            InkWell(
                              onTap: enabled ? onRemove : null,
                              customBorder: const CircleBorder(),
                              child: const SizedBox(
                                width: 28,
                                height: 28,
                                child: Icon(Icons.remove,
                                    size: 18, color: AppColors.dark),
                              ),
                            ),
                            SizedBox(
                              width: 24,
                              child: Text(
                                '$quantity',
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.dark,
                                ),
                              ),
                            ),
                            InkWell(
                              onTap: enabled ? onAdd : null,
                              customBorder: const CircleBorder(),
                              child: Container(
                                width: 28,
                                height: 28,
                                decoration: BoxDecoration(
                                  color: palette.primaryDark,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.add,
                                    size: 18, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class CartSummaryBar extends StatelessWidget {
  final int count;
  final double total;
  final String actionLabel;
  final VoidCallback onOpenCart;
  final VoidCallback? onAction;
  final bool isSaving;

  const CartSummaryBar({
    super.key,
    required this.count,
    required this.total,
    required this.actionLabel,
    required this.onOpenCart,
    required this.onAction,
    this.isSaving = false,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;

    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.10),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            InkWell(
              onTap: onOpenCart,
              borderRadius: BorderRadius.circular(16),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: palette.primarySoft,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(Icons.shopping_cart,
                        color: palette.primaryDark, size: 26),
                  ),
                  Positioned(
                    top: -4,
                    right: -4,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      constraints:
                          const BoxConstraints(minWidth: 20, minHeight: 20),
                      decoration: BoxDecoration(
                        color: palette.highlight,
                        shape: BoxShape.circle,
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
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: InkWell(
                onTap: onOpenCart,
                borderRadius: BorderRadius.circular(8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Total ($count ${count == 1 ? 'item' : 'items'})',
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.gray600,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '₹${total.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 180),
              child: Material(
                color: onAction == null
                    ? palette.highlight.withOpacity(0.5)
                    : palette.highlight,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  onTap: isSaving ? null : onAction,
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    height: 52,
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (isSaving)
                          const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        else
                          const Icon(Icons.shopping_bag,
                              size: 20, color: Colors.white),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            actionLabel,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class OrderItemsPanel extends StatelessWidget {
  final List<OrderItem> items;
  final String subtitle;
  final double subtotal;
  final double tax;
  final double total;
  final String actionLabel;
  final ValueChanged<Item> onIncrement;
  final ValueChanged<String> onDecrement;
  final ValueChanged<String> onDelete;
  final VoidCallback onClearAll;
  final VoidCallback onAddMore;
  final VoidCallback? onAction;
  final bool isSaving;
  final bool showHandle;

  const OrderItemsPanel({
    super.key,
    required this.items,
    required this.subtitle,
    required this.subtotal,
    required this.tax,
    required this.total,
    required this.actionLabel,
    required this.onIncrement,
    required this.onDecrement,
    required this.onDelete,
    required this.onClearAll,
    required this.onAddMore,
    required this.onAction,
    this.isSaving = false,
    this.showHandle = true,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.watch<ThemeProvider>().currentTheme;

    return Container(
      decoration: BoxDecoration(
        color: palette.background,
        borderRadius: showHandle
            ? const BorderRadius.vertical(top: Radius.circular(28))
            : const BorderRadius.horizontal(left: Radius.circular(28)),
      ),
      child: Column(
        children: [
          if (showHandle) ...[
            const SizedBox(height: 10),
            Container(
              width: 44,
              height: 5,
              decoration: BoxDecoration(
                color: AppColors.gray400,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ],
          Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: palette.highlight.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.shopping_bag,
                      color: palette.highlight, size: 26),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Order Items',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: AppColors.dark,
                        ),
                      ),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.gray600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                if (items.isNotEmpty)
                  InkWell(
                    onTap: onClearAll,
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: AppColors.danger.withOpacity(0.3)),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.delete_outline,
                              size: 18, color: AppColors.danger),
                          SizedBox(width: 4),
                          Text(
                            'Clear All',
                            style: TextStyle(
                              fontSize: 14,
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
          Expanded(
            child: items.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.shopping_cart_outlined,
                            size: 64, color: AppColors.gray400),
                        SizedBox(height: 16),
                        Text(
                          'No items added yet',
                          style: TextStyle(color: AppColors.gray600),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: items.length,
                    itemBuilder: (context, index) =>
                        _panelRow(context, items[index], palette),
                  ),
          ),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: palette.highlight.withOpacity(0.06),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                _totalRow('Subtotal', subtotal),
                _totalRow('Tax', tax),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Divider(height: 1),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Total',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          '₹${total.toStringAsFixed(2)}',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: palette.highlight,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.06),
                  blurRadius: 10,
                  offset: const Offset(0, -4),
                ),
              ],
            ),
            padding: const EdgeInsets.all(16),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: onAddMore,
                      borderRadius: BorderRadius.circular(16),
                      child: Container(
                        height: 56,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border:
                              Border.all(color: AppColors.gray300, width: 1.5),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_circle_outline,
                                size: 20, color: AppColors.dark),
                            SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                'Add More Items',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.dark,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Material(
                      color: items.isEmpty
                          ? palette.highlight.withOpacity(0.4)
                          : palette.highlight,
                      borderRadius: BorderRadius.circular(16),
                      child: InkWell(
                        onTap: (isSaving || items.isEmpty) ? null : onAction,
                        borderRadius: BorderRadius.circular(16),
                        child: SizedBox(
                          height: 56,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (isSaving)
                                const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              else
                                const Icon(Icons.shopping_bag,
                                    size: 20, color: Colors.white),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(
                                  actionLabel,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
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

  Widget _totalRow(String label, double amount) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 14, color: AppColors.gray600),
          ),
          Flexible(
            child: Text(
              '₹${amount.toStringAsFixed(2)}',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.dark,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  Widget _panelRow(
      BuildContext context, OrderItem orderItem, AppThemeOption palette) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          ItemThumb(item: orderItem.item, size: 72),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  orderItem.item.name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppColors.dark,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 4),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    '₹${orderItem.item.price.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: palette.highlight,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  InkWell(
                    onTap: () => onDecrement(orderItem.itemId),
                    customBorder: const CircleBorder(),
                    child: Container(
                      width: 34,
                      height: 34,
                      decoration: const BoxDecoration(
                        color: AppColors.gray200,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.remove,
                          size: 18, color: AppColors.dark),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.gray200,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(
                      child: Text(
                        '${orderItem.quantity}',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppColors.dark,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  InkWell(
                    onTap: () => onIncrement(orderItem.item),
                    customBorder: const CircleBorder(),
                    child: Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: palette.highlight,
                        shape: BoxShape.circle,
                      ),
                      child:
                          const Icon(Icons.add, size: 18, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(width: 4),
          InkWell(
            onTap: () => onDelete(orderItem.itemId),
            borderRadius: BorderRadius.circular(8),
            child: const Padding(
              padding: EdgeInsets.all(4),
              child:
                  Icon(Icons.delete_outline, size: 24, color: AppColors.danger),
            ),
          ),
        ],
      ),
    );
  }
}
