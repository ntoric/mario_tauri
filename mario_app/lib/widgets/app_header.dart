import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../providers/theme_provider.dart';
import '../models/user.dart';
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
      backgroundColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) {
        final palette = sheetContext.watch<ThemeProvider>().currentTheme;
        return SafeArea(
          child: Container(
            margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            decoration: ClayStyles.surface(radiusValue: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 42,
                  height: 6,
                  decoration: BoxDecoration(
                    color: AppColors.gray400.withOpacity(0.7),
                    borderRadius: BorderRadius.circular(100),
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

                      return Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: isCurrent
                            ? ClayStyles.accent(
                                accent: palette.primary,
                                radiusValue: 24,
                                opacity: 0.12,
                              )
                            : ClayStyles.surface(radiusValue: 24),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 18, vertical: 8),
                          leading: _HeaderIconShell(
                            icon: Icons.storefront,
                            color:
                                isCurrent ? palette.primary : AppColors.gray600,
                            accentColor: isCurrent
                                ? palette.primarySoft
                                : AppColors.gray200,
                            size: 44,
                          ),
                          title: Text(
                            store.name,
                            style: TextStyle(
                              fontWeight:
                                  isCurrent ? FontWeight.w700 : FontWeight.w600,
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
                              ? const Icon(Icons.check_circle_rounded,
                                  color: AppColors.success)
                              : const Icon(Icons.chevron_right_rounded,
                                  color: AppColors.gray500),
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
                                  content:
                                      Text('Switched to ${store.displayName}'),
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
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
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

    return AppBar(
      toolbarHeight: 72,
      automaticallyImplyLeading: false,
      titleSpacing: 0,
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      title: HeaderBar(
        title: title,
        subtitle: showStoreName ? auth.currentStore?.displayName : null,
        showSubtitleChevron: true,
        onSubtitleTap: () => AppHeader.showStoreSwitcher(context),
        showBack: automaticallyImplyLeading ? null : false,
        actions: actions,
      ),
      bottom: bottom,
    );
  }
}

class HeaderBar extends StatelessWidget {
  final String title;
  final String? subtitle;
  final VoidCallback? onSubtitleTap;
  final bool showSubtitleChevron;

  /// null = auto-detect from `ModalRoute.canPop`.
  final bool? showBack;
  final List<Widget>? actions;

  const HeaderBar({
    super.key,
    required this.title,
    this.subtitle,
    this.onSubtitleTap,
    this.showSubtitleChevron = false,
    this.showBack,
    this.actions,
  });

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final effectiveShowBack =
        showBack ?? (ModalRoute.of(context)?.canPop ?? false);
    final hasStores = (auth.user?.stores ?? []).isNotEmpty;
    final connected = auth.isBackendConnected;
    final store = auth.currentStore;
    final storeMode = !effectiveShowBack && store != null && subtitle != null;

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.08),
              blurRadius: 20,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.55),
                border: Border.all(
                  color: Colors.white.withOpacity(0.65),
                ),
              ),
              child: Row(
                children: [
                  if (effectiveShowBack)
                    Material(
                      color: Colors.white,
                      shape: const CircleBorder(),
                      child: InkWell(
                        onTap: () => Navigator.maybePop(context),
                        customBorder: const CircleBorder(),
                        child: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: AppColors.gray200),
                          ),
                          child: const Icon(
                            Icons.arrow_back_ios_new_rounded,
                            size: 18,
                            color: AppColors.dark,
                          ),
                        ),
                      ),
                    )
                  else
                    Container(
                      width: 50,
                      height: 50,
                      padding: const EdgeInsets.all(7),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.gray200),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.dark.withOpacity(0.06),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: ClipOval(
                        child: Image.asset(
                          'assets/images/logo.png',
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: storeMode
                        ? _storeTitle(store, hasStores, onSubtitleTap, title)
                        : _plainTitle(hasStores, onSubtitleTap),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: connected
                          ? AppColors.tableAvailable.withOpacity(0.12)
                          : AppColors.gray200,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: connected
                                ? AppColors.tableAvailable
                                : AppColors.gray600,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          connected ? 'Online' : 'Offline',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: connected
                                ? AppColors.tableAvailable
                                : AppColors.gray600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (actions != null)
                    for (final action in actions!) ...[
                      const SizedBox(width: 4),
                      action,
                    ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _storeTitle(
      Store store, bool hasStores, VoidCallback? onTap, String semanticsTitle) {
    final secondLine = store.branch ?? store.location;
    return Semantics(
      label: semanticsTitle,
      child: InkWell(
        onTap: hasStores ? onTap : null,
        borderRadius: BorderRadius.circular(8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Flexible(
                  child: Text(
                    store.name,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: AppColors.dark,
                      letterSpacing: -0.3,
                      height: 1.15,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (showSubtitleChevron && hasStores) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.keyboard_arrow_down_rounded,
                      size: 22, color: AppColors.dark),
                ],
              ],
            ),
            if (secondLine != null) ...[
              const SizedBox(height: 2),
              Text(
                secondLine,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w500,
                  color: AppColors.gray600,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _plainTitle(bool hasStores, VoidCallback? onTap) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: AppColors.dark,
            letterSpacing: -0.3,
            height: 1.15,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(6),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.storefront_outlined,
                    size: 13, color: AppColors.gray600),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    subtitle!,
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                      color: AppColors.gray600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (showSubtitleChevron && hasStores)
                  const Icon(Icons.keyboard_arrow_down_rounded,
                      size: 16, color: AppColors.gray600),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class HeaderIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final String? tooltip;
  final Color? color;

  const HeaderIconButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.tooltip,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Tooltip(
          message: tooltip ?? '',
          child: SizedBox(
            width: 40,
            height: 40,
            child: Icon(icon, size: 24, color: color ?? AppColors.dark),
          ),
        ),
      ),
    );
  }
}

class _HeaderIconShell extends StatelessWidget {
  final IconData icon;
  final Color color;
  final Color accentColor;
  final double size;

  const _HeaderIconShell({
    required this.icon,
    required this.color,
    this.accentColor = AppColors.gray100,
    this.size = 48,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: ClayStyles.surface(
        radiusValue: 16,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white,
            accentColor,
          ],
        ),
      ),
      child: Icon(icon, color: color, size: 22),
    );
  }
}
