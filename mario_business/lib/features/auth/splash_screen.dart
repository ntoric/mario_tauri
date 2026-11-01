import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/session.dart';
import '../../theme/app_theme.dart';

/// Shown at launch while a saved session is checked with the server, and
/// when that check fails because the server can't be reached.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final session = context.watch<Session>();
    final offline = session.status == AuthStatus.offline;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: Image.asset('assets/images/logo.png', width: 72, height: 72),
                ),
                const SizedBox(height: 28),
                if (!offline)
                  SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.5, color: c.accent))
                else ...[
                  Icon(Icons.cloud_off_rounded, size: 36, color: c.textMuted),
                  const SizedBox(height: 12),
                  Text("Can't reach the server", style: context.text.titleMedium),
                  const SizedBox(height: 6),
                  Text(
                    'Check your internet connection and try again.',
                    textAlign: TextAlign.center,
                    style: context.text.bodyMedium?.copyWith(color: c.textSecondary),
                  ),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: session.restore,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Retry'),
                  ),
                  const SizedBox(height: 4),
                  TextButton(onPressed: session.signOut, child: const Text('Sign in with another account')),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
