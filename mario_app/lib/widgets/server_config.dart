import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/discovery_service.dart';
import '../utils/constants.dart';

/// Footer tile on the login screen showing the current POS server
/// and opening the configuration dialog.
class ServerConfigTile extends StatelessWidget {
  const ServerConfigTile({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final connected = auth.isBackendConnected;

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => showDialog(
        context: context,
        builder: (_) => const ServerConfigDialog(),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              connected ? Icons.wifi : Icons.wifi_off,
              size: 16,
              color: connected ? AppColors.success : AppColors.gray500,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                'Server: ${_displayHost(auth.baseUrl)}',
                style: TextStyle(
                  fontSize: 13,
                  color: AppColors.gray600,
                  fontWeight: FontWeight.w500,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            const Icon(Icons.edit_outlined, size: 15, color: AppColors.gray500),
          ],
        ),
      ),
    );
  }

  static String _displayHost(String baseUrl) {
    try {
      final uri = Uri.parse(baseUrl);
      if (uri.host.isEmpty) return baseUrl;
      return uri.hasPort ? '${uri.host}:${uri.port}' : uri.host;
    } catch (_) {
      return baseUrl;
    }
  }
}

/// Dialog to find and connect to a Mario POS host on the local network,
/// or enter one manually.
class ServerConfigDialog extends StatefulWidget {
  const ServerConfigDialog({super.key});

  @override
  State<ServerConfigDialog> createState() => _ServerConfigDialogState();
}

class _ServerConfigDialogState extends State<ServerConfigDialog> {
  final _hostController = TextEditingController();
  bool _scanning = false;
  bool _connecting = false;
  List<DiscoveredServer> _servers = const [];
  String? _message;
  bool _messageIsError = false;

  @override
  void dispose() {
    _hostController.dispose();
    super.dispose();
  }

  /// Accepts "192.168.1.10", "192.168.1.10:8088", or a full URL and
  /// normalizes it to "http://host:port/api".
  static String? normalizeApiUrl(String input) {
    var s = input.trim();
    if (s.isEmpty) return null;
    if (!s.startsWith('http://') && !s.startsWith('https://')) {
      s = 'http://$s';
    }
    final uri = Uri.tryParse(s);
    if (uri == null || uri.host.isEmpty) return null;
    final port = uri.hasPort ? uri.port : 8088;
    return 'http://${uri.host}:$port/api';
  }

  Future<void> _scan() async {
    setState(() {
      _scanning = true;
      _message = null;
    });
    final servers = await DiscoveryService.scan();
    if (!mounted) return;
    setState(() {
      _scanning = false;
      _servers = servers;
      if (servers.isEmpty) {
        _message = 'No POS server found on this network.\n'
            'Make sure the desktop app is running and both devices '
            'are on the same Wi-Fi.';
        _messageIsError = true;
      }
    });
  }

  Future<void> _connect(String apiUrl) async {
    setState(() {
      _connecting = true;
      _message = null;
    });
    final auth = context.read<AuthProvider>();
    final ok = await auth.connectBackend(apiUrl);
    if (!mounted) return;
    setState(() {
      _connecting = false;
      _message = ok
          ? 'Connected to server.'
          : 'Could not reach the server. Check the address and try again.';
      _messageIsError = !ok;
    });
    if (ok) {
      await Future.delayed(const Duration(milliseconds: 600));
      if (mounted) Navigator.of(context).pop();
    }
  }

  Future<void> _connectManual() async {
    final url = normalizeApiUrl(_hostController.text);
    if (url == null) {
      setState(() {
        _message = 'Enter a valid host, e.g. 192.168.1.10 or 192.168.1.10:8088';
        _messageIsError = true;
      });
      return;
    }
    await _connect(url);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('POS Server'),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Connect to the computer running the Mario POS desktop app. '
              'Both devices must be on the same Wi-Fi network.',
              style: TextStyle(fontSize: 13, color: AppColors.gray600),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _scanning || _connecting ? null : _scan,
              icon: _scanning
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.search),
              label: Text(_scanning ? 'Scanning…' : 'Find on this network'),
            ),
            if (_servers.isNotEmpty) ...[
              const SizedBox(height: 12),
              for (final s in _servers)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.dns_outlined),
                  title: Row(
                    children: [
                      Flexible(child: Text(s.name)),
                      if (s.serverId != null &&
                          s.serverId ==
                              context.read<AuthProvider>().backend.lastServerId) ...[
                        const SizedBox(width: 8),
                        Text(
                          'Last used',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.success,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ],
                  ),
                  subtitle: Text('${s.address}:${s.port}'),
                  onTap: _connecting ? null : () => _connect(s.apiUrl),
                ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: Divider(color: AppColors.gray300)),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text('or',
                      style:
                          TextStyle(fontSize: 12, color: AppColors.gray500)),
                ),
                Expanded(child: Divider(color: AppColors.gray300)),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _hostController,
              decoration: const InputDecoration(
                labelText: 'Server address',
                hintText: '192.168.1.10 or 192.168.1.10:8088',
                prefixIcon: Icon(Icons.computer_outlined),
                isDense: true,
              ),
              keyboardType: TextInputType.url,
              onSubmitted: (_) => _connectManual(),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _connecting ? null : _connectManual,
              child: _connecting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Connect'),
            ),
            if (_message != null) ...[
              const SizedBox(height: 12),
              Text(
                _message!,
                style: TextStyle(
                  fontSize: 13,
                  color: _messageIsError ? AppColors.danger : AppColors.success,
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
