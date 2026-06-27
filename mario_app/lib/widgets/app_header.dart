import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/user.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';

class AppHeader extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;
  final bool showStoreName;
  final bool automaticallyImplyLeading;

  const AppHeader({
    super.key,
    required this.title,
    this.actions,
    this.bottom,
    this.showStoreName = true,
    this.automaticallyImplyLeading = true,
  });

  static void showStoreSwitcher(BuildContext context) {
    final auth = context.read<AuthProvider>();
    final stores = auth.user?.stores ?? [];
    if (stores.isEmpty) return;

    final screenContext = context;
    final navigator = Navigator.of(screenContext);
    final scaffoldMessenger = ScaffoldMessenger.of(screenContext);

    showModalBottomSheet(
      context: screenContext,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.gray300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Switch Store',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Select a storefront to manage',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.gray500,
                ),
              ),
              const SizedBox(height: 16),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: stores.length,
                  itemBuilder: (itemBuilderContext, index) {
                    final store = stores[index];
                    final isCurrent = auth.currentStore?.id == store.id;

                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                      leading: CircleAvatar(
                        backgroundColor: isCurrent
                            ? AppColors.primary.withOpacity(0.15)
                            : AppColors.gray200,
                        child: Icon(
                          Icons.storefront,
                          color: isCurrent ? AppColors.primary : AppColors.gray600,
                        ),
                      ),
                      title: Text(
                        store.name,
                        style: TextStyle(
                          fontWeight: isCurrent ? FontWeight.w700 : FontWeight.w500,
                          color: AppColors.dark,
                          fontSize: 16,
                        ),
                      ),
                      subtitle: Text(
                        store.branch ?? store.location ?? 'Main Branch',
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.gray500,
                        ),
                      ),
                      trailing: isCurrent
                          ? const Icon(Icons.check_circle, color: AppColors.success)
                          : null,
                      onTap: () async {
                        navigator.pop();

                        showDialog(
                          context: navigator.context,
                          barrierDismissible: false,
                          builder: (loadingContext) => const Center(
                            child: CircularProgressIndicator(),
                          ),
                        );

                        try {
                          await auth.switchStore(store);
                          final data = screenContext.read<DataProvider>();
                          await data.loadAllData(auth);

                          navigator.pop();

                          scaffoldMessenger.showSnackBar(
                            SnackBar(
                              content: Text('Switched to ${store.displayName}'),
                              backgroundColor: AppColors.success,
                            ),
                          );
                        } catch (e) {
                          navigator.pop();
                          scaffoldMessenger.showSnackBar(
                            SnackBar(
                              content: Text('Error switching store: $e'),
                              backgroundColor: AppColors.danger,
                            ),
                          );
                        }
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
  }

  @override
  Size get preferredSize {
    final bottomHeight = bottom?.preferredSize.height ?? 0;
    return Size.fromHeight(72 + bottomHeight);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    final titleWidget = showStoreName && auth.currentStore != null
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                auth.currentStore!.displayName,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.gray500,
                ),
              ),
            ],
          )
        : Text(
            title,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: AppColors.dark,
              letterSpacing: -0.3,
            ),
          );

    final stores = auth.user?.stores ?? [];

    final allActions = <Widget>[
      if (stores.isNotEmpty)
        PopupMenuButton<Store>(
          icon: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.light,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: AppColors.dark.withOpacity(0.06),
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: const Icon(
              Icons.storefront,
              color: AppColors.primary,
              size: 22,
            ),
          ),
          tooltip: 'Switch Store',
          position: PopupMenuPosition.under,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          onSelected: (store) async {
            if (store.id == auth.currentStore?.id) return;

            showDialog(
              context: context,
              barrierDismissible: false,
              builder: (ctx) => const Center(
                child: CircularProgressIndicator(),
              ),
            );

            try {
              await auth.switchStore(store);
              final data = context.read<DataProvider>();
              await data.loadAllData(auth);

              if (context.mounted) Navigator.pop(context);

              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Switched to ${store.displayName}'),
                    backgroundColor: AppColors.success,
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                );
              }
            } catch (e) {
              if (context.mounted) Navigator.pop(context);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Error switching store: $e'),
                    backgroundColor: AppColors.danger,
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                );
              }
            }
          },
          itemBuilder: (context) {
            return stores.map((store) {
              final isCurrent = auth.currentStore?.id == store.id;
              return PopupMenuItem<Store>(
                value: store,
                child: Row(
                  children: [
                    Icon(
                      Icons.storefront,
                      size: 20,
                      color: isCurrent ? AppColors.primary : AppColors.gray600,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        store.displayName,
                        style: TextStyle(
                          fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                        ),
                      ),
                    ),
                    if (isCurrent)
                      const Icon(Icons.check, color: AppColors.success, size: 20),
                  ],
                ),
              );
            }).toList();
          },
        ),
      ...?actions,
    ];

    return AppBar(
      toolbarHeight: 72,
      automaticallyImplyLeading: automaticallyImplyLeading,
      leading: Padding(
        padding: const EdgeInsets.only(left: 16.0),
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.light,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: AppColors.dark.withOpacity(0.06),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Image.asset(
              'assets/images/logo.png',
              fit: BoxFit.contain,
            ),
          ),
        ),
      ),
      title: titleWidget,
      actions: allActions.map((action) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: action,
      )).toList(),
      bottom: bottom,
    );
  }
}
