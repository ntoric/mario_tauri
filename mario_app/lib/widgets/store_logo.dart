import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../models/user.dart';

/// Store logo (base64 data URL or remote URL) with the bundled brand logo
/// as fallback when the store has not set one.
class StoreLogo extends StatelessWidget {
  const StoreLogo(this.store, {super.key, this.fit = BoxFit.contain});

  final Store? store;
  final BoxFit fit;

  static final Map<String, Uint8List?> _decoded = {};

  static Uint8List? _bytes(String raw) {
    return _decoded.putIfAbsent(raw, () {
      try {
        final data =
            raw.contains(',') ? raw.substring(raw.indexOf(',') + 1) : raw;
        return base64Decode(data);
      } catch (_) {
        return null;
      }
    });
  }

  Widget _fallback() => Image.asset('assets/images/logo.png', fit: fit);

  @override
  Widget build(BuildContext context) {
    final logo = store?.logoUrl ?? '';
    if (logo.startsWith('http')) {
      return Image.network(logo,
          fit: fit, errorBuilder: (_, __, ___) => _fallback());
    }
    if (logo.isNotEmpty) {
      final bytes = _bytes(logo);
      if (bytes != null) {
        return Image.memory(bytes,
            fit: fit,
            gaplessPlayback: true,
            errorBuilder: (_, __, ___) => _fallback());
      }
    }
    return _fallback();
  }
}
