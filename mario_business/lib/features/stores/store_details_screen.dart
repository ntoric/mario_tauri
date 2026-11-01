import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../models/store.dart';
import '../../models/user.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../reports/report_scaffold.dart';

/// Read-only store profile and the team working there.
class StoreDetailsScreen extends StatelessWidget {
  const StoreDetailsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ReportPage<(Store, List<StaffUser>)>(
      title: 'Store details',
      showRange: false,
      load: (repo, id, r, f) async {
        final res = await Future.wait<Object>([
          repo.store(id, force: f),
          repo.users(force: f).catchError((_) => <StaffUser>[]),
        ]);
        final team = (res[1] as List<StaffUser>).where((u) => u.worksAt(id) && u.role != 'business_owner').toList()
          ..sort((a, b) => a.displayName.compareTo(b.displayName));
        return (res[0] as Store, team);
      },
      builder: (context, d, _) {
        final (s, team) = d;
        final c = context.colors;
        return ReportList(children: [
          SectionCard(
            child: Row(children: [
              StoreAvatar(s, size: 64),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.name, style: context.text.titleLarge),
                  if (s.branch.isNotEmpty) Text(s.branch, style: context.text.bodyMedium?.copyWith(color: c.textSecondary)),
                  const SizedBox(height: 6),
                  Pill(s.isActive ? 'Active' : 'Inactive', icon: s.isActive ? Icons.check_circle_rounded : Icons.pause_circle_outline_rounded),
                ]),
              ),
            ]),
          ),
          SectionCard(
            title: 'Contact',
            child: Column(children: [
              InfoRow('Location', s.location.isEmpty ? '—' : s.location),
              InfoRow('Phone', s.phone.isEmpty ? '—' : s.phone),
              if (s.createdAt != null) InfoRow('On Mario since', Fmt.date(s.createdAt!)),
            ]),
          ),
          SectionCard(
            title: 'Tax & compliance',
            child: Column(children: [
              InfoRow('GSTIN', s.gstin.isEmpty ? 'Not set' : s.gstin),
              InfoRow('Registration', s.gstRegistrationType.isEmpty ? '—' : Fmt.label(s.gstRegistrationType)),
              InfoRow('FSSAI', s.fssaiNo.isEmpty ? 'Not set' : s.fssaiNo),
              InfoRow('Tax on bills', s.taxEnabled ? 'Enabled (${Fmt.percent(s.defaultTaxPercent, digits: 0)} default)' : 'Disabled'),
              InfoRow('Menu prices', s.pricesIncludeTax ? 'Include tax' : 'Exclude tax'),
            ]),
          ),
          SectionCard(
            title: 'Team',
            subtitle: '${team.length} staff with access',
            child: team.isEmpty
                ? Text('No staff accounts found for this store.', style: context.text.bodySmall)
                : Column(children: [
                    for (final u in team)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Row(children: [
                          CircleAvatar(
                            radius: 18,
                            backgroundColor: c.accentSoft,
                            child: Text(Fmt.initials(u.displayName),
                                style: context.text.labelMedium?.copyWith(color: c.accent, fontWeight: FontWeight.w800)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(u.displayName, style: context.text.titleSmall),
                              Text('@${u.username}', style: context.text.labelSmall?.copyWith(color: c.textMuted)),
                            ]),
                          ),
                          Pill(Fmt.label(u.role.replaceAll('business_', ''))),
                          if (!u.isActive) ...[const SizedBox(width: 6), const Pill('Inactive')],
                        ]),
                      ),
                  ]),
          ),
          if (s.dataRetentionDays > 0)
            Text(
              'Reports for this store show the last ${s.dataRetentionDays} days of data.',
              style: context.text.bodySmall?.copyWith(color: c.textMuted),
              textAlign: TextAlign.center,
            ),
          Text(
            'Store settings are managed by your administrator.',
            style: context.text.bodySmall?.copyWith(color: c.textMuted),
            textAlign: TextAlign.center,
          ),
        ]);
      },
    );
  }
}
