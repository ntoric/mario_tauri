// ignore_for_file: unused_local_variable
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/category.dart';
import '../models/item.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';
import '../widgets/order_ui.dart';

class CategoriesItemsScreen extends StatefulWidget {
  const CategoriesItemsScreen({super.key});

  @override
  State<CategoriesItemsScreen> createState() => _CategoriesItemsScreenState();
}

class _CategoriesItemsScreenState extends State<CategoriesItemsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _itemSearchController = TextEditingController();
  final TextEditingController _categorySearchController =
      TextEditingController();
  String _selectedCategoryId = 'all';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (mounted) {
        setState(() {});
      }
    });
    _itemSearchController.addListener(() {
      setState(() {});
    });
    _categorySearchController.addListener(() {
      setState(() {});
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _itemSearchController.dispose();
    _categorySearchController.dispose();
    super.dispose();
  }

  Future<void> _refreshData() async {
    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();
    if (auth.currentStore != null) {
      await data.loadCategories(auth.currentStore!.id);
      await data.loadItems(auth.currentStore!.id);
    }
  }

  // --- Category Dialog Form ---
  void _showCategoryDialog({Category? category}) {
    final nameController = TextEditingController(text: category?.name ?? '');
    final descriptionController =
        TextEditingController(text: category?.description ?? '');
    final formKey = GlobalKey<FormState>();
    final messenger = ScaffoldMessenger.of(context);

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(category == null ? 'Add Category' : 'Edit Category'),
          content: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: nameController,
                  autofocus: true,
                  decoration: const InputDecoration(
                    labelText: 'Category Name *',
                    hintText: 'e.g., Starters, Main Course, Desserts',
                    prefixIcon: Icon(Icons.label_outline),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'Please enter category name';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: descriptionController,
                  decoration: const InputDecoration(
                    labelText: 'Description',
                    hintText: 'Short description of this category',
                    prefixIcon: Icon(Icons.description_outlined),
                  ),
                  maxLines: 2,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () async {
                if (formKey.currentState!.validate()) {
                  final name = nameController.text.trim();
                  final description = descriptionController.text.trim().isEmpty
                      ? null
                      : descriptionController.text.trim();

                  final auth = context.read<AuthProvider>();
                  final data = context.read<DataProvider>();
                  final storeId = auth.currentStore?.id;

                  Navigator.pop(context); // Close dialog

                  if (storeId == null) return;

                  final ok = await data.saveCategory(
                    existing: category,
                    storeId: storeId,
                    name: name,
                    description: description,
                  );

                  messenger.showSnackBar(
                    SnackBar(
                      content: Text(ok
                          ? (category == null
                              ? 'Category added'
                              : 'Category updated')
                          : (data.error ??
                              'Failed to save category')),
                      backgroundColor:
                          ok ? AppColors.success : AppColors.danger,
                    ),
                  );
                }
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
    );
  }

  // --- Item Dialog Form ---
  void _showItemDialog({Item? item}) {
    final nameController = TextEditingController(text: item?.name ?? '');
    final priceController = TextEditingController(
        text: item != null ? item.price.toStringAsFixed(2) : '');
    final hsnController = TextEditingController(text: item?.hsnCode ?? '');
    final taxController = TextEditingController(
      text: item?.taxPercent?.toStringAsFixed(1) ?? '0.0',
    );
    final descriptionController =
        TextEditingController(text: item?.description ?? '');
    final formKey = GlobalKey<FormState>();

    final data = context.read<DataProvider>();
    final categories = data.categories;
    final messenger = ScaffoldMessenger.of(context);

    if (categories.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please add at least one category before adding items'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    String selectedCatId =
        item != null && categories.any((c) => c.id == item.categoryId)
            ? item.categoryId
            : (_selectedCategoryId != 'all' &&
                    categories.any((c) => c.id == _selectedCategoryId)
                ? _selectedCategoryId
                : categories.first.id);

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            return AlertDialog(
              title: Text(item == null ? 'Add Food Item' : 'Edit Food Item'),
              content: SingleChildScrollView(
                child: Form(
                  key: formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextFormField(
                        controller: nameController,
                        autofocus: true,
                        decoration: const InputDecoration(
                          labelText: 'Item Name *',
                          hintText: 'e.g., Margherita Pizza, Masala Chai',
                          prefixIcon: Icon(Icons.fastfood_outlined),
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Please enter item name';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        value: selectedCatId,
                        decoration: const InputDecoration(
                          labelText: 'Category *',
                          prefixIcon: Icon(Icons.category_outlined),
                        ),
                        items: categories.map((cat) {
                          return DropdownMenuItem<String>(
                            value: cat.id,
                            child: Text(cat.name),
                          );
                        }).toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setStateDialog(() => selectedCatId = val);
                          }
                        },
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: priceController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              decoration: const InputDecoration(
                                labelText: 'Price * (₹)',
                                hintText: '0.00',
                                prefixIcon: Icon(Icons.currency_rupee),
                              ),
                              validator: (value) {
                                if (value == null || value.trim().isEmpty) {
                                  return 'Enter price';
                                }
                                final p = double.tryParse(value);
                                if (p == null || p < 0) {
                                  return 'Invalid price';
                                }
                                return null;
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: taxController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              decoration: const InputDecoration(
                                labelText: 'Tax (%)',
                                hintText: '5.0',
                                prefixIcon: Icon(Icons.percent),
                              ),
                              validator: (value) {
                                if (value == null || value.trim().isEmpty) {
                                  return 'Enter tax';
                                }
                                final t = double.tryParse(value);
                                if (t == null || t < 0) {
                                  return 'Invalid tax';
                                }
                                return null;
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: hsnController,
                        decoration: const InputDecoration(
                          labelText: 'HSN / SAC Code',
                          hintText: 'e.g., 9963',
                          prefixIcon: Icon(Icons.pin_outlined),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: descriptionController,
                        decoration: const InputDecoration(
                          labelText: 'Description',
                          hintText: 'Ingredients or details',
                          prefixIcon: Icon(Icons.description_outlined),
                        ),
                        maxLines: 2,
                      ),
                    ],
                  ),
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () async {
                    if (formKey.currentState!.validate()) {
                      final name = nameController.text.trim();
                      final price = double.parse(priceController.text);
                      final tax = double.parse(taxController.text);
                      final hsn = hsnController.text.trim().isEmpty
                          ? null
                          : hsnController.text.trim();
                      final description =
                          descriptionController.text.trim().isEmpty
                              ? null
                              : descriptionController.text.trim();

                      final auth = context.read<AuthProvider>();
                      final data = context.read<DataProvider>();
                      final storeId = auth.currentStore?.id;

                      Navigator.pop(context); // Close dialog

                      if (storeId == null) return;

                      final ok = await data.saveItem(
                        existing: item,
                        storeId: storeId,
                        categoryId: selectedCatId,
                        name: name,
                        description: description,
                        price: price,
                        hsnCode: hsn,
                        taxPercent: tax,
                      );

                      messenger.showSnackBar(
                        SnackBar(
                          content: Text(ok
                              ? (item == null
                                  ? 'Item added'
                                  : 'Item updated')
                              : (data.error ?? 'Failed to save item')),
                          backgroundColor:
                              ok ? AppColors.success : AppColors.danger,
                        ),
                      );
                    }
                  },
                  child: const Text('Save'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = context.watch<DataProvider>();
    final canManage = context.watch<AuthProvider>().canManageMenu;

    final palette = context.watch<ThemeProvider>().currentTheme;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppHeader(
        title: 'Menu',
        actions: [
          if (canManage)
            HeaderIconButton(
              icon: Icons.add_rounded,
              tooltip: _tabController.index == 0
                  ? 'Add category'
                  : 'Add item',
              onTap: () => _tabController.index == 0
                  ? _showCategoryDialog()
                  : _showItemDialog(),
            ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(70),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Container(
              height: 58,
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppColors.gray200),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: _menuSegment(
                      icon: Icons.category_outlined,
                      label: 'Categories',
                      count: data.categories.length,
                      index: 0,
                      palette: palette,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: _menuSegment(
                      icon: Icons.fastfood_outlined,
                      label: 'Items',
                      count: data.items.length,
                      index: 1,
                      palette: palette,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildCategoriesTab(data),
          _buildItemsTab(data),
        ],
      ),
    );
  }

  Widget _menuSegment({
    required IconData icon,
    required String label,
    required int count,
    required int index,
    required AppThemeOption palette,
  }) {
    final isSelected = _tabController.index == index;
    final fg = isSelected ? Colors.white : AppColors.gray600;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      height: double.infinity,
      decoration: BoxDecoration(
        color: isSelected ? palette.primary : Colors.transparent,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () => _tabController.animateTo(index),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 19, color: fg),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight:
                          isSelected ? FontWeight.w700 : FontWeight.w600,
                      color: fg,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: isSelected
                        ? Colors.white.withOpacity(0.25)
                        : AppColors.gray200,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color:
                          isSelected ? Colors.white : AppColors.gray700,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // --- Categories Tab ---
  Widget _buildCategoriesTab(DataProvider data) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final categories = data.categories.toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });

    final canManage = context.read<AuthProvider>().canManageMenu;

    if (categories.isEmpty) {
      return RefreshIndicator(
        color: palette.primary,
        onRefresh: _refreshData,
        child: _emptyState(
          icon: Icons.category_outlined,
          title: 'No categories yet',
          subtitle: canManage
              ? 'Add your first category to build the menu.'
              : 'Categories added on the desktop app will appear here.',
          actionLabel: canManage ? 'Add category' : null,
          onAction: canManage ? _showCategoryDialog : null,
          palette: palette,
        ),
      );
    }

    final crossAxisCount = ResponsiveHelper.isDesktop(context)
        ? 3
        : ResponsiveHelper.isTablet(context)
            ? 2
            : 1;

    final catQuery = _categorySearchController.text.toLowerCase().trim();
    final filtered = catQuery.isEmpty
        ? categories
        : categories
            .where((c) =>
                c.name.toLowerCase().contains(catQuery) ||
                (c.description?.toLowerCase().contains(catQuery) ?? false))
            .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: _searchField(
            controller: _categorySearchController,
            hint: 'Search categories',
            palette: palette,
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  catQuery.isEmpty
                      ? '${categories.length} categories · ${data.items.length} items'
                      : '${filtered.length} of ${categories.length} categories',
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.gray600),
                ),
              ),
              if (catQuery.isNotEmpty)
                TextButton(
                  onPressed: () => _categorySearchController.clear(),
                  style: TextButton.styleFrom(
                    foregroundColor: palette.primary,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Clear',
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600)),
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: palette.primary,
            onRefresh: _refreshData,
            child: filtered.isEmpty
                ? _emptyState(
                    icon: Icons.search_off_rounded,
                    title: 'No matching categories',
                    subtitle: 'Try a different search.',
                    actionLabel: 'Clear search',
                    onAction: () => _categorySearchController.clear(),
                    palette: palette,
                  )
                : crossAxisCount == 1
                    ? ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.fromLTRB(16, 4, 16,
                            24 + MediaQuery.of(context).padding.bottom),
                        itemCount: filtered.length,
                        itemBuilder: (context, index) {
                          final cat = filtered[index];
                          final itemsCount = data.items
                              .where((i) => i.categoryId == cat.id)
                              .length;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child:
                                _categoryCard(cat, itemsCount, palette),
                          );
                        },
                      )
                    : GridView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.fromLTRB(16, 4, 16,
                            24 + MediaQuery.of(context).padding.bottom),
                        gridDelegate:
                            SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: crossAxisCount,
                          mainAxisExtent: 100,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: filtered.length,
                        itemBuilder: (context, index) {
                          final cat = filtered[index];
                          final itemsCount = data.items
                              .where((i) => i.categoryId == cat.id)
                              .length;
                          return _categoryCard(cat, itemsCount, palette);
                        },
                      ),
          ),
        ),
      ],
    );
  }

  Widget _searchField({
    required TextEditingController controller,
    required String hint,
    required AppThemeOption palette,
  }) {
    return TextSelectionTheme(
      data: TextSelectionThemeData(
        cursorColor: palette.primary,
        selectionColor: palette.primary.withOpacity(0.25),
        selectionHandleColor: palette.primary,
      ),
      child: SizedBox(
        height: 48,
        child: TextField(
          controller: controller,
          cursorColor: palette.primary,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle:
                const TextStyle(fontSize: 14, color: AppColors.gray500),
            prefixIcon: const Icon(Icons.search_rounded,
                size: 20, color: AppColors.gray600),
            suffixIcon: controller.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.close_rounded,
                        size: 18, color: AppColors.gray600),
                    onPressed: () => controller.clear(),
                  )
                : null,
            filled: true,
            fillColor: Colors.white,
            contentPadding: EdgeInsets.zero,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: AppColors.gray200),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide(color: palette.primary),
            ),
          ),
        ),
      ),
    );
  }

  Widget _cardMenu({
    required VoidCallback onEdit,
    required bool isFavourite,
    required VoidCallback onToggleFavourite,
  }) {
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert_rounded,
          size: 20, color: AppColors.gray500),
      padding: EdgeInsets.zero,
      tooltip: 'Options',
      onSelected: (value) {
        if (value == 'edit') onEdit();
        if (value == 'favourite') onToggleFavourite();
      },
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          value: 'favourite',
          height: 40,
          child: Row(
            children: [
              Icon(
                isFavourite
                    ? Icons.star_rounded
                    : Icons.star_outline_rounded,
                size: 18,
                color: isFavourite
                    ? Colors.amber[700]
                    : AppColors.gray700,
              ),
              const SizedBox(width: 8),
              Text(isFavourite
                  ? 'Remove favourite'
                  : 'Mark as favourite'),
            ],
          ),
        ),
        const PopupMenuItem<String>(
          value: 'edit',
          height: 40,
          child: Row(
            children: [
              Icon(Icons.edit_outlined, size: 18, color: AppColors.gray700),
              SizedBox(width: 8),
              Text('Edit'),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _toggleCategoryFavourite(Category cat) async {
    final data = context.read<DataProvider>();
    final ok = await data.toggleCategoryFavourite(cat);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(data.error ?? 'Failed to update favourite'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  Future<void> _toggleItemFavourite(Item item) async {
    final data = context.read<DataProvider>();
    final ok = await data.toggleItemFavourite(item);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(data.error ?? 'Failed to update favourite'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  Widget _categoryCard(Category cat, int itemsCount, AppThemeOption palette) {
    final canManage = context.read<AuthProvider>().canManageMenu;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: () {
          setState(() {
            _selectedCategoryId = cat.id;
            _itemSearchController.clear();
          });
          _tabController.animateTo(1);
        },
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.gray200),
            boxShadow: [
              BoxShadow(
                color: AppColors.dark.withOpacity(0.04),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: palette.primarySoft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(Icons.category_rounded,
                    color: palette.primary, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            cat.name,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: AppColors.dark,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (cat.isFavourite) ...[
                          const SizedBox(width: 4),
                          Icon(Icons.star_rounded,
                              size: 16, color: Colors.amber[600]),
                        ],
                      ],
                    ),
                    if (cat.description != null &&
                        cat.description!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          cat.description!,
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.gray600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    if (!cat.isActive)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: _miniPill('Inactive', AppColors.gray200,
                            AppColors.gray600),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '$itemsCount',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                    ),
                  ),
                  const Text(
                    'items',
                    style: TextStyle(fontSize: 11, color: AppColors.gray600),
                  ),
                ],
              ),
              if (canManage) ...[
                const SizedBox(width: 4),
                _cardMenu(
                  onEdit: () => _showCategoryDialog(category: cat),
                  isFavourite: cat.isFavourite,
                  onToggleFavourite: () => _toggleCategoryFavourite(cat),
                ),
              ] else ...[
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right_rounded,
                    size: 20, color: AppColors.gray400),
              ],
            ],
          ),
        ),
      ),
    );
  }

  // --- Items Tab ---
  Widget _buildItemsTab(DataProvider data) {
    final palette = context.watch<ThemeProvider>().currentTheme;
    final canManage = context.read<AuthProvider>().canManageMenu;
    final categories = data.categories.toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
    final categoryNames = {for (final c in data.categories) c.id: c.name};
    final query = _itemSearchController.text.toLowerCase().trim();

    final filteredItems = data.items.where((item) {
      final matchesQuery = item.name.toLowerCase().contains(query) ||
          (item.description?.toLowerCase().contains(query) ?? false);
      final matchesCategory = _selectedCategoryId == 'all' ||
          item.categoryId == _selectedCategoryId;
      return matchesQuery && matchesCategory;
    }).toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });

    final filtersActive = query.isNotEmpty || _selectedCategoryId != 'all';
    final wide =
        ResponsiveHelper.isTablet(context) || ResponsiveHelper.isDesktop(context);

    void clearFilters() {
      setState(() {
        _selectedCategoryId = 'all';
        _itemSearchController.clear();
      });
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: _searchField(
            controller: _itemSearchController,
            hint: 'Search menu items',
            palette: palette,
          ),
        ),
        const SizedBox(height: 10),
        CategoryChipsRow(
          categories: categories,
          selectedId:
              _selectedCategoryId == 'all' ? null : _selectedCategoryId,
          onSelected: (id) =>
              setState(() => _selectedCategoryId = id ?? 'all'),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '${filteredItems.length} item(s)',
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.gray600),
                ),
              ),
              if (filtersActive)
                TextButton(
                  onPressed: clearFilters,
                  style: TextButton.styleFrom(
                    foregroundColor: palette.primary,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Text('Clear filters',
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600)),
                ),
            ],
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: palette.primary,
            onRefresh: _refreshData,
            child: filteredItems.isEmpty
                ? _emptyState(
                    icon: Icons.fastfood_outlined,
                    title: filtersActive
                        ? 'No matching items'
                        : 'No menu items yet',
                    subtitle: filtersActive
                        ? 'Try a different search or category.'
                        : (canManage
                            ? 'Add your first item to build the menu.'
                            : 'Items added on the desktop app will appear here.'),
                    actionLabel: filtersActive
                        ? 'Clear filters'
                        : (canManage ? 'Add item' : null),
                    onAction: filtersActive
                        ? clearFilters
                        : (canManage ? _showItemDialog : null),
                    palette: palette,
                  )
                : !wide
                    ? ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.fromLTRB(16, 4, 16,
                            24 + MediaQuery.of(context).padding.bottom),
                        itemCount: filteredItems.length,
                        itemBuilder: (context, index) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _itemCard(filteredItems[index],
                              categoryNames, palette),
                        ),
                      )
                    : GridView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.fromLTRB(16, 4, 16,
                            24 + MediaQuery.of(context).padding.bottom),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisExtent: 124,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: filteredItems.length,
                        itemBuilder: (context, index) => _itemCard(
                            filteredItems[index], categoryNames, palette),
                      ),
          ),
        ),
      ],
    );
  }

  Widget _itemCard(Item item, Map<String, String> categoryNames,
      AppThemeOption palette) {
    final canManage = context.read<AuthProvider>().canManageMenu;
    final categoryName = item.categoryName ??
        categoryNames[item.categoryId] ??
        'Uncategorized';
    final tax = item.taxPercent;
    final taxLabel = tax == null
        ? null
        : 'Tax ${tax == tax.roundToDouble() ? tax.toStringAsFixed(0) : tax.toStringAsFixed(1)}%';

    return Opacity(
      opacity: item.isActive ? 1 : 0.6,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.gray200),
          boxShadow: [
            BoxShadow(
              color: AppColors.dark.withOpacity(0.04),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            ItemThumb(item: item, size: 56),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          item.name,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: AppColors.dark,
                            height: 1.2,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (item.isFavourite) ...[
                        const SizedBox(width: 4),
                        Padding(
                          padding: const EdgeInsets.only(top: 1),
                          child: Icon(Icons.star_rounded,
                              size: 16, color: Colors.amber[600]),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 5),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      _miniPill(
                          categoryName,
                          palette.highlight.withOpacity(0.12),
                          palette.highlight),
                      if (taxLabel != null)
                        _miniPill(
                            taxLabel, AppColors.gray100, AppColors.gray700),
                      if (item.hsnCode != null && item.hsnCode!.isNotEmpty)
                        _miniPill('HSN ${item.hsnCode}', AppColors.gray100,
                            AppColors.gray700),
                    ],
                  ),
                  if (item.description != null &&
                      item.description!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        item.description!,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.gray500),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 96),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      '₹${item.price.toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: palette.highlight,
                      ),
                    ),
                  ),
                ),
                if (!item.isActive)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: _miniPill('Unavailable',
                        AppColors.danger.withOpacity(0.1), AppColors.danger,
                        fontSize: 10, weight: FontWeight.w700),
                  ),
              ],
            ),
            if (canManage)
              _cardMenu(
                onEdit: () => _showItemDialog(item: item),
                isFavourite: item.isFavourite,
                onToggleFavourite: () => _toggleItemFavourite(item),
              ),
          ],
        ),
      ),
    );
  }

  Widget _miniPill(String label, Color bg, Color fg,
      {double fontSize = 11, FontWeight weight = FontWeight.w600}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
            fontSize: fontSize, fontWeight: weight, color: fg),
        maxLines: 1,
      ),
    );
  }

  Widget _emptyState({
    required IconData icon,
    required String title,
    required String subtitle,
    String? actionLabel,
    VoidCallback? onAction,
    AppThemeOption? palette,
  }) {
    final p = palette ?? context.watch<ThemeProvider>().currentTheme;
    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.55,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: p.primarySoft,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, size: 32, color: p.primary),
                ),
                const SizedBox(height: 16),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.dark,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.gray600),
                  textAlign: TextAlign.center,
                ),
                if (actionLabel != null) ...[
                  const SizedBox(height: 14),
                  TextButton(
                    onPressed: onAction,
                    style: TextButton.styleFrom(
                        foregroundColor: p.primary),
                    child: Text(actionLabel,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
