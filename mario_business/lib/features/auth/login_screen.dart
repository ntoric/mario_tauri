import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/config.dart';
import '../../state/session.dart';
import '../../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _user;
  final _pass = TextEditingController();
  bool _obscure = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    final s = context.read<Session>();
    _user = TextEditingController(text: s.lastUsername);
    _error = s.takeNotice();
  }

  @override
  void dispose() {
    _user.dispose();
    _pass.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _error = null);
    try {
      await context.read<Session>().signIn(_user.text, _pass.text);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final busy = context.select<Session, bool>((s) => s.status == AuthStatus.signingIn);

    return Scaffold(
      body: Stack(
        children: [
          // Soft accent glow behind the form.
          Positioned(
            top: -140,
            right: -100,
            child: Container(
              width: 340,
              height: 340,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [c.accent.withValues(alpha: 0.28), c.accent.withValues(alpha: 0)]),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Form(
                    key: _form,
                    child: AutofillGroup(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(16),
                                child: Image.asset('assets/images/logo.png', width: 56, height: 56),
                              ),
                              const SizedBox(width: 14),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(AppConfig.appName, style: context.text.titleLarge),
                                  Text('Owner analytics', style: context.text.bodySmall),
                                ],
                              ),
                            ],
                          ),
                          const SizedBox(height: 40),
                          Text('Welcome back', style: context.text.headlineMedium),
                          const SizedBox(height: 6),
                          Text(
                            'Sign in to see sales, profit and reports across your stores.',
                            style: context.text.bodyMedium?.copyWith(color: c.textSecondary),
                          ),
                          const SizedBox(height: 28),
                          TextFormField(
                            controller: _user,
                            enabled: !busy,
                            autofillHints: const [AutofillHints.username],
                            textInputAction: TextInputAction.next,
                            autocorrect: false,
                            decoration: const InputDecoration(
                              labelText: 'Username',
                              prefixIcon: Icon(Icons.person_outline_rounded),
                            ),
                            validator: (v) => (v ?? '').trim().isEmpty ? 'Enter your username' : null,
                          ),
                          const SizedBox(height: 14),
                          TextFormField(
                            controller: _pass,
                            enabled: !busy,
                            obscureText: _obscure,
                            autofillHints: const [AutofillHints.password],
                            textInputAction: TextInputAction.done,
                            onFieldSubmitted: (_) => _submit(),
                            decoration: InputDecoration(
                              labelText: 'Password',
                              prefixIcon: const Icon(Icons.lock_outline_rounded),
                              suffixIcon: IconButton(
                                tooltip: _obscure ? 'Show password' : 'Hide password',
                                icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              ),
                            ),
                            validator: (v) => (v ?? '').isEmpty ? 'Enter your password' : null,
                          ),
                          AnimatedSize(
                            duration: const Duration(milliseconds: 200),
                            child: _error == null
                                ? const SizedBox(height: 0, width: double.infinity)
                                : Container(
                                    margin: const EdgeInsets.only(top: 16),
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: Theme.of(context).colorScheme.errorContainer,
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Icon(Icons.error_outline_rounded,
                                            size: 18, color: Theme.of(context).colorScheme.onErrorContainer),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(_error!,
                                              style: context.text.bodySmall?.copyWith(
                                                  color: Theme.of(context).colorScheme.onErrorContainer)),
                                        ),
                                      ],
                                    ),
                                  ),
                          ),
                          const SizedBox(height: 24),
                          FilledButton(
                            onPressed: busy ? null : _submit,
                            child: busy
                                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                                : const Text('Sign in'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
