import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'config.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;

  const ApiException(this.message, {this.statusCode});

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;

  @override
  String toString() => message;
}

/// Thin JSON-over-HTTP client for the Mario backend.
///
/// Sessions live in Redis on the server; [token] is the opaque handle. The
/// app saves it in secure storage (see TokenStore) to stay signed in.
class ApiClient {
  ApiClient({String? baseUrl, http.Client? client})
      : _baseUrl = _normalize(baseUrl ?? AppConfig.defaultApiUrl),
        _http = client ?? http.Client();

  final http.Client _http;
  String _baseUrl;
  /// Bearer session token.
  String? token;

  /// Called when the server rejects the session so the app can sign out.
  void Function()? onUnauthorized;

  String get baseUrl => _baseUrl;
  set baseUrl(String value) => _baseUrl = _normalize(value);

  static String _normalize(String url) {
    var u = url.trim();
    while (u.endsWith('/')) {
      u = u.substring(0, u.length - 1);
    }
    if (!u.endsWith('/api')) u = '$u/api';
    return u;
  }

  Uri _uri(String path, [Map<String, String?>? query]) {
    final q = <String, String>{};
    query?.forEach((k, v) {
      if (v != null && v.isNotEmpty) q[k] = v;
    });
    return Uri.parse('$_baseUrl$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> get(String path, {Map<String, String?>? query}) =>
      _send(() => _http.get(_uri(path, query), headers: _headers));

  Future<dynamic> post(String path, {Object? body}) => _send(
      () => _http.post(_uri(path), headers: _headers, body: body == null ? null : jsonEncode(body)));

  Future<dynamic> _send(Future<http.Response> Function() request) async {
    http.Response res;
    try {
      res = await request().timeout(AppConfig.requestTimeout);
    } on TimeoutException {
      throw const ApiException('The server took too long to respond. Please try again.');
    } on SocketException {
      throw const ApiException('No connection. Check your internet and try again.');
    } on http.ClientException catch (e) {
      throw ApiException('Network error: ${e.message}');
    }

    dynamic body;
    if (res.body.isNotEmpty) {
      try {
        body = jsonDecode(res.body);
      } catch (_) {
        body = res.body;
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    final msg = body is Map && body['error'] != null
        ? body['error'].toString()
        : (body is String && body.trim().isNotEmpty ? body.trim() : 'Request failed (${res.statusCode})');
    if (res.statusCode == 401 && token != null) onUnauthorized?.call();
    throw ApiException(msg, statusCode: res.statusCode);
  }
}
