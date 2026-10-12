import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';
import 'login_screen.dart';
import 'app_update_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _obscureCurrentPassword = true;
  bool _obscureNewPassword = true;
  bool _obscureConfirmPassword = true;
  bool _isChangingPassword = false;
  bool _passwordExpanded = false;
  String _whatsappLink = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DataProvider>().loadAppUpdate(platform: 'mobile');
      _loadSupportConfig();
    });
  }

  Future<void> _loadSupportConfig() async {
    try {
      final auth = context.read<AuthProvider>();
      final response = await http.get(
        Uri.parse('${auth.backend.api.baseUrl}/support-config'),
      );
      if (response.statusCode == 200 && mounted) {
        final cfg = json.decode(response.body);
        setState(() => _whatsappLink = cfg['whatsappLink'] ?? '');
      }
    } catch (_) {}
  }

  Future<void> _launchWhatsApp() async {
    if (_whatsappLink.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('WhatsApp support is not configured'),
          backgroundColor: AppColors.warning,
        ),
      );
      return;
    }
    String url = _whatsappLink;
    if (url.startsWith('https://wa.me/')) {
      url = 'whatsapp://send?phone=${url.replaceFirst('https://wa.me/', '')}';
    }
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      final fallback = Uri.parse(_whatsappLink);
      if (await canLaunchUrl(fallback)) {
        await launchUrl(fallback, mode: LaunchMode.externalApplication);
      }
    }
  }

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    if (_newPasswordController.text != _confirmPasswordController.text) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('New passwords do not match'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }

    if (_newPasswordController.text.length < 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Password must be at least 6 characters'),
          backgroundColor: AppColors.danger,
        ),
      );
      return;
    }

    setState(() => _isChangingPassword = true);

    final auth = context.read<AuthProvider>();
    final success = await auth.changePassword(
      _currentPasswordController.text,
      _newPasswordController.text,
    );

    setState(() => _isChangingPassword = false);

    if (success && mounted) {
      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Password changed successfully'),
          backgroundColor: AppColors.success,
        ),
      );
    } else if (mounted && auth.error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.error!),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
            ),
            child: const Text('Logout'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final auth = context.read<AuthProvider>();
      await auth.logout();
      context.read<DataProvider>().clearData();

      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (route) => false,
        );
      }
    }
  }

  Future<void> _refreshData() async {
    final auth = context.read<AuthProvider>();
    final data = context.read<DataProvider>();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: CircularProgressIndicator(),
      ),
    );

    await data.loadAllData(auth);

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Data refreshed successfully'),
          backgroundColor: AppColors.success,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final data = context.watch<DataProvider>();
    final themeProvider = context.watch<ThemeProvider>();

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Settings',
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        children: [
          // Profile card
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFDDB8), Color(0xFFFFF3E8)],
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            clipBehavior: Clip.hardEdge,
            child: Stack(
              children: [
                Positioned(
                  right: -40,
                  top: -50,
                  child: Container(
                    width: 170,
                    height: 170,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.28),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                Positioned(
                  right: 30,
                  bottom: -60,
                  child: Container(
                    width: 150,
                    height: 150,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.10),
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(18),
                  child: Row(
                    children: [
                      Container(
                        width: 66,
                        height: 66,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [AppColors.primary, AppColors.primaryDark],
                          ),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.person,
                          size: 34,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.name ?? 'Unknown',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                color: AppColors.dark,
                              ),
                            ),
                            Text(
                              user?.username ?? '',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.gray600,
                              ),
                            ),
                            const SizedBox(height: 7),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 9, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.75),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.workspace_premium,
                                    size: 12,
                                    color: AppColors.primaryDark,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    (user?.role ?? 'unknown')
                                        .toUpperCase()
                                        .replaceAll('_', ' '),
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.primaryDark,
                                      letterSpacing: 0.4,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (auth.currentStore != null) ...[
                              const SizedBox(height: 7),
                              Text(
                                auth.currentStore!.displayName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.gray600,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (data.appUpdate != null &&
              data.appUpdate!.enabled &&
              VersionHelper.isNewerVersion(
                  AppConstants.appVersion, data.appUpdate!.version))
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: AppColors.primary.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(
                            Icons.system_update,
                            color: AppColors.primary,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'New Version Available',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.dark,
                                ),
                              ),
                              Text(
                                'Version ${data.appUpdate!.version}',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.gray500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (data.appUpdate!.releaseNotes != null &&
                        data.appUpdate!.releaseNotes!.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        data.appUpdate!.releaseNotes!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: AppColors.gray600,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          final url = Uri.parse(data.appUpdate!.downloadUrl);
                          try {
                            final launched = await launchUrl(
                              url,
                              mode: LaunchMode.externalApplication,
                            );
                            if (!launched) {
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: const Text(
                                        'Could not open download URL'),
                                    backgroundColor: AppColors.danger,
                                    behavior: SnackBarBehavior.floating,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                );
                              }
                            }
                          } catch (e) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('Error opening URL: $e'),
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
                        icon: const Icon(Icons.download, size: 20),
                        label: const Text('Download Update'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          _buildSectionTitle('Account'),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: AppColors.dark.withOpacity(0.04),
                  blurRadius: 16,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              children: [
                InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => setState(
                      () => _passwordExpanded = !_passwordExpanded),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        _iconBox(
                          Icons.lock_outline,
                          AppColors.primary,
                          AppColors.primarySoft.withOpacity(0.7),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Change password',
                                style: TextStyle(
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.dark,
                                ),
                              ),
                              Text(
                                'Update your account password',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  color: AppColors.gray500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        AnimatedRotation(
                          turns: _passwordExpanded ? 0.5 : 0,
                          duration: const Duration(milliseconds: 200),
                          child: const Icon(
                            Icons.keyboard_arrow_down,
                            color: AppColors.gray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                AnimatedCrossFade(
                  duration: const Duration(milliseconds: 250),
                  crossFadeState: _passwordExpanded
                      ? CrossFadeState.showSecond
                      : CrossFadeState.showFirst,
                  firstChild: const SizedBox.shrink(),
                  secondChild: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Column(
                      children: [
                        Divider(height: 1, color: AppColors.gray200),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _currentPasswordController,
                          obscureText: _obscureCurrentPassword,
                          decoration: InputDecoration(
                            labelText: 'Current Password',
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscureCurrentPassword
                                    ? Icons.visibility_off
                                    : Icons.visibility,
                              ),
                              onPressed: () {
                                setState(() {
                                  _obscureCurrentPassword =
                                      !_obscureCurrentPassword;
                                });
                              },
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _newPasswordController,
                          obscureText: _obscureNewPassword,
                          decoration: InputDecoration(
                            labelText: 'New Password',
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscureNewPassword
                                    ? Icons.visibility_off
                                    : Icons.visibility,
                              ),
                              onPressed: () {
                                setState(() {
                                  _obscureNewPassword = !_obscureNewPassword;
                                });
                              },
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _confirmPasswordController,
                          obscureText: _obscureConfirmPassword,
                          decoration: InputDecoration(
                            labelText: 'Confirm New Password',
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscureConfirmPassword
                                    ? Icons.visibility_off
                                    : Icons.visibility,
                              ),
                              onPressed: () {
                                setState(() {
                                  _obscureConfirmPassword =
                                      !_obscureConfirmPassword;
                                });
                              },
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed:
                                _isChangingPassword ? null : _changePassword,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 13),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: _isChangingPassword
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white),
                                  )
                                : const Text(
                                    'Change Password',
                                    style:
                                        TextStyle(fontWeight: FontWeight.w700),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          _buildSectionTitle('Appearance'),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: AppColors.dark.withOpacity(0.04),
                  blurRadius: 16,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _iconBox(
                        Icons.palette_outlined,
                        AppColors.primary,
                        AppColors.primarySoft.withOpacity(0.7),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Color Theme',
                              style: TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w700,
                                color: AppColors.dark,
                              ),
                            ),
                            Text(
                              'Choose the app theme. Saved for ${user?.name ?? 'this user'} on this device.',
                              style: const TextStyle(
                                fontSize: 11.5,
                                color: AppColors.gray500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      const spacing = 8.0;
                      final cardWidth =
                          (constraints.maxWidth - spacing * 2) / 3;
                      return Wrap(
                        spacing: spacing,
                        runSpacing: spacing,
                        children: themeProvider.availableThemes.map((option) {
                          return SizedBox(
                            width: cardWidth,
                            child: _buildThemeCard(
                              option: option,
                              isSelected:
                                  themeProvider.currentThemeId == option.id,
                              onTap: () => themeProvider.setTheme(option.id),
                            ),
                          );
                        }).toList(),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          _buildSectionTitle('Support'),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: AppColors.dark.withOpacity(0.04),
                  blurRadius: 16,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  _iconBox(
                    Icons.chat_bubble_rounded,
                    Colors.white,
                    const Color(0xFF25D366),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'WhatsApp Support',
                          style: TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.dark,
                          ),
                        ),
                        Text(
                          'Need help? Chat with our support team',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: AppColors.gray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    onPressed: _launchWhatsApp,
                    icon: const Icon(Icons.chat_bubble_outline, size: 15),
                    label: const Text(
                      'Chat',
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 0,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          _buildSectionTitle('App'),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: AppColors.dark.withOpacity(0.04),
                  blurRadius: 16,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              children: [
                if (user?.isSuperAdmin ?? false) ...[
                  _settingsRow(
                    icon: Icons.system_update_alt,
                    iconColor: AppColors.primary,
                    iconBg: AppColors.primarySoft.withOpacity(0.7),
                    title: 'App Update Management',
                    subtitle: 'Manage app update notifications',
                    onTap: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const AppUpdateScreen()),
                      );
                    },
                  ),
                  _rowDivider(),
                ],
                _settingsRow(
                  icon: Icons.refresh,
                  iconColor: AppColors.primary,
                  iconBg: AppColors.primarySoft.withOpacity(0.7),
                  title: 'Refresh Data',
                  subtitle:
                      '${data.tables.length} tables, ${data.items.length} items, ${data.orders.length} orders',
                  onTap: _refreshData,
                ),
                _rowDivider(),
                _settingsRow(
                  icon: Icons.info_outline,
                  iconColor: AppColors.info,
                  iconBg: AppColors.info.withOpacity(0.12),
                  title: 'About',
                  subtitle:
                      'Mario App v${AppConstants.appVersion}',
                  onTap: null,
                ),
                _rowDivider(),
                _settingsRow(
                  icon: Icons.logout,
                  iconColor: AppColors.danger,
                  iconBg: AppColors.danger.withOpacity(0.10),
                  title: 'Logout',
                  titleColor: AppColors.danger,
                  onTap: _logout,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 10),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.gray600,
        ),
      ),
    );
  }

  Widget _iconBox(IconData icon, Color iconColor, Color bgColor) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(icon, color: iconColor, size: 20),
    );
  }

  Widget _rowDivider() {
    return Divider(height: 1, indent: 66, endIndent: 16,
        color: AppColors.gray200);
  }

  Widget _settingsRow({
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    String? subtitle,
    Color? titleColor,
    VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            _iconBox(icon, iconColor, iconBg),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: titleColor ?? AppColors.dark,
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle,
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.gray500,
                      ),
                    ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: AppColors.gray400, size: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildThemeCard({
    required AppThemeOption option,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected
              ? option.primarySoft.withOpacity(0.4)
              : AppColors.gray100,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? option.primary : Colors.transparent,
            width: 1.6,
          ),
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildThemeSwatch(option.primary),
                const SizedBox(width: 5),
                _buildThemeSwatch(option.primaryLight),
                const SizedBox(width: 5),
                _buildThemeSwatch(option.primarySoft),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              option.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                color: AppColors.dark,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              option.description,
              maxLines: 2,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 9,
                height: 1.2,
                color: AppColors.gray500,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected ? option.primary : AppColors.gray400,
                  width: isSelected ? 5 : 1.5,
                ),
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildThemeSwatch(Color color) {
    return Container(
      width: 16,
      height: 16,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 1.5),
      ),
    );
  }
}
