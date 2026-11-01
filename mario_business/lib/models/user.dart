import 'json.dart';
import 'store.dart';

class AppUser {
  final String id;
  final String username;
  final String name;
  final String email;
  final String role;
  final List<Store> stores;

  const AppUser({
    required this.id,
    required this.username,
    required this.name,
    required this.email,
    required this.role,
    required this.stores,
  });

  factory AppUser.fromJson(Json j) => AppUser(
        id: jStr(j, 'id'),
        username: jStr(j, 'username'),
        name: jStr(j, 'name'),
        email: jStr(j, 'email'),
        role: jStr(j, 'role'),
        stores: jList(j, 'stores', Store.fromJson),
      );

  String get displayName => name.isNotEmpty ? name : username;
}

/// A staff/admin account visible to the owner (read-only).
class StaffUser {
  final String id;
  final String username;
  final String name;
  final String role;
  final String storeId;
  final List<String> storeIds;
  final bool isActive;

  const StaffUser({
    required this.id,
    required this.username,
    required this.name,
    required this.role,
    required this.storeId,
    required this.storeIds,
    required this.isActive,
  });

  factory StaffUser.fromJson(Json j) => StaffUser(
        id: jStr(j, 'id'),
        username: jStr(j, 'username'),
        name: jStr(j, 'name'),
        role: jStr(j, 'role'),
        storeId: jStr(j, 'storeId'),
        storeIds: (j['storeIds'] is List) ? (j['storeIds'] as List).map((e) => e.toString()).toList() : const [],
        isActive: jBool(j, 'isActive', true),
      );

  String get displayName => name.isNotEmpty ? name : username;

  bool worksAt(String store) => storeId == store || storeIds.contains(store);
}
