class AppUpdate {
  final String id;
  final String platform;
  final bool enabled;
  final String version;
  final String downloadUrl;
  final String? releaseNotes;
  final DateTime createdAt;
  final DateTime? updatedAt;

  AppUpdate({
    required this.id,
    required this.platform,
    required this.enabled,
    required this.version,
    required this.downloadUrl,
    this.releaseNotes,
    required this.createdAt,
    this.updatedAt,
  });

  factory AppUpdate.fromJson(Map<String, dynamic> json) {
    return AppUpdate(
      id: json['id'] ?? '',
      platform: json['platform'] ?? 'mobile',
      enabled: json['enabled'] ?? false,
      version: json['version'] ?? '',
      downloadUrl: json['downloadUrl'] ?? json['download_url'] ?? '',
      releaseNotes: json['releaseNotes'] ?? json['release_notes'],
      createdAt: DateTime.parse(json['createdAt'] ?? json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: json['updatedAt'] != null || json['updated_at'] != null
          ? DateTime.parse(json['updatedAt'] ?? json['updated_at']!)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'platform': platform,
      'enabled': enabled,
      'version': version,
      'downloadUrl': downloadUrl,
      'releaseNotes': releaseNotes,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt?.toIso8601String(),
    };
  }
}
