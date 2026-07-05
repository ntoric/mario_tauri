import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../utils/constants.dart';

class SupportScreen extends StatelessWidget {
  final String email;
  final String phone;
  final String whatsappLink;
  final String storeName;
  final String? storeBranch;

  const SupportScreen({
    super.key,
    required this.email,
    required this.phone,
    required this.whatsappLink,
    required this.storeName,
    this.storeBranch,
  });

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      print('Could not launch $url');
    }
  }

  Future<void> _launchEmail() async {
    final uri = Uri.parse('mailto:$email');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      print('Could not launch email client');
    }
  }

  Future<void> _launchPhone() async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      print('Could not launch phone dialer');
    }
  }

  Future<void> _launchWhatsApp() async {
    // Try to extract phone number from the link and use whatsapp:// scheme for better Android support
    String whatsappUrl = whatsappLink;
    
    // If the link is https://wa.me/ format, convert to whatsapp:// scheme for Android
    if (whatsappLink.startsWith('https://wa.me/')) {
      final phoneNumber = whatsappLink.replaceFirst('https://wa.me/', '');
      whatsappUrl = 'whatsapp://send?phone=$phoneNumber';
    }
    
    final uri = Uri.parse(whatsappUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      // Fallback to original link if whatsapp:// scheme fails
      final fallbackUri = Uri.parse(whatsappLink);
      if (await canLaunchUrl(fallbackUri)) {
        await launchUrl(fallbackUri, mode: LaunchMode.externalApplication);
      } else {
        print('Could not launch WhatsApp: $whatsappLink');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.darker, AppColors.secondary],
          ),
        ),
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 480),
              decoration: BoxDecoration(
                color: AppColors.light,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.2),
                    blurRadius: 20,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Icon
                  Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: AppColors.danger.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.support_agent,
                      size: 40,
                      color: AppColors.danger,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Store Name
                  Text(
                    storeBranch != null ? '$storeName - $storeBranch' : storeName,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w600,
                      color: AppColors.gray600,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),

                  // Title
                  const Text(
                    'Store Disabled',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: AppColors.dark,
                    ),
                  ),
                  const SizedBox(height: 8),

                  // Subtitle
                  const Text(
                    'Your store is currently disabled. Please contact support for assistance.',
                    style: TextStyle(
                      fontSize: 16,
                      color: AppColors.gray600,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),

                  // Email
                  if (email.isNotEmpty) ...[
                    _ContactCard(
                      icon: Icons.email,
                      title: 'Email Support',
                      value: email,
                      onTap: _launchEmail,
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Phone
                  if (phone.isNotEmpty) ...[
                    _ContactCard(
                      icon: Icons.phone,
                      title: 'Call Support',
                      value: phone,
                      onTap: _launchPhone,
                    ),
                    const SizedBox(height: 16),
                  ],

                  // WhatsApp
                  if (whatsappLink.isNotEmpty) ...[
                    _ContactCard(
                      icon: Icons.chat,
                      title: 'WhatsApp Support',
                      value: 'Chat with us',
                      onTap: _launchWhatsApp,
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Logout button
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: OutlinedButton(
                      onPressed: () {
                        final auth = Provider.of<AuthProvider>(context, listen: false);
                        auth.logout();
                      },
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.danger,
                        side: const BorderSide(color: AppColors.danger),
                      ),
                      child: const Text('Sign Out'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;
  final VoidCallback onTap;

  const _ContactCard({
    required this.icon,
    required this.title,
    required this.value,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.gray100,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.gray200),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                icon,
                color: AppColors.primary,
                size: 24,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      color: AppColors.gray500,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    value,
                    style: const TextStyle(
                      fontSize: 16,
                      color: AppColors.dark,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.arrow_forward_ios,
              size: 16,
              color: AppColors.gray400,
            ),
          ],
        ),
      ),
    );
  }
}
