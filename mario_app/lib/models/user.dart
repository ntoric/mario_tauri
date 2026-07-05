class User {
  final String id;
  final String username;
  final String name;
  final String? email;
  final String role;
  final String? storeId;
  final String? storeName;
  final List<Store>? stores;
  final bool isActive;

  User({
    required this.id,
    required this.username,
    required this.name,
    this.email,
    required this.role,
    this.storeId,
    this.storeName,
    this.stores,
    required this.isActive,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      username: json['username'],
      name: json['name'],
      email: json['email'],
      role: json['role'],
      storeId: json['storeId'],
      storeName: json['storeName'],
      stores: json['stores'] != null
          ? (json['stores'] as List).map((s) => Store.fromJson(s)).toList()
          : null,
      isActive: json['isActive'] ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'name': name,
      'email': email,
      'role': role,
      'storeId': storeId,
      'storeName': storeName,
      'stores': stores?.map((s) => s.toJson()).toList(),
      'isActive': isActive,
    };
  }

  bool get isSuperAdmin => role == 'superadmin';
  bool get isBusinessOwner => role == 'business_owner';
  bool get isBusinessAdmin => role == 'business_admin';
  bool get isStaff => role == 'staff';
  bool get canViewStats => isSuperAdmin || isBusinessOwner;
}

class Store {
  final String id;
  final String name;
  final String? branch;
  final String? location;
  final String? gstin;
  final String? fssaiNo;
  final String? phone;
  final String? logoUrl;
  final bool isActive;
  final bool remoteBillingEnabled;

  Store({
    required this.id,
    required this.name,
    this.branch,
    this.location,
    this.gstin,
    this.fssaiNo,
    this.phone,
    this.logoUrl,
    required this.isActive,
    this.remoteBillingEnabled = false,
  });

  factory Store.fromJson(Map<String, dynamic> json) {
    return Store(
      id: json['id'],
      name: json['name'],
      branch: json['branch'],
      location: json['location'],
      gstin: json['gstin'],
      fssaiNo: json['fssaiNo'] ?? json['fssai_no'],
      phone: json['phone'],
      logoUrl: json['logoUrl'] ?? json['logo_url'],
      isActive: json['isActive'] ?? json['is_active'] ?? true,
      remoteBillingEnabled: json['remoteBillingEnabled'] ?? json['remote_billing_enabled'] ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'branch': branch,
      'location': location,
      'gstin': gstin,
      'fssaiNo': fssaiNo,
      'phone': phone,
      'logoUrl': logoUrl,
      'isActive': isActive,
      'remoteBillingEnabled': remoteBillingEnabled,
    };
  }

  String get displayName => branch != null ? '$name - $branch' : name;
}