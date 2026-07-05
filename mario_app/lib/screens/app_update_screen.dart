import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:fluttertoast/fluttertoast.dart';
import '../providers/auth_provider.dart';
import '../providers/data_provider.dart';
import '../utils/constants.dart';
import '../widgets/app_header.dart';

class AppUpdateScreen extends StatefulWidget {
  const AppUpdateScreen({super.key});

  @override
  State<AppUpdateScreen> createState() => _AppUpdateScreenState();
}

class _AppUpdateScreenState extends State<AppUpdateScreen> {
  final _versionController = TextEditingController();
  final _downloadUrlController = TextEditingController();
  final _releaseNotesController = TextEditingController();
  bool _enabled = false;
  bool _isLoading = false;
  bool _isSaving = false;
  String _platform = 'mobile';

  @override
  void initState() {
    super.initState();
    _loadAppUpdate();
  }

  @override
  void dispose() {
    _versionController.dispose();
    _downloadUrlController.dispose();
    _releaseNotesController.dispose();
    super.dispose();
  }

  Future<void> _loadAppUpdate() async {
    setState(() => _isLoading = true);
    final data = context.read<DataProvider>();
    await data.loadAppUpdate(platform: _platform);
    
    if (mounted) {
      final appUpdate = data.appUpdate;
      if (appUpdate != null) {
        setState(() {
          _enabled = appUpdate.enabled;
          _versionController.text = appUpdate.version;
          _downloadUrlController.text = appUpdate.downloadUrl;
          _releaseNotesController.text = appUpdate.releaseNotes ?? '';
        });
      } else {
        // Clear fields if no update exists for this platform
        setState(() {
          _enabled = false;
          _versionController.clear();
          _downloadUrlController.clear();
          _releaseNotesController.clear();
        });
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveAppUpdate() async {
    if (_versionController.text.trim().isEmpty) {
      _showFeedback('Version is required', isError: true);
      return;
    }

    if (_downloadUrlController.text.trim().isEmpty) {
      _showFeedback('Download URL is required', isError: true);
      return;
    }

    setState(() => _isSaving = true);

    final data = context.read<DataProvider>();
    final result = await data.updateAppUpdate(
      platform: _platform,
      enabled: _enabled,
      version: _versionController.text.trim(),
      downloadUrl: _downloadUrlController.text.trim(),
      releaseNotes: _releaseNotesController.text.trim().isEmpty 
          ? null 
          : _releaseNotesController.text.trim(),
    );

    setState(() => _isSaving = false);

    if (result != null) {
      _showFeedback('App update configuration saved successfully');
    } else {
      _showFeedback(data.error ?? 'Failed to save app update configuration', isError: true);
    }
  }

  void _showFeedback(String message, {bool isError = false}) {
    Fluttertoast.showToast(
      msg: message,
      toastLength: Toast.LENGTH_SHORT,
      gravity: ToastGravity.BOTTOM,
      backgroundColor: isError ? AppColors.danger : AppColors.success,
      textColor: Colors.white,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    
    // Check if user is superadmin
    if (!(auth.user?.isSuperAdmin ?? false)) {
      return Scaffold(
        appBar: const AppHeader(
          title: 'App Update Management',
        ),
        body: const Center(
          child: Text(
            'Access Denied. Superadmin role required.',
            style: TextStyle(fontSize: 16, color: AppColors.gray600),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: const AppHeader(
        title: 'App Update Management',
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Platform',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: RadioListTile<String>(
                                  title: const Text('Mobile'),
                                  value: 'mobile',
                                  groupValue: _platform,
                                  onChanged: (value) {
                                    if (value != null) {
                                      setState(() => _platform = value);
                                      _loadAppUpdate();
                                    }
                                  },
                                  activeColor: AppColors.primary,
                                ),
                              ),
                              Expanded(
                                child: RadioListTile<String>(
                                  title: const Text('Desktop'),
                                  value: 'desktop',
                                  groupValue: _platform,
                                  onChanged: (value) {
                                    if (value != null) {
                                      setState(() => _platform = value);
                                      _loadAppUpdate();
                                    }
                                  },
                                  activeColor: AppColors.primary,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Switch(
                                value: _enabled,
                                onChanged: (value) {
                                  setState(() => _enabled = value);
                                },
                                activeColor: AppColors.primary,
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Enable Update Notification',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _enabled
                                ? 'Users will see a download link in settings when enabled'
                                : 'Update notification is currently disabled',
                            style: TextStyle(
                              fontSize: 14,
                              color: _enabled ? AppColors.success : AppColors.gray600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Update Details',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          TextField(
                            controller: _versionController,
                            decoration: const InputDecoration(
                              labelText: 'Version',
                              hintText: 'e.g. 1.2.0',
                              prefixIcon: Icon(Icons.tag),
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _downloadUrlController,
                            decoration: const InputDecoration(
                              labelText: 'Download URL',
                              hintText: 'e.g. https://example.com/app.apk',
                              prefixIcon: Icon(Icons.link),
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _releaseNotesController,
                            maxLines: 4,
                            decoration: const InputDecoration(
                              labelText: 'Release Notes (optional)',
                              hintText: 'Describe what\'s new in this version...',
                              prefixIcon: Icon(Icons.description),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isSaving ? null : _saveAppUpdate,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                      ),
                      child: _isSaving
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              'Save Configuration',
                              style: TextStyle(color: Colors.white),
                            ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
