import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../../theme/palettes.dart';
import '../../theme/theme_controller.dart';
import '../../widgets/common.dart';

class AppearanceScreen extends StatelessWidget {
  const AppearanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = context.watch<ThemeController>();
    final c = context.colors;
    final b = context.brightness;

    return Scaffold(
      appBar: AppBar(title: const Text('Appearance')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
        children: [
          _Preview(),
          const SizedBox(height: 20),
          Text('Mode', style: context.text.titleSmall),
          const SizedBox(height: 10),
          Row(children: [
            for (final (mode, label, icon) in [
              (ThemeMode.light, 'Light', Icons.light_mode_outlined),
              (ThemeMode.dark, 'Dark', Icons.dark_mode_outlined),
              (ThemeMode.system, 'System', Icons.brightness_auto_outlined),
            ]) ...[
              Expanded(
                child: _ModeCard(
                  label: label,
                  icon: icon,
                  selected: t.mode == mode,
                  onTap: () => t.mode = mode,
                ),
              ),
              if (mode != ThemeMode.system) const SizedBox(width: 10),
            ],
          ]),
          const SizedBox(height: 24),
          Text('Colour theme', style: context.text.titleSmall),
          const SizedBox(height: 4),
          Text('Used for buttons, highlights and single-series charts.', style: context.text.bodySmall),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 0.82,
            children: [
              for (final a in accentThemes)
                InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => t.accent = a,
                  child: Container(
                    decoration: BoxDecoration(
                      color: c.card,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: t.accent.id == a.id ? a.of(b) : c.border, width: t.accent.id == a.id ? 2 : 1),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(colors: [a.light, a.dark], begin: Alignment.topLeft, end: Alignment.bottomRight),
                          ),
                          child: t.accent.id == a.id ? const Icon(Icons.check_rounded, color: Colors.white, size: 18) : null,
                        ),
                        const SizedBox(height: 8),
                        Text(a.name,
                            style: context.text.labelSmall?.copyWith(fontWeight: FontWeight.w600),
                            textAlign: TextAlign.center,
                            maxLines: 2),
                      ],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 24),
          Container(
            decoration: BoxDecoration(color: c.card, borderRadius: BorderRadius.circular(20), border: Border.all(color: c.border)),
            child: Column(children: [
              SwitchListTile(
                title: Text('Pure black dark mode', style: context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                subtitle: Text('Saves battery on OLED screens', style: context.text.bodySmall),
                value: t.trueBlack,
                onChanged: (v) => t.trueBlack = v,
              ),
              Divider(indent: 16, color: c.border),
              SwitchListTile(
                title: Text('Compact numbers', style: context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                subtitle: Text('₹1.2L instead of ₹1,20,000 on tiles', style: context.text.bodySmall),
                value: t.compactNumbers,
                onChanged: (v) => t.compactNumbers = v,
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({required this.label, required this.icon, required this.selected, required this.onTap});

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: selected ? c.accentSoft : c.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? c.accent : c.border, width: selected ? 2 : 1),
        ),
        child: Column(children: [
          Icon(icon, color: selected ? c.accent : c.textSecondary),
          const SizedBox(height: 6),
          Text(label, style: context.text.labelLarge?.copyWith(color: selected ? c.accent : c.textSecondary)),
        ]),
      ),
    );
  }
}

/// Live sample of the current theme.
class _Preview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final onAccent = Theme.of(context).colorScheme.onPrimary;
    final bars = [0.35, 0.6, 0.45, 0.8, 0.55, 1.0, 0.7];
    return SectionCard(
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Net sales', style: context.text.labelMedium?.copyWith(color: c.textMuted)),
            const SizedBox(height: 4),
            Text('₹48,250', style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: c.accent, borderRadius: BorderRadius.circular(10)),
              child: Text('Preview', style: context.text.labelMedium?.copyWith(color: onAccent, fontWeight: FontWeight.w700)),
            ),
          ]),
        ),
        SizedBox(
          height: 72,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (var i = 0; i < bars.length; i++)
                Container(
                  width: 10,
                  height: 72 * bars[i],
                  margin: const EdgeInsets.only(left: 4),
                  decoration: BoxDecoration(
                    color: i == 5 ? c.accent : c.accent.withValues(alpha: 0.45),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                  ),
                ),
            ],
          ),
        ),
      ]),
    );
  }
}
