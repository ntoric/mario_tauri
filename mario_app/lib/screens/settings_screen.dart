import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/user.dart';
import '../models/app_update.dart';
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
  bool _isPasswordExpanded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DataProvider>().loadAppUpdate(platform: 'mobile');
    });
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

      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (route) => false,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final data = context.watch<DataProvider>();
    final themeProvider = context.watch<ThemeProvider>();
    final palette = themeProvider.currentTheme;
    final update = data.appUpdate;
    final showUpdate = update != null &&
        update.enabled &&
        VersionHelper.isNewerVersion(
            AppConstants.appVersion, update.version);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: const AppHeader(
        title: 'Settings',
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
            16, 8, 16, 24 + MediaQuery.of(context).padding.bottom),
        children: [
          _card(_profileContent(user, auth.currentStore, palette)),
          const SizedBox(height: 14),
          if (showUpdate) ...[
            _card(_updateContent(update, palette)),
            const SizedBox(height: 14),
          ],
          _card(_passwordContent(palette)),
          const SizedBox(height: 14),
          _card(_appearanceContent(themeProvider)),
          const SizedBox(height: 14),
          _card(_supportContent(palette)),
          const SizedBox(height: 14),
          _card(_appContent(user, palette)),
        ],
      ),
    );
  }

  Widget _card(Widget child) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.gray200),
        boxShadow: [
          BoxShadow(
            color: AppColors.dark.withOpacity(0.04),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }

  Widget _sectionHeader({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
  }) {
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Icon(icon, color: iconColor, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                ),
              ),
              Text(
                subtitle,
                style: const TextStyle(
                    fontSize: 12.5, color: AppColors.gray600),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // --- Profile card ---
  Widget _profileContent(
      User? user, Store? currentStore, AppThemeOption palette) {
    return Row(
      children: [
        Container(
          width: 84,
          height: 84,
          decoration: BoxDecoration(
            color: palette.primarySoft,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Center(
            child: Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: palette.primaryDark,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.person_rounded,
                  size: 32, color: Colors.white),
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                user?.name ?? 'Unknown',
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: AppColors.dark,
                  height: 1.2,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                user?.username ?? '',
                style: const TextStyle(
                    fontSize: 13, color: AppColors.gray600),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: palette.highlight.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.workspace_premium,
                        size: 14, color: palette.highlight),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(
                        (user?.role ?? 'unknown')
                            .toUpperCase()
                            .replaceAll('_', ' '),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: palette.highlight,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              if (currentStore != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(Icons.location_on_outlined,
                        size: 14, color: AppColors.gray500),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        currentStore.displayName,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.gray600),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  // --- Update card ---
  Widget _updateContent(AppUpdate update, AppThemeOption palette) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader(
          icon: Icons.system_update,
          iconColor: palette.primary,
          title: 'New version available',
          subtitle: 'Version ${update.version}',
        ),
        if (update.releaseNotes != null &&
            update.releaseNotes!.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            update.releaseNotes!,
            style:
                const TextStyle(fontSize: 13, color: AppColors.gray600),
          ),
        ],
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              elevation: 0,
              backgroundColor: palette.primary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            onPressed: () async {
              final url = Uri.parse(update.downloadUrl);
              try {
                final launched = await launchUrl(
                  url,
                  mode: LaunchMode.externalApplication,
                );
                if (!launched) {
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content:
                            const Text('Could not open download URL'),
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
            icon: const Icon(Icons.download, size: 20,
                color: Colors.white),
            label: const Text(
              'Download Update',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }

  // --- Change Password card ---
  Widget _passwordContent(AppThemeOption palette) {
    return Column(
      children: [
        InkWell(
          onTap: () => setState(
              () => _isPasswordExpanded = !_isPasswordExpanded),
          borderRadius: BorderRadius.circular(14),
          child: Row(
            children: [
              Expanded(
                child: _sectionHeader(
                  icon: Icons.shield_outlined,
                  iconColor: palette.highlight,
                  title: 'Change Password',
                  subtitle: 'Update your account password',
                ),
              ),
              AnimatedRotation(
                turns: _isPasswordExpanded ? 0.5 : 0,
                duration: const Duration(milliseconds: 200),
                child: const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: AppColors.gray500,
                ),
              ),
            ],
          ),
        ),
        AnimatedCrossFade(
          firstChild: const SizedBox.shrink(),
          secondChild: _passwordForm(palette),
          crossFadeState: _isPasswordExpanded
              ? CrossFadeState.showSecond
              : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 220),
          sizeCurve: Curves.easeOutCubic,
        ),
      ],
    );
  }

  Widget _passwordForm(AppThemeOption palette) {
    return Column(
      children: [
        const SizedBox(height: 14),
        _passwordField(
          hint: 'Current Password',
          controller: _currentPasswordController,
          obscure: _obscureCurrentPassword,
          onToggle: () => setState(() =>
              _obscureCurrentPassword = !_obscureCurrentPassword),
          palette: palette,
        ),
        const SizedBox(height: 10),
        _passwordField(
          hint: 'New Password',
          controller: _newPasswordController,
          obscure: _obscureNewPassword,
          onToggle: () =>
              setState(() => _obscureNewPassword = !_obscureNewPassword),
          palette: palette,
        ),
        const SizedBox(height: 10),
        _passwordField(
          hint: 'Confirm New Password',
          controller: _confirmPasswordController,
          obscure: _obscureConfirmPassword,
          onToggle: () => setState(
              () => _obscureConfirmPassword = !_obscureConfirmPassword),
          palette: palette,
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton(
            onPressed: _isChangingPassword ? null : _changePassword,
            style: ElevatedButton.styleFrom(
              elevation: 0,
              backgroundColor: palette.highlight,
              disabledBackgroundColor:
                  palette.highlight.withOpacity(0.6),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: _isChangingPassword
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : const Text(
                    'Change Password',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _passwordField({
    required String hint,
    required TextEditingController controller,
    required bool obscure,
    required VoidCallback onToggle,
    required AppThemeOption palette,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle:
            const TextStyle(fontSize: 14, color: AppColors.gray500),
        filled: true,
        fillColor: palette.background,
        contentPadding: const EdgeInsets.symmetric(
            horizontal: 16, vertical: 16),
        prefixIcon: const Icon(Icons.lock_outline,
            size: 20, color: AppColors.gray500),
        suffixIcon: IconButton(
          icon: Icon(
            obscure
                ? Icons.visibility_off_outlined
                : Icons.visibility_outlined,
            size: 20,
            color: AppColors.gray500,
          ),
          onPressed: onToggle,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: palette.primary, width: 1.5),
        ),
      ),
    );
  }

  // --- Appearance card ---
  Widget _appearanceContent(ThemeProvider themeProvider) {
    return Column(
      children: [
        _sectionHeader(
          icon: Icons.palette_outlined,
          iconColor: const Color(0xFF6366F1),
          title: 'Appearance',
          subtitle: 'Choose a theme for the app',
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 112,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: themeProvider.availableThemes.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final option = themeProvider.availableThemes[index];
              final isSelected =
                  themeProvider.currentThemeId == option.id;
              return _themeCard(
                option: option,
                isSelected: isSelected,
                onTap: () => themeProvider.setTheme(option.id),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _themeCard({
    required AppThemeOption option,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          width: 128,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isSelected
                ? option.primarySoft.withOpacity(0.6)
                : Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color:
                  isSelected ? option.primary : AppColors.gray200,
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _themeDot(option.primary),
                  const SizedBox(width: 5),
                  _themeDot(option.primaryLight),
                  const SizedBox(width: 5),
                  _themeDot(option.backgroundSecondary),
                  const Spacer(),
                  Container(
                    width: 18,
                    height: 18,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isSelected
                            ? option.primary
                            : AppColors.gray400,
                        width: isSelected ? 2 : 1.5,
                      ),
                    ),
                    child: isSelected
                        ? Center(
                            child: Container(
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: option.primary,
                                shape: BoxShape.circle,
                              ),
                            ),
                          )
                        : null,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                option.label,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.dark,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Text(
                option.description,
                style: const TextStyle(
                    fontSize: 11, color: AppColors.gray600),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _themeDot(Color color) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 1.5),
      ),
    );
  }

  // --- Support card ---
  Widget _supportContent(AppThemeOption palette) {
    return Column(
      children: [
        _sectionHeader(
          icon: Icons.support_agent_rounded,
          iconColor: const Color(0xFF25D366),
          title: 'Support',
          subtitle: 'Get help from our support team',
        ),
        const SizedBox(height: 14),
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.gray200),
          ),
          child: _appRow(
            icon: Icons.chat_rounded,
            color: const Color(0xFF25D366),
            title: 'WhatsApp Support',
            subtitle: 'Chat with us on WhatsApp',
            onTap: _launchWhatsAppSupport,
          ),
        ),
      ],
    );
  }

  Future<void> _launchWhatsAppSupport() async {
    const number = '918129490227';
    final whatsappUri = Uri.parse('whatsapp://send?phone=$number');
    final fallbackUri = Uri.parse('https://wa.me/$number');
    if (await canLaunchUrl(whatsappUri)) {
      await launchUrl(whatsappUri, mode: LaunchMode.externalApplication);
    } else if (await canLaunchUrl(fallbackUri)) {
      await launchUrl(fallbackUri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open WhatsApp'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  // --- App card ---
  Widget _appContent(User? user, AppThemeOption palette) {
    final isSuperAdmin = user?.isSuperAdmin ?? false;
    final rows = <Widget>[
      if (isSuperAdmin)
        _appRow(
          icon: Icons.system_update_alt,
          color: palette.primary,
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
      _appRow(
        icon: Icons.info_outline,
        color: AppColors.info,
        title: 'About',
        subtitle: 'Mario App v${AppConstants.appVersion}',
        showChevron: false,
      ),
      _appRow(
        icon: Icons.logout,
        color: AppColors.danger,
        title: 'Logout',
        titleColor: AppColors.danger,
        subtitle: 'Sign out from this device',
        onTap: _logout,
      ),
    ];

    return Column(
      children: [
        _sectionHeader(
          icon: Icons.settings_rounded,
          iconColor: AppColors.info,
          title: 'App',
          subtitle: 'App information and account actions',
        ),
        const SizedBox(height: 14),
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.gray200),
          ),
          child: Column(
            children: [
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0)
                  const Divider(
                      height: 1, color: AppColors.gray200),
                rows[i],
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _appRow({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    VoidCallback? onTap,
    bool showChevron = true,
    Color titleColor = AppColors.dark,
  }) {
    final row = Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: titleColor,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.gray500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          if (showChevron)
            const Icon(Icons.chevron_right_rounded,
                color: AppColors.gray400, size: 20),
        ],
      ),
    );

    if (onTap == null) return row;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: row,
      ),
    );
  }
}
