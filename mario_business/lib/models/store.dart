import 'json.dart';

class Store {
  final String id;
  final String name;
  final String branch;
  final String location;
  final String phone;
  final String secondaryPhone;
  final String gstin;
  final String fssaiNo;
  final String logoUrl;
  final bool taxEnabled;
  final bool pricesIncludeTax;
  final double defaultTaxPercent;
  final String gstRegistrationType;
  final bool isActive;
  final int dataRetentionDays;
  final DateTime? createdAt;

  const Store({
    required this.id,
    required this.name,
    this.branch = '',
    this.location = '',
    this.phone = '',
    this.secondaryPhone = '',
    this.gstin = '',
    this.fssaiNo = '',
    this.logoUrl = '',
    this.taxEnabled = false,
    this.pricesIncludeTax = false,
    this.defaultTaxPercent = 0,
    this.gstRegistrationType = '',
    this.isActive = true,
    this.dataRetentionDays = 0,
    this.createdAt,
  });

  factory Store.fromJson(Json j) => Store(
        id: jStr(j, 'id'),
        name: jStr(j, 'name', 'Store'),
        branch: jStr(j, 'branch'),
        location: jStr(j, 'location'),
        phone: jStr(j, 'phone'),
        secondaryPhone: jStr(j, 'secondaryPhone'),
        gstin: jStr(j, 'gstin'),
        fssaiNo: jStr(j, 'fssaiNo'),
        logoUrl: jStr(j, 'logoUrl'),
        taxEnabled: jBool(j, 'taxEnabled'),
        pricesIncludeTax: jBool(j, 'pricesIncludeTax'),
        defaultTaxPercent: jNum(j, 'defaultTaxPercent'),
        gstRegistrationType: jStr(j, 'gstRegistrationType'),
        isActive: jBool(j, 'isActive', true),
        dataRetentionDays: jInt(j, 'dataRetentionDays'),
        createdAt: jDate(j, 'createdAt'),
      );

  String get displayName => branch.isNotEmpty ? '$name · $branch' : name;

  bool get hasGst => gstin.isNotEmpty;
}
