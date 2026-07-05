import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/animations.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _isChangingPassword = false;
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.only(top: 12, bottom: 20),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.light,
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: AppColors.cardShadow,
                      ),
                      child: const Icon(Icons.settings_rounded,
                          color: AppColors.primary, size: 24),
                    ),
                    const SizedBox(width: 12),
                    const Text(
                      'Settings',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.dark,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            FadeSlideIn(
              child: _sectionTitle('PROFILE'),
            ),
            const SizedBox(height: 12),
            FadeSlideIn(
              delay: const Duration(milliseconds: 50),
              child: Container(
                decoration: BoxDecoration(
                  gradient: AppColors.darkGradient,
                  borderRadius: BorderRadius.circular(24),
                ),
                padding: const EdgeInsets.all(24),
                child: Row(
                  children: [
                    Container(
                      width: 60,
                      height: 60,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Icon(Icons.person_rounded,
                          color: Colors.white, size: 32),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.name ?? 'Unknown',
                            style: const TextStyle(
                                fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            user?.username ?? '',
                            style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.5), fontSize: 14),
                          ),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.3),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              (user?.role ?? '').toUpperCase(),
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: AppColors.primaryLight,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            FadeSlideIn(
              delay: const Duration(milliseconds: 100),
              child: _sectionTitle('STORE SWITCH'),
            ),
            const SizedBox(height: 12),
            if (user?.stores != null && user!.stores!.isNotEmpty)
              ...user.stores!.asMap().entries.map((entry) {
                final store = entry.value;
                final isCurrent = auth.currentStore?.id == store.id;
                return FadeSlideIn(
                  delay: Duration(milliseconds: 120 + entry.key * 60),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: BoxDecoration(
                      color: AppColors.light,
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: AppColors.cardShadow,
                      border: isCurrent
                          ? Border.all(color: AppColors.primary, width: 1.5)
                          : null,
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(18),
                        onTap: isCurrent
                            ? null
                            : () async {
                                await auth.switchStore(store);
                                final data = context.read<DataProvider>();
                                await data.loadStoreData(store.id);
                              },
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(
                            children: [
                              Container(
                                width: 44,
                                height: 44,
                                decoration: BoxDecoration(
                                  gradient: isCurrent
                                      ? AppColors.primaryGradient
                                      : null,
                                  color: isCurrent
                                      ? null
                                      : AppColors.gray100,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Icon(
                                  isCurrent
                                      ? Icons.check_circle_rounded
                                      : Icons.store_outlined,
                                  color: isCurrent
                                      ? Colors.white
                                      : AppColors.gray400,
                                  size: 22,
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(store.displayName,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 15)),
                                    const SizedBox(height: 2),
                                    Text(
                                      store.isActive ? 'Active' : 'Inactive',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: store.isActive
                                            ? AppColors.success
                                            : AppColors.danger,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              if (isCurrent)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppColors.primaryExtraLight,
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: const Text(
                                    'Current',
                                    style: TextStyle(
                                      color: AppColors.primary,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 11,
                                    ),
                                  ),
                                )
                              else
                                const Text(
                                  'Switch',
                                  style: TextStyle(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            const SizedBox(height: 24),
            FadeSlideIn(
              delay: const Duration(milliseconds: 200),
              child: _sectionTitle('SECURITY'),
            ),
            const SizedBox(height: 12),
            FadeSlideIn(
              delay: const Duration(milliseconds: 220),
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.light,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: AppColors.cardShadow,
                ),
                child: Column(
                  children: [
                    ListTile(
                      leading: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppColors.primaryExtraLight,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.lock_outline_rounded,
                            color: AppColors.primary, size: 20),
                      ),
                      title: const Text('Change Password',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                      trailing: Icon(
                        _isChangingPassword
                            ? Icons.expand_less_rounded
                            : Icons.expand_more_rounded,
                        color: AppColors.gray400,
                      ),
                      onTap: () => setState(
                          () => _isChangingPassword = !_isChangingPassword),
                    ),
                    AnimatedSize(
                      duration: AppAnimations.medium,
                      curve: AppAnimations.defaultCurve,
                      child: _isChangingPassword
                          ? Padding(
                              padding: const EdgeInsets.all(20),
                              child: Form(
                                key: _formKey,
                                child: Column(
                                  children: [
                                    TextFormField(
                                      controller: _currentPasswordController,
                                      obscureText: true,
                                      decoration: const InputDecoration(
                                        labelText: 'Current Password',
                                        prefixIcon:
                                            Icon(Icons.lock_outline_rounded),
                                      ),
                                      validator: (value) {
                                        if (value == null ||
                                            value.isEmpty) {
                                          return 'Enter current password';
                                        }
                                        return null;
                                      },
                                    ),
                                    const SizedBox(height: 12),
                                    TextFormField(
                                      controller: _newPasswordController,
                                      obscureText: true,
                                      decoration: const InputDecoration(
                                        labelText: 'New Password',
                                        prefixIcon: Icon(Icons.lock_rounded),
                                      ),
                                      validator: (value) {
                                        if (value == null ||
                                            value.length < 6) {
                                          return 'Password must be at least 6 characters';
                                        }
                                        return null;
                                      },
                                    ),
                                    const SizedBox(height: 12),
                                    TextFormField(
                                      controller: _confirmPasswordController,
                                      obscureText: true,
                                      decoration: const InputDecoration(
                                        labelText: 'Confirm New Password',
                                        prefixIcon: Icon(Icons.lock_rounded),
                                      ),
                                      validator: (value) {
                                        if (value !=
                                            _newPasswordController.text) {
                                          return 'Passwords do not match';
                                        }
                                        return null;
                                      },
                                    ),
                                    const SizedBox(height: 16),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.end,
                                      children: [
                                        TextButton(
                                          onPressed: () {
                                            setState(() =>
                                                _isChangingPassword = false);
                                            _currentPasswordController
                                                .clear();
                                            _newPasswordController.clear();
                                            _confirmPasswordController
                                                .clear();
                                          },
                                          child: const Text('Cancel'),
                                        ),
                                        const SizedBox(width: 8),
                                        ElevatedButton(
                                          onPressed: () async {
                                            if (!_formKey.currentState!
                                                .validate()) return;
                                            final success =
                                                await auth.changePassword(
                                              _currentPasswordController.text,
                                              _newPasswordController.text,
                                            );
                                            if (success && mounted) {
                                              ScaffoldMessenger.of(context)
                                                  .showSnackBar(
                                                const SnackBar(
                                                    content: Text(
                                                        'Password changed successfully')),
                                              );
                                              setState(() =>
                                                  _isChangingPassword = false);
                                              _currentPasswordController
                                                  .clear();
                                              _newPasswordController.clear();
                                              _confirmPasswordController
                                                  .clear();
                                            } else if (mounted) {
                                              ScaffoldMessenger.of(context)
                                                  .showSnackBar(
                                                SnackBar(
                                                    content: Text(auth.error ??
                                                        'Failed to change password')),
                                              );
                                            }
                                          },
                                          child: const Text('Update'),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            FadeSlideIn(
              delay: const Duration(milliseconds: 300),
              child: _sectionTitle('ABOUT'),
            ),
            const SizedBox(height: 12),
            FadeSlideIn(
              delay: const Duration(milliseconds: 320),
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.light,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: AppColors.cardShadow,
                ),
                child: ListTile(
                  leading: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.info.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.info_outline_rounded,
                        color: AppColors.info, size: 20),
                  ),
                  title: const Text('App Version',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                  trailing: Text(
                    AppConstants.appVersion,
                    style: const TextStyle(
                        color: AppColors.gray500, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 32),
            FadeSlideIn(
              delay: const Duration(milliseconds: 400),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: OutlinedButton.icon(
                  onPressed: () async {
                    await auth.logout();
                  },
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('Logout'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    side: const BorderSide(color: AppColors.danger, width: 1.5),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Text(
      title,
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: AppColors.gray500,
        letterSpacing: 1,
      ),
    );
  }
}
