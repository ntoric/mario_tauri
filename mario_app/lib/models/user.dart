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
  final bool taxEnabled;
  final double defaultTaxPercent;
  // 'regular' | 'composition' | 'unregistered' — null on legacy backends.
  final String? gstRegistrationType;
  final String? stateCode;
  final bool pricesIncludeTax;
  final String? invoicePrefix;
  final String? defaultSacCode;

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
    this.taxEnabled = true,
    this.defaultTaxPercent = 0,
    this.gstRegistrationType,
    this.stateCode,
    this.pricesIncludeTax = false,
    this.invoicePrefix,
    this.defaultSacCode,
  });

  static double _parseDouble(dynamic val) {
    if (val == null) return 0.0;
    if (val is num) return val.toDouble();
    return double.tryParse(val.toString()) ?? 0.0;
  }

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
      remoteBillingEnabled: json['remoteBillingEnabled'] ??
          json['remote_billing_enabled'] ??
          false,
      taxEnabled: json['taxEnabled'] ?? json['tax_enabled'] ?? true,
      defaultTaxPercent: _parseDouble(
          json['defaultTaxPercent'] ?? json['default_tax_percent']),
      gstRegistrationType:
          (json['gstRegistrationType'] ?? json['gst_registration_type'])
              ?.toString(),
      stateCode: (json['stateCode'] ?? json['state_code'])?.toString(),
      pricesIncludeTax:
          json['pricesIncludeTax'] ?? json['prices_include_tax'] ?? false,
      invoicePrefix:
          (json['invoicePrefix'] ?? json['invoice_prefix'])?.toString(),
      defaultSacCode:
          (json['defaultSacCode'] ?? json['default_sac_code'])?.toString(),
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
      'taxEnabled': taxEnabled,
      'defaultTaxPercent': defaultTaxPercent,
      'gstRegistrationType': gstRegistrationType,
      'stateCode': stateCode,
      'pricesIncludeTax': pricesIncludeTax,
      'invoicePrefix': invoicePrefix,
      'defaultSacCode': defaultSacCode,
    };
  }

  String get displayName => branch != null ? '$name - $branch' : name;

  // Legacy backends don't send gstRegistrationType — treat them as regular
  // so tax keeps showing exactly as before.
  String get effectiveGstRegistrationType => gstRegistrationType ?? 'regular';

  // Whether this store charges GST on its own bills (composition/unregistered
  // dealers issue a bill of supply with no tax).
  bool get chargesGst =>
      taxEnabled && effectiveGstRegistrationType == 'regular';
}
