import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config.dart';
import '../../core/format.dart';
import '../../data/owner_repository.dart';
import '../../state/session.dart';
import '../../theme/app_theme.dart';
import '../../theme/theme_controller.dart';
import '../../widgets/common.dart';
import '../../widgets/nav.dart';
import '../../widgets/store_switcher.dart';
import '../stores/store_comparison_screen.dart';
import '../stores/store_details_screen.dart';
import 'appearance_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final theme = context.watch<ThemeController>();
    final c = context.colors;
    final user = s.user;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
        children: [
          SectionCard(
            child: Row(children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: c.accentSoft,
                child: Text(Fmt.initials(user?.displayName ?? '?'),
                    style: context.text.titleMedium?.copyWith(color: c.accent, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(user?.displayName ?? '', style: context.text.titleMedium),
                  Text('@${user?.username ?? ''}', style: context.text.bodySmall),
                  if (user?.email.isNotEmpty == true) Text(user!.email, style: context.text.bodySmall),
                ]),
              ),
              Pill('Owner', color: c.accent, icon: Icons.workspace_premium_outlined),
            ]),
          ),
          _Group(title: 'Stores', children: [
            _Tile(
              icon: Icons.storefront_outlined,
              title: 'Current store',
              subtitle: s.store?.displayName ?? 'None',
              onTap: () => showStorePicker(context),
            ),
            _Tile(
              icon: Icons.info_outline_rounded,
              title: 'Store details',
              subtitle: 'Address, GST and team',
              onTap: s.store == null ? null : () => push(context, const StoreDetailsScreen()),
            ),
            if (s.stores.length > 1)
              _Tile(
                icon: Icons.compare_arrows_rounded,
                title: 'Compare stores',
                subtitle: '${s.stores.length} stores assigned to you',
                onTap: () => push(context, const StoreComparisonScreen()),
              ),
            _Tile(
              icon: Icons.sync_rounded,
              title: 'Refresh store access',
              subtitle: 'Pick up stores newly assigned by your administrator',
              onTap: () async {
                final messenger = ScaffoldMessenger.of(context);
                final session = context.read<Session>();
                try {
                  await session.refreshStores();
                  messenger.showSnackBar(SnackBar(content: Text('You have access to ${session.stores.length} store(s)')));
                } catch (e) {
                  messenger.showSnackBar(SnackBar(content: Text('$e')));
                }
              },
            ),
          ]),
          _Group(title: 'Preferences', children: [
            _Tile(
              icon: Icons.palette_outlined,
              title: 'Appearance',
              subtitle: '${switch (theme.mode) { ThemeMode.light => 'Light', ThemeMode.dark => 'Dark', ThemeMode.system => 'System' }} · ${theme.accent.name}',
              trailing: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle, border: Border.all(color: c.border, width: 2)),
              ),
              onTap: () => push(context, const AppearanceScreen()),
            ),
            SwitchListTile(
              secondary: Icon(Icons.short_text_rounded, color: c.textSecondary),
              title: Text('Compact numbers', style: context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
              subtitle: Text('Show ₹1.2L instead of ₹1,20,000 on tiles', style: context.text.bodySmall),
              value: theme.compactNumbers,
              onChanged: (v) => theme.compactNumbers = v,
            ),
          ]),
          _Group(title: 'Account', children: [
            _Tile(icon: Icons.lock_reset_rounded, title: 'Change password', onTap: () => _changePassword(context)),
            _Tile(
              icon: Icons.logout_rounded,
              title: 'Sign out',
              destructive: true,
              onTap: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('Sign out?'),
                    content: const Text('You will need your username and password to sign in again.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                      TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Sign out')),
                    ],
                  ),
                );
                if (ok == true && context.mounted) await context.read<Session>().signOut();
              },
            ),
          ]),
          const SizedBox(height: 24),
          Center(
            child: Column(children: [
              Text(AppConfig.appName, style: context.text.labelLarge?.copyWith(color: c.textMuted)),
              const SizedBox(height: 2),
              Text('Version 1.0.0', style: context.text.labelSmall?.copyWith(color: c.textMuted)),
            ]),
          ),
        ],
      ),
    );
  }

  Future<void> _changePassword(BuildContext context) async {
    final cur = TextEditingController();
    final next = TextEditingController();
    final confirm = TextEditingController();
    final form = GlobalKey<FormState>();
    final repo = context.read<OwnerRepository>();
    final session = context.read<Session>();
    await showDialog(
      context: context,
      builder: (ctx) {
        var busy = false;
        String? error;
        return StatefulBuilder(builder: (ctx, setState) {
          return AlertDialog(
            title: const Text('Change password'),
            content: Form(
              key: form,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextFormField(
                  controller: cur,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Current password'),
                  validator: (v) => (v ?? '').isEmpty ? 'Required' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: next,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'New password'),
                  validator: (v) => (v ?? '').length < 6 ? 'At least 6 characters' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: confirm,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Confirm new password'),
                  validator: (v) => v != next.text ? 'Passwords don\'t match' : null,
                ),
                if (error != null) ...[
                  const SizedBox(height: 10),
                  Text(error!, style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
                ],
              ]),
            ),
            actions: [
              TextButton(onPressed: busy ? null : () => Navigator.pop(ctx), child: const Text('Cancel')),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(96, 40)),
                onPressed: busy
                    ? null
                    : () async {
                        if (!form.currentState!.validate()) return;
                        setState(() {
                          busy = true;
                          error = null;
                        });
                        try {
                          await repo.changePassword(cur.text, next.text);
                          if (ctx.mounted) Navigator.pop(ctx);
                          // The server signs out every device after a password change.
                          await session.endAfterPasswordChange();
                        } catch (e) {
                          setState(() {
                            busy = false;
                            error = e.toString();
                          });
                        }
                      },
                child: const Text('Update'),
              ),
            ],
          );
        });
      },
    );
  }
}

class _Group extends StatelessWidget {
  const _Group({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 22, 4, 8),
          child: Text(title.toUpperCase(),
              style: context.text.labelSmall?.copyWith(color: c.textMuted, letterSpacing: 1.1, fontWeight: FontWeight.w700)),
        ),
        Container(
          decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(20), border: Border.all(color: c.border)),
          clipBehavior: Clip.antiAlias,
          child: Material(
            color: Colors.transparent,
            child: Column(children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) Divider(indent: 56, color: c.border),
                children[i],
              ],
            ]),
          ),
        ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.title, this.subtitle, this.onTap, this.trailing, this.destructive = false});

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final color = destructive ? Theme.of(context).colorScheme.error : null;
    return ListTile(
      onTap: onTap,
      shape: const RoundedRectangleBorder(),
      leading: Icon(icon, color: color ?? c.textSecondary),
      title: Text(title, style: context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w600, color: color)),
      subtitle: subtitle == null ? null : Text(subtitle!, style: context.text.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: trailing ?? (destructive ? null : Icon(Icons.chevron_right_rounded, color: c.textMuted)),
    );
  }
}
