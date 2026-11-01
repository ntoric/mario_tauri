import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mario_business/core/api_client.dart';
import 'package:mario_business/data/owner_repository.dart';
import 'package:mario_business/state/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _url = 'https://example.test/api';


Map<String, dynamic> _user(String role) => {
      'id': 'u1',
      'username': 'owner',
      'name': 'Owner',
      'email': '',
      'role': role,
      'stores': [
        {'id': 's1', 'name': 'Store One', 'isActive': true},
      ],
    };

Future<Session> _session(http.Client client, {Map<String, String> saved = const {}}) async {
  SharedPreferences.setMockInitialValues({});
  FlutterSecureStorage.setMockInitialValues(Map.of(saved));
  final prefs = await SharedPreferences.getInstance();
  return Session(prefs, OwnerRepository(ApiClient(baseUrl: _url, client: client)));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const saved = {'session_token': 'tok', 'session_token_url': _url};

  test('no saved token goes to sign in without calling the server', () async {
    var calls = 0;
    final s = await _session(MockClient((_) async {
      calls++;
      return http.Response('{}', 200);
    }));
    await s.restore();
    expect(s.status, AuthStatus.signedOut);
    expect(calls, 0);
  });

  test('valid saved token resumes the session', () async {
    String? auth;
    final s = await _session(MockClient((req) async {
      auth = req.headers['Authorization'];
      return http.Response(jsonEncode(_user('business_owner')), 200);
    }), saved: saved);
    await s.restore();
    expect(auth, 'Bearer tok');
    expect(s.status, AuthStatus.signedIn);
    expect(s.store?.id, 's1');
  });

  test('expired token is cleared and the user is told why', () async {
    final s = await _session(MockClient((_) async => http.Response('{"error":"Invalid or expired session"}', 401)), saved: saved);
    await s.restore();
    expect(s.status, AuthStatus.signedOut);
    expect(s.takeNotice(), contains('expired'));
    expect(await const FlutterSecureStorage().read(key: 'session_token'), isNull);
  });

  test('network failure keeps the token for retry', () async {
    final s = await _session(MockClient((_) async => throw const SocketException('down')), saved: saved);
    await s.restore();
    expect(s.status, AuthStatus.offline);
    expect(await const FlutterSecureStorage().read(key: 'session_token'), 'tok');
  });

  test('token from a different server is ignored', () async {
    var calls = 0;
    final s = await _session(MockClient((_) async {
      calls++;
      return http.Response('{}', 200);
    }), saved: {'session_token': 'tok', 'session_token_url': 'https://other.test/api'});
    await s.restore();
    expect(s.status, AuthStatus.signedOut);
    expect(calls, 0);
  });

  test('non-owner saved session is signed out', () async {
    final s = await _session(MockClient((req) async {
      if (req.url.path.endsWith('/auth/me')) return http.Response(jsonEncode(_user('staff')), 200);
      return http.Response('{}', 200);
    }), saved: saved);
    await s.restore();
    expect(s.status, AuthStatus.signedOut);
    expect(await const FlutterSecureStorage().read(key: 'session_token'), isNull);
  });

  test('sign in saves the token and sign out removes it', () async {
    final s = await _session(MockClient((req) async {
      if (req.url.path.endsWith('/auth/login')) {
        return http.Response(jsonEncode({'token': 'new', 'user': _user('business_owner')}), 200);
      }
      return http.Response('{}', 200);
    }));
    await s.restore();
    await s.signIn('owner', 'pw');
    expect(await const FlutterSecureStorage().read(key: 'session_token'), 'new');
    await s.signOut();
    expect(s.status, AuthStatus.signedOut);
    expect(await const FlutterSecureStorage().read(key: 'session_token'), isNull);
  });

  test('assigned stores show even though the server omits isActive', () async {
    // GetUserStores returns only id/name/branch, so isActive arrives as false.
    final s = await _session(MockClient((req) async {
      if (req.url.path.endsWith('/auth/me')) {
        return http.Response(jsonEncode({
          ..._user('business_owner'),
          'stores': [
            {'id': 's1', 'name': 'Cafe', 'branch': 'MG Road', 'isActive': false},
            {'id': 's2', 'name': 'Cafe', 'branch': 'Kochi', 'isActive': false},
          ],
        }), 200);
      }
      if (req.url.path.endsWith('/stores')) {
        return http.Response(jsonEncode([
          {'id': 's1', 'name': 'Cafe', 'branch': 'MG Road', 'gstin': '32ABC', 'isActive': true},
          {'id': 's9', 'name': 'Not mine', 'isActive': true},
        ]), 200);
      }
      return http.Response('{}', 200);
    }), saved: saved);
    await s.restore();
    expect(s.status, AuthStatus.signedIn);
    expect(s.stores.map((e) => e.id), ['s2', 's1']);
    await Future<void>.delayed(Duration.zero);
    expect(s.stores.map((e) => e.id).toSet(), {'s1', 's2'});
    expect(s.stores.firstWhere((e) => e.id == 's1').gstin, '32ABC');
  });
}
