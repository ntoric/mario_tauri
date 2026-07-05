import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/user.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';

class StorePickerButton extends StatelessWidget {
  final VoidCallback? onStoreChanged;

  const StorePickerButton({super.key, this.onStoreChanged});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final stores = auth.user?.stores ?? [];

    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: AppColors.light,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppColors.cardShadow,
      ),
      child: IconButton(
        icon: const Icon(Icons.store_rounded,
            color: AppColors.primary, size: 20),
        padding: EdgeInsets.zero,
        tooltip: 'Switch Store',
        onPressed: stores.isEmpty ? null : () => _showStorePicker(context, auth, stores),
      ),
    );
  }

  void _showStorePicker(BuildContext context, AuthProvider auth, List<Store> stores) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.light,
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(28),
              topRight: Radius.circular(28),
            ),
          ),
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
                'Select Store',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                ),
              ),
              const SizedBox(height: 16),
              ...stores.map((s) {
                final isCurrent = auth.currentStore?.id == s.id;
                return ListTile(
                  leading: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      gradient: isCurrent ? AppColors.primaryGradient : null,
                      color: isCurrent ? null : AppColors.gray100,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      isCurrent ? Icons.check_circle_rounded : Icons.store_outlined,
                      color: isCurrent ? Colors.white : AppColors.gray400,
                      size: 22,
                    ),
                  ),
                  title: Text(s.displayName,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  subtitle: Text(
                    s.isActive ? 'Active' : 'Inactive',
                    style: TextStyle(
                      fontSize: 12,
                      color: s.isActive ? AppColors.success : AppColors.danger,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  trailing: isCurrent
                      ? Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.primaryExtraLight,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'Current',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primary,
                            ),
                          ),
                        )
                      : null,
                  onTap: isCurrent
                      ? null
                      : () async {
                          Navigator.pop(ctx);
                          await auth.switchStore(s);
                          final data = context.read<DataProvider>();
                          if (auth.currentStore != null) {
                            await data.loadStoreData(auth.currentStore!.id);
                          }
                          onStoreChanged?.call();
                        },
                );
              }),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }
}
