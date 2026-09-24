import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// A Mario POS host discovered on the local network.
class DiscoveredServer {
  final String address;
  final int port;
  final String name;
  final String? serverId;

  const DiscoveredServer({
    required this.address,
    required this.port,
    required this.name,
    this.serverId,
  });

  String get apiUrl => 'http://$address:$port/api';
}

/// Finds Mario POS hosts on the LAN via UDP broadcast.
/// The desktop (Tauri) app listens on udp/48484 and answers the
/// "MARIO_DISCOVER" probe with its API port.
class DiscoveryService {
  static const int discoveryPort = 48484;
  static const String _probe = 'MARIO_DISCOVER';

  /// Broadcasts a discovery probe and collects replies for [timeout].
  static Future<List<DiscoveredServer>> scan({
    Duration timeout = const Duration(seconds: 3),
  }) async {
    final found = <String, DiscoveredServer>{};
    RawDatagramSocket? socket;
    try {
      socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
      socket.broadcastEnabled = true;
    } catch (_) {
      return const [];
    }

    socket.listen((event) {
      if (event != RawSocketEvent.read) return;
      final dg = socket!.receive();
      if (dg == null) return;
      try {
        final data = jsonDecode(utf8.decode(dg.data));
        if (data is Map && data['type'] == 'mario_pos') {
          final ip = dg.address.address;
          found[ip] = DiscoveredServer(
            address: ip,
            port: (data['port'] as num?)?.toInt() ?? 8088,
            name: data['name']?.toString() ?? 'Mario POS',
            serverId: data['serverId']?.toString(),
          );
        }
      } catch (_) {
        // Ignore malformed replies.
      }
    });

    // Send the probe a few times for reliability on lossy Wi-Fi.
    final probe = utf8.encode(_probe);
    for (var i = 0; i < 3; i++) {
      socket.send(
        probe,
        InternetAddress('255.255.255.255'),
        discoveryPort,
      );
      if (i < 2) await Future.delayed(const Duration(milliseconds: 300));
    }

    await Future.delayed(timeout);
    socket.close();
    return found.values.toList();
  }
}
