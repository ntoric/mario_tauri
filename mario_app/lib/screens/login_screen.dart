import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:ui' as ui;
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import 'home_screen.dart';
import 'support_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    final auth = context.read<AuthProvider>();

    final success = await auth.login(
      _usernameController.text.trim(),
      _passwordController.text,
    );

    if (success && mounted) {
      // Check if store is active
      final store = auth.currentStore;
      final user = auth.user;

      // If user is not superadmin and store is inactive, show support page
      if (user?.role != 'superadmin' && store != null && !store.isActive) {
        // Fetch support config
        try {
          final response = await http.get(
            Uri.parse('${auth.backend.api.baseUrl}/support-config'),
          );

          if (response.statusCode == 200) {
            final data = json.decode(response.body);
            Navigator.of(context).pushReplacement(
              MaterialPageRoute(
                builder: (_) => SupportScreen(
                  email: data['email'] ?? '',
                  phone: data['phone'] ?? '',
                  whatsappLink: data['whatsappLink'] ?? '',
                  storeName: store.name,
                  storeBranch: store.branch,
                ),
              ),
            );
            return;
          }
        } catch (e) {
          // If support config fetch fails, show support page with empty values
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) => SupportScreen(
                email: '',
                phone: '',
                whatsappLink: '',
                storeName: store.name,
                storeBranch: store.branch,
              ),
            ),
          );
          return;
        }
      }

      final dataProvider = context.read<DataProvider>();
      await dataProvider.loadAllData(auth);

      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isTablet = ResponsiveHelper.isTablet(context);
    final isDesktop = ResponsiveHelper.isDesktop(context);

    InputBorder fieldBorder(Color color) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: color),
        );

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          // Soft peach blobs (top-left / bottom-left)
          Positioned(
            top: -70,
            left: -80,
            child: _blurredBlob(210, const Color(0xFFFFDCB0)),
          ),
          Positioned(
            bottom: -60,
            left: -90,
            child: _blurredBlob(230, const Color(0xFFFFC98A)),
          ),
          Positioned(
            bottom: 60,
            left: -40,
            child: _blurredBlob(150, const Color(0xFFFFE9D2)),
          ),
          // Olive branches (top-right sharp, bottom-right blurred)
          const Positioned(
            top: -8,
            right: -16,
            child: SizedBox(
              width: 150,
              height: 150,
              child: CustomPaint(painter: _LeafBranchPainter()),
            ),
          ),
          Positioned(
            bottom: -20,
            right: -30,
            child: ImageFiltered(
              imageFilter: ui.ImageFilter.blur(sigmaX: 3, sigmaY: 3),
              child: const SizedBox(
                width: 170,
                height: 170,
                child: CustomPaint(painter: _LeafBranchPainter()),
              ),
            ),
          ),

          // Content
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Container(
                  constraints: BoxConstraints(
                    maxWidth:
                        isDesktop ? 440 : (isTablet ? 400 : double.infinity),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const SizedBox(height: 40),
                      Image.asset(
                        'assets/images/logo.png',
                        height: 62,
                        fit: BoxFit.contain,
                      ),
                      const SizedBox(height: 26),
                      const Text(
                        'Welcome back',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: AppColors.dark,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Sign in to manage your restaurant',
                        style: TextStyle(
                          fontSize: 14.5,
                          color: AppColors.gray500,
                        ),
                      ),
                      const SizedBox(height: 28),
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.dark.withOpacity(0.06),
                              blurRadius: 24,
                              offset: const Offset(0, 8),
                            ),
                          ],
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (auth.error != null) ...[
                              Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                  color: AppColors.danger.withOpacity(0.08),
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(
                                      Icons.error_outline,
                                      color: AppColors.danger,
                                      size: 20,
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        auth.error!,
                                        style: const TextStyle(
                                          color: AppColors.danger,
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                            ],
                            Form(
                              key: _formKey,
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  const _FieldLabel('Username'),
                                  const SizedBox(height: 8),
                                  TextFormField(
                                    controller: _usernameController,
                                    decoration: InputDecoration(
                                      hintText: 'Username',
                                      hintStyle: const TextStyle(
                                        fontSize: 14,
                                        color: AppColors.gray400,
                                      ),
                                      prefixIcon: const Icon(
                                        Icons.person_outline,
                                        color: AppColors.gray600,
                                        size: 21,
                                      ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                              vertical: 16),
                                      enabledBorder:
                                          fieldBorder(AppColors.gray300),
                                      focusedBorder: fieldBorder(
                                          AppColors.primary),
                                      errorBorder:
                                          fieldBorder(AppColors.danger),
                                      focusedErrorBorder:
                                          fieldBorder(AppColors.danger),
                                    ),
                                    validator: (value) {
                                      if (value == null || value.isEmpty) {
                                        return 'Please enter your username';
                                      }
                                      return null;
                                    },
                                    textInputAction: TextInputAction.next,
                                  ),
                                  const SizedBox(height: 18),
                                  const _FieldLabel('Password'),
                                  const SizedBox(height: 8),
                                  TextFormField(
                                    controller: _passwordController,
                                    obscureText: _obscurePassword,
                                    decoration: InputDecoration(
                                      hintText: 'Password',
                                      hintStyle: const TextStyle(
                                        fontSize: 14,
                                        color: AppColors.gray400,
                                      ),
                                      prefixIcon: const Icon(
                                        Icons.lock_outline,
                                        color: AppColors.gray600,
                                        size: 21,
                                      ),
                                      suffixIcon: IconButton(
                                        icon: Icon(
                                          _obscurePassword
                                              ? Icons.visibility_off_outlined
                                              : Icons.visibility_outlined,
                                          color: AppColors.gray500,
                                          size: 21,
                                        ),
                                        onPressed: () {
                                          setState(() {
                                            _obscurePassword =
                                                !_obscurePassword;
                                          });
                                        },
                                      ),
                                      filled: true,
                                      fillColor: Colors.white,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                              vertical: 16),
                                      enabledBorder:
                                          fieldBorder(AppColors.gray300),
                                      focusedBorder: fieldBorder(
                                          AppColors.primary),
                                      errorBorder:
                                          fieldBorder(AppColors.danger),
                                      focusedErrorBorder:
                                          fieldBorder(AppColors.danger),
                                    ),
                                    validator: (value) {
                                      if (value == null || value.isEmpty) {
                                        return 'Please enter your password';
                                      }
                                      return null;
                                    },
                                    textInputAction: TextInputAction.done,
                                    onFieldSubmitted: (_) => _login(),
                                  ),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: TextButton(
                                      onPressed: () {
                                        ScaffoldMessenger.of(context)
                                            .showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                                'Contact your administrator to reset your password'),
                                            behavior:
                                                SnackBarBehavior.floating,
                                          ),
                                        );
                                      },
                                      style: TextButton.styleFrom(
                                        padding:
                                            const EdgeInsets.symmetric(
                                                horizontal: 4,
                                                vertical: 8),
                                        minimumSize: Size.zero,
                                        tapTargetSize:
                                            MaterialTapTargetSize
                                                .shrinkWrap,
                                      ),
                                      child: const Text(
                                        'Forgot password?',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: AppColors.gray600,
                                        ),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  SizedBox(
                                    width: double.infinity,
                                    height: 52,
                                    child: ElevatedButton(
                                      onPressed:
                                          auth.isLoading ? null : _login,
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppColors.primary,
                                        foregroundColor: Colors.white,
                                        elevation: 0,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(14),
                                        ),
                                      ),
                                      child: auth.isLoading
                                          ? const SizedBox(
                                              width: 22,
                                              height: 22,
                                              child:
                                                  CircularProgressIndicator(
                                                strokeWidth: 2,
                                                color: Colors.white,
                                              ),
                                            )
                                          : const Text(
                                              'Sign in',
                                              style: TextStyle(
                                                fontSize: 15.5,
                                                fontWeight:
                                                    FontWeight.w700,
                                              ),
                                            ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 22),
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.verified_user_outlined,
                            size: 18,
                            color: AppColors.gray500,
                          ),
                          SizedBox(width: 8),
                          Text(
                            'Secure access for your team',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppColors.gray500,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 32),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _blurredBlob(double size, Color color) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withOpacity(0.55),
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.8),
            blurRadius: 80,
            spreadRadius: 20,
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13.5,
        fontWeight: FontWeight.w700,
        color: AppColors.dark,
      ),
    );
  }
}

/// Simple olive-branch: a curved stem with alternating elliptical leaves.
class _LeafBranchPainter extends CustomPainter {
  const _LeafBranchPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final stemPaint = Paint()
      ..color = const Color(0xFF7C9259)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final leafPaint = Paint()..color = const Color(0xFF8FA36B);

    final stem = Path()
      ..moveTo(w * 0.05, h * 0.95)
      ..quadraticBezierTo(w * 0.45, h * 0.55, w * 0.95, h * 0.08);
    canvas.drawPath(stem, stemPaint);

    const leaves = [
      [0.22, 0.80, -0.9, 30.0, 12.0],
      [0.30, 0.66, 0.5, 30.0, 12.0],
      [0.44, 0.56, -0.9, 32.0, 13.0],
      [0.55, 0.44, 0.5, 32.0, 13.0],
      [0.68, 0.33, -0.9, 30.0, 12.0],
      [0.78, 0.24, 0.5, 28.0, 11.0],
      [0.90, 0.13, -0.8, 26.0, 10.0],
    ];

    for (final leaf in leaves) {
      canvas.save();
      canvas.translate(w * leaf[0], h * leaf[1]);
      canvas.rotate(leaf[2]);
      canvas.drawOval(
        Rect.fromCenter(
          center: Offset.zero,
          width: leaf[3],
          height: leaf[4],
        ),
        leafPaint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
