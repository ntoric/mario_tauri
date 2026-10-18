import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/category.dart';
import '../models/item.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';

class CategoriesItemsScreen extends StatefulWidget {
  const CategoriesItemsScreen({super.key});

  @override
  State<CategoriesItemsScreen> createState() => _CategoriesItemsScreenState();
}

class _CategoriesItemsScreenState extends State<CategoriesItemsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _itemSearchController = TextEditingController();
  String _selectedCategoryId = 'all';
  String _sortMode = 'name';
  bool _gridView = false;

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
  }

  @override
  void dispose() {
    _tabController.dispose();
    _itemSearchController.dispose();
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

                  Navigator.pop(context); // Close dialog
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

    if (categories.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please add at least one category before adding items'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }

    String selectedCatId = item?.categoryId ?? categories.first.id;

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

                      Navigator.pop(context); // Close dialog
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
    context.watch<ThemeProvider>();
    final data = context.watch<DataProvider>();
    const isStaff =
        true; // Categories and items are read-only in the mobile app

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(title: 'Menu List'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Column(
              children: [
                // Segmented Categories / Food Items control
                Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: AppColors.gray100,
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: ClayStyles.raisedShadow(
                      blur: 16,
                      darkOffset: const Offset(6, 6),
                      lightOffset: const Offset(-6, -6),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: _buildMenuTabSelector(
                          icon: Icons.grid_view_rounded,
                          label: 'Categories',
                          index: 0,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: _buildMenuTabSelector(
                          icon: Icons.restaurant_menu,
                          label: 'Food Items',
                          index: 1,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                // Search + sort sheet button
                Row(
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
                          controller: _itemSearchController,
                          decoration: InputDecoration(
                            hintText: _tabController.index == 0
                                ? 'Search categories...'
                                : 'Search food or beverages...',
                            hintStyle: TextStyle(
                              fontSize: 14,
                              color: AppColors.gray400,
                            ),
                            prefixIcon: Icon(
                              Icons.search,
                              color: AppColors.gray500,
                              size: 20,
                            ),
                            suffixIcon: _itemSearchController.text.isNotEmpty
                                ? IconButton(
                                    icon: Icon(
                                      Icons.close,
                                      size: 18,
                                      color: AppColors.gray500,
                                    ),
                                    onPressed: () =>
                                        _itemSearchController.clear(),
                                  )
                                : null,
                            border: InputBorder.none,
                            contentPadding:
                                const EdgeInsets.symmetric(vertical: 13),
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
              ],
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildCategoriesTab(data, isStaff),
                _buildItemsTab(data, isStaff),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuTabSelector({
    required IconData icon,
    required String label,
    required int index,
  }) {
    final isSelected = _tabController.index == index;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        color: isSelected ? AppColors.primary : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        boxShadow: isSelected
            ? [
                BoxShadow(
                  color: AppColors.primary.withOpacity(0.35),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _tabController.animateTo(index),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 18,
                  color: isSelected ? Colors.white : AppColors.gray600,
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: isSelected ? Colors.white : AppColors.gray600,
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

  void _showSortSheet() {
    final isItems = _tabController.index == 1;
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
              if (isItems) ...[
                option('price_asc', 'Price: Low to High'),
                option('price_desc', 'Price: High to Low'),
              ] else
                option('items_desc', 'Most items first'),
            ],
          ),
        );
      },
    );
  }

  int _compareNames(String a, String b) =>
      a.toLowerCase().compareTo(b.toLowerCase());

  Widget _thumbBox(IconData icon,
      {double size = 56, double? iconSize, double radius = 12}) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.primarySoft.withOpacity(0.6),
        borderRadius: BorderRadius.circular(radius),
      ),
      child:
          Icon(icon, size: iconSize ?? size * 0.45, color: AppColors.primary),
    );
  }

  void _showItemDetails(Item item, String categoryName) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        Widget row(String label, String value) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(label,
                      style: TextStyle(fontSize: 13, color: AppColors.gray600)),
                  Flexible(
                    child: Text(
                      value,
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.dark,
                      ),
                    ),
                  ),
                ],
              ),
            );

        return Container(
          decoration: BoxDecoration(
            color: AppColors.gray100,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _thumbBox(Icons.fastfood_outlined, size: 44),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.name,
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: AppColors.dark,
                          ),
                        ),
                        Text(
                          categoryName,
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.gray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    '₹${item.price.toStringAsFixed(2)}',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                    ),
                  ),
                ],
              ),
              if (item.description != null && item.description!.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  item.description!,
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.gray600,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              Divider(height: 1, color: AppColors.gray200),
              row('Category', categoryName),
              Divider(height: 1, color: AppColors.gray200),
              row('Price', '₹${item.price.toStringAsFixed(2)}'),
              Divider(height: 1, color: AppColors.gray200),
              row('Tax', '${item.taxPercent?.toStringAsFixed(1) ?? '0.0'}%'),
              Divider(height: 1, color: AppColors.gray200),
              row('HSN', item.hsnCode ?? '-'),
              Divider(height: 1, color: AppColors.gray200),
              row('Status', item.enabled ? 'Enabled' : 'Disabled'),
            ],
          ),
        );
      },
    );
  }

  // --- Categories List Panel ---
  Widget _buildCategoriesTab(DataProvider data, bool isStaff) {
    final query = _itemSearchController.text.toLowerCase().trim();
    final itemCounts = <String, int>{
      for (final c in data.categories)
        c.id: data.items.where((i) => i.categoryId == c.id).length,
    };

    final categories = data.categories
        .where((c) => query.isEmpty || c.name.toLowerCase().contains(query))
        .toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        switch (_sortMode) {
          case 'name_desc':
            return _compareNames(b.name, a.name);
          case 'items_desc':
            return (itemCounts[b.id] ?? 0).compareTo(itemCounts[a.id] ?? 0);
          default:
            return _compareNames(a.name, b.name);
        }
      });

    Widget listContent() {
      if (categories.isEmpty) {
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          children: [
            SizedBox(
              height: MediaQuery.of(context).size.height * 0.4,
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.category_outlined,
                      size: 64,
                      color: AppColors.gray400,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      query.isNotEmpty
                          ? 'No categories match your search'
                          : 'No categories found',
                      style: TextStyle(fontSize: 16, color: AppColors.gray600),
                    ),
                    if (!isStaff && query.isEmpty) ...[
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: () => _showCategoryDialog(),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Category'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        );
      }

      return ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        itemCount: categories.length + 1,
        itemBuilder: (context, index) {
          if (index == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 10, right: 4),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text(
                  '${categories.length} ${categories.length == 1 ? 'Category' : 'Categories'}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppColors.gray500,
                  ),
                ),
              ),
            );
          }

          final cat = categories[index - 1];
          final itemsCount = itemCounts[cat.id] ?? 0;
          final isFav = cat.isFavourite;

          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Material(
              color: isFav
                  ? AppColors.primarySoft.withOpacity(0.45)
                  : Colors.white,
              borderRadius: BorderRadius.circular(16),
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: () {
                  setState(() => _selectedCategoryId = cat.id);
                  _tabController.animateTo(1);
                },
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: isFav
                        ? Border.all(
                            color: AppColors.primary.withOpacity(0.35),
                          )
                        : null,
                  ),
                  child: Row(
                    children: [
                      _thumbBox(Icons.lunch_dining, size: 54, radius: 12),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    cat.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.dark,
                                    ),
                                  ),
                                ),
                                if (isFav) ...[
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color:
                                          AppColors.primary.withOpacity(0.12),
                                      borderRadius: BorderRadius.circular(20),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          Icons.star,
                                          size: 11,
                                          color: AppColors.primary,
                                        ),
                                        SizedBox(width: 3),
                                        Text(
                                          'Favourite',
                                          style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.primary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '$itemsCount ${itemsCount == 1 ? 'item' : 'items'}',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.gray500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          color: AppColors.gray100,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.chevron_right,
                          size: 18,
                          color: isFav ? AppColors.primary : AppColors.gray500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      );
    }

    return RefreshIndicator(onRefresh: _refreshData, child: listContent());
  }

  // --- Items List Panel with Search & Filter ---
  Widget _buildItemsTab(DataProvider data, bool isStaff) {
    final categories = data.categories.toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        return _compareNames(a.name, b.name);
      });
    final query = _itemSearchController.text.toLowerCase().trim();
    final categoryNames = {for (var c in data.categories) c.id: c.name};

    final filteredItems = data.items.where((item) {
      final categoryName =
          item.categoryName ?? categoryNames[item.categoryId] ?? '';
      final matchesQuery = item.name.toLowerCase().contains(query) ||
          (item.description?.toLowerCase().contains(query) ?? false) ||
          categoryName.toLowerCase().contains(query);

      final matchesCategory = _selectedCategoryId == 'all' ||
          item.categoryId == _selectedCategoryId;

      return matchesQuery && matchesCategory;
    }).toList()
      ..sort((a, b) {
        final af = a.isFavourite ? 1 : 0;
        final bf = b.isFavourite ? 1 : 0;
        if (af != bf) return bf - af;
        switch (_sortMode) {
          case 'name_desc':
            return _compareNames(b.name, a.name);
          case 'price_asc':
            return a.price.compareTo(b.price);
          case 'price_desc':
            return b.price.compareTo(a.price);
          default:
            return _compareNames(a.name, b.name);
        }
      });

    String categoryNameFor(Item item) =>
        (item.categoryName != null && item.categoryName!.isNotEmpty)
            ? item.categoryName!
            : (categoryNames[item.categoryId] ?? 'Uncategorized');

    final sortLabel = switch (_sortMode) {
      'name_desc' => 'Name Z–A',
      'price_asc' => 'Price ↑',
      'price_desc' => 'Price ↓',
      'items_desc' => 'Items ↓',
      _ => 'Name',
    };

    return Column(
      children: [
        // Category chips strip
        SizedBox(
          height: 86,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            children: [
              _buildAllChip(),
              ...categories.map((cat) => _buildCategoryChip(cat)),
            ],
          ),
        ),
        const SizedBox(height: 4),

        // Count + sort + view toggle
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Text(
                '${filteredItems.length} ${filteredItems.length == 1 ? 'Item' : 'Items'}',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                ),
              ),
              const Spacer(),
              Text(
                'Sort by',
                style: TextStyle(fontSize: 11, color: AppColors.gray500),
              ),
              const SizedBox(width: 6),
              GestureDetector(
                onTap: _showSortSheet,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.gray100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Text(
                        sortLabel,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.dark,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        Icons.keyboard_arrow_down,
                        size: 16,
                        color: AppColors.gray600,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => setState(() => _gridView = !_gridView),
                child: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: AppColors.gray100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    _gridView ? Icons.view_list_rounded : Icons.grid_view,
                    size: 17,
                    color: AppColors.gray700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),

        // Items list / grid
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refreshData,
            child: filteredItems.isEmpty
                ? SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    child: SizedBox(
                      height: MediaQuery.of(context).size.height * 0.45,
                      child: Center(
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
                              query.isNotEmpty || _selectedCategoryId != 'all'
                                  ? 'No matching food items found'
                                  : 'No food items added yet',
                              style: TextStyle(
                                  fontSize: 16, color: AppColors.gray600),
                            ),
                            if (!isStaff &&
                                query.isEmpty &&
                                _selectedCategoryId == 'all') ...[
                              const SizedBox(height: 16),
                              ElevatedButton.icon(
                                onPressed: () => _showItemDialog(),
                                icon: const Icon(Icons.add),
                                label: const Text('Add Food Item'),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  )
                : _gridView
                    ? GridView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          childAspectRatio: 0.82,
                        ),
                        itemCount: filteredItems.length,
                        itemBuilder: (context, index) => _buildItemGridCard(
                            filteredItems[index],
                            categoryNameFor(filteredItems[index])),
                      )
                    : ListView.builder(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        itemCount: filteredItems.length,
                        itemBuilder: (context, index) => _buildItemListCard(
                            filteredItems[index],
                            categoryNameFor(filteredItems[index])),
                      ),
          ),
        ),
      ],
    );
  }

  Widget _buildAllChip() {
    final selected = _selectedCategoryId == 'all';
    return GestureDetector(
      onTap: () => setState(() => _selectedCategoryId = 'all'),
      child: Container(
        width: 58,
        margin: const EdgeInsets.only(right: 8, top: 2, bottom: 2),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border:
              selected ? null : Border.all(color: AppColors.gray200, width: 1),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.grid_view_rounded,
              size: 20,
              color: selected ? Colors.white : AppColors.gray600,
            ),
            const SizedBox(height: 5),
            Text(
              'All',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : AppColors.gray600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryChip(Category cat) {
    final selected = _selectedCategoryId == cat.id;
    return GestureDetector(
      onTap: () =>
          setState(() => _selectedCategoryId = selected ? 'all' : cat.id),
      child: Container(
        width: 58,
        margin: const EdgeInsets.only(right: 8, top: 2, bottom: 2),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        decoration: BoxDecoration(
          color: selected ? AppColors.primarySoft : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.gray200,
            width: selected ? 1.4 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 17,
              backgroundColor: AppColors.primary.withOpacity(0.12),
              child: Icon(
                Icons.lunch_dining,
                size: 17,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              cat.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: selected ? AppColors.primary : AppColors.gray700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildItemListCard(Item item, String categoryName) {
    return Opacity(
      opacity: item.enabled ? 1 : 0.55,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.gray100,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _thumbBox(Icons.fastfood_outlined, size: 62, radius: 12),
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
                  const SizedBox(height: 4),
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
                  if (item.description != null &&
                      item.description!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      item.description!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        color: AppColors.gray500,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                  const SizedBox(height: 5),
                  Text(
                    'Tax: ${item.taxPercent?.toStringAsFixed(1) ?? '0.0'}%   HSN: ${item.hsnCode ?? '-'}',
                    style: TextStyle(
                      fontSize: 10.5,
                      color: AppColors.gray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      item.isFavourite ? Icons.favorite : Icons.favorite_border,
                      size: 18,
                      color: item.isFavourite
                          ? AppColors.danger
                          : AppColors.gray500,
                    ),
                    const SizedBox(width: 2),
                    GestureDetector(
                      onTap: () => _showItemDetails(item, categoryName),
                      child: Icon(
                        Icons.more_vert,
                        size: 18,
                        color: AppColors.gray500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 26),
                Text(
                  '₹${item.price.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildItemGridCard(Item item, String categoryName) {
    return Opacity(
      opacity: item.enabled ? 1 : 0.55,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppColors.gray100,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                children: [
                  Positioned.fill(
                    child: _thumbBox(
                      Icons.fastfood_outlined,
                      size: double.infinity,
                      iconSize: 30,
                      radius: 10,
                    ),
                  ),
                  Positioned(
                    top: 6,
                    right: 6,
                    child: Icon(
                      item.isFavourite ? Icons.favorite : Icons.favorite_border,
                      size: 17,
                      color: item.isFavourite
                          ? AppColors.danger
                          : AppColors.gray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              item.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: AppColors.dark,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              categoryName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10.5,
                color: AppColors.gray500,
              ),
            ),
            const SizedBox(height: 5),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '₹${item.price.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primary,
                  ),
                ),
                GestureDetector(
                  onTap: () => _showItemDetails(item, categoryName),
                  child: Icon(
                    Icons.more_vert,
                    size: 16,
                    color: AppColors.gray500,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
