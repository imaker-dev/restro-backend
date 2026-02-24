# App Update API Documentation

This document provides complete API documentation for the App Update feature, including all endpoints, payloads, responses, and integration guides for both backend and frontend applications.

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [Public Endpoints](#public-endpoints)
4. [Admin Endpoints](#admin-endpoints)
5. [Backend Integration](#backend-integration)
6. [Frontend/Application Integration](#frontendapplication-integration)
7. [Version Comparison Logic](#version-comparison-logic)
8. [Error Handling](#error-handling)

---

## Overview

The App Update API allows:
- **Applications** to check for available updates
- **Admins** to manage app version releases

### Base URL
```
{{baseUrl}}/api/v1/app
```

### Authentication
| Endpoint Type | Authentication |
|---------------|----------------|
| Public (`/version`, `/version/checksum`) | None required |
| Admin (`/versions/*`) | Bearer Token + `super_admin` or `admin` role |

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/version` | Public | Get latest version for update checks |
| GET | `/version/checksum` | Public | Get checksum for file integrity |
| GET | `/versions` | Admin | List all versions |
| GET | `/versions/:id` | Admin | Get version by ID |
| POST | `/versions` | Admin | Create new version |
| PUT | `/versions/:id` | Admin | Update version |
| DELETE | `/versions/:id` | Admin | Delete version |

---

## Public Endpoints

### 1. Check for Updates

**Endpoint:** `GET /api/v1/app/version`

**Purpose:** Returns the latest app version information for update checks.

#### Request

```http
GET /api/v1/app/version HTTP/1.1
Host: api.example.com
Accept: application/json
```

#### Optional Headers (for enhanced update logic)

| Header | Type | Description |
|--------|------|-------------|
| `X-App-Version` | string | Current app version (e.g., `1.0.0`) |
| `X-Platform` | string | Platform: `android`, `ios`, `windows`, `macos`, `linux` |

#### Optional Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `channel` | string | `stable` | Release channel: `stable`, `beta`, `alpha` |
| `version` | string | - | Current app version (alternative to header) |
| `platform` | string | - | Platform (alternative to header) |

#### Response (200 OK) - Basic

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "version": "1.1.0",
    "build": 12,
    "force_update": false,
    "release_notes": "- Bug fixes\n- Performance improvements",
    "release_date": "2026-02-24T06:30:00.000Z",
    "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
    "ios_url": "https://apps.apple.com/app/id123456789",
    "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.1.0.exe",
    "mac_url": "https://cdn.company.com/restropos/macos/RestroPOS_1.1.0.dmg",
    "linux_url": "https://cdn.company.com/restropos/linux/RestroPOS_1.1.0.AppImage",
    "android": {
      "store": "play_store",
      "url": "https://play.google.com/store/apps/details?id=com.company.restropos",
      "min_supported_version": "1.0.0",
      "sha256": null
    },
    "ios": {
      "store": "app_store",
      "url": "https://apps.apple.com/app/id123456789",
      "min_supported_version": "1.0.0",
      "sha256": null
    },
    "windows": {
      "type": "inno_setup",
      "url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.1.0.exe",
      "min_supported_version": "1.0.0",
      "sha256": "abc123..."
    },
    "macos": {
      "type": "dmg",
      "url": "https://cdn.company.com/restropos/macos/RestroPOS_1.1.0.dmg",
      "min_supported_version": "1.0.0",
      "sha256": null
    },
    "linux": {
      "type": "appimage",
      "url": "https://cdn.company.com/restropos/linux/RestroPOS_1.1.0.AppImage",
      "min_supported_version": "1.0.0",
      "sha256": null
    }
  }
}
```

#### Response (200 OK) - With Version Check

When `X-App-Version` header or `version` query param is provided:

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "update_available": true,
    "force_update": false,
    "current_version": "1.0.0",
    "latest_version": "1.1.0",
    "version": "1.1.0",
    "build": 12,
    "release_notes": "- Bug fixes\n- Performance improvements",
    "release_date": "2026-02-24T06:30:00.000Z",
    "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
    "ios_url": "https://apps.apple.com/app/id123456789",
    "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.1.0.exe",
    "mac_url": "https://cdn.company.com/restropos/macos/RestroPOS_1.1.0.dmg",
    "linux_url": "https://cdn.company.com/restropos/linux/RestroPOS_1.1.0.AppImage"
  }
}
```

#### Response (404 Not Found)

```json
{
  "success": false,
  "message": "No version information available"
}
```

---

### 2. Get Checksum

**Endpoint:** `GET /api/v1/app/version/checksum`

**Purpose:** Get SHA256 checksum for verifying downloaded file integrity.

#### Request

```http
GET /api/v1/app/version/checksum?platform=windows&version=1.1.0 HTTP/1.1
Host: api.example.com
Accept: application/json
```

#### Query Parameters (Required)

| Parameter | Type | Description |
|-----------|------|-------------|
| `platform` | string | `android`, `ios`, `windows`, `mac`, `linux` |
| `version` | string | Version to get checksum for (e.g., `1.1.0`) |

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.1.0.exe"
  }
}
```

#### Response (400 Bad Request)

```json
{
  "success": false,
  "message": "Platform and version are required"
}
```

#### Response (404 Not Found)

```json
{
  "success": false,
  "message": "Version not found"
}
```

---

## Admin Endpoints

### 3. List All Versions

**Endpoint:** `GET /api/v1/app/versions`

**Authentication:** Bearer Token (super_admin, admin)

#### Request

```http
GET /api/v1/app/versions?channel=stable&limit=20&offset=0 HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>
Accept: application/json
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `channel` | string | - | Filter by channel: `stable`, `beta`, `alpha` |
| `limit` | number | 20 | Results per page |
| `offset` | number | 0 | Offset for pagination |

#### Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "version": "1.1.0",
      "build": 12,
      "force_update": false,
      "release_notes": "Bug fixes",
      "released_at": "2026-02-24T06:30:00.000Z",
      "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
      "ios_url": "https://apps.apple.com/app/id123456789",
      "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.1.0.exe",
      "mac_url": null,
      "linux_url": null,
      "is_active": true,
      "channel": "stable",
      "created_at": "2026-02-24T06:30:00.000Z",
      "updated_at": "2026-02-24T06:30:00.000Z"
    },
    {
      "id": 1,
      "version": "1.0.0",
      "build": 1,
      "force_update": false,
      "release_notes": "Initial release",
      "released_at": "2026-02-20T00:00:00.000Z",
      "android_url": null,
      "ios_url": null,
      "windows_url": null,
      "mac_url": null,
      "linux_url": null,
      "is_active": false,
      "channel": "stable",
      "created_at": "2026-02-20T00:00:00.000Z",
      "updated_at": "2026-02-24T06:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

---

### 4. Get Version by ID

**Endpoint:** `GET /api/v1/app/versions/:id`

**Authentication:** Bearer Token (super_admin, admin)

#### Request

```http
GET /api/v1/app/versions/2 HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>
Accept: application/json
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": 2,
    "version": "1.1.0",
    "build": 12,
    "force_update": false,
    "release_notes": "- Bug fixes\n- Performance improvements",
    "released_at": "2026-02-24T06:30:00.000Z",
    "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
    "ios_url": "https://apps.apple.com/app/id123456789",
    "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.1.0.exe",
    "mac_url": "https://cdn.company.com/restropos/macos/RestroPOS_1.1.0.dmg",
    "linux_url": "https://cdn.company.com/restropos/linux/RestroPOS_1.1.0.AppImage",
    "android_min_version": "1.0.0",
    "ios_min_version": "1.0.0",
    "windows_min_version": "1.0.0",
    "mac_min_version": null,
    "linux_min_version": null,
    "android_sha256": null,
    "ios_sha256": null,
    "windows_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "mac_sha256": null,
    "linux_sha256": null,
    "is_active": true,
    "channel": "stable",
    "created_by": 1,
    "created_at": "2026-02-24T06:30:00.000Z",
    "updated_at": "2026-02-24T06:30:00.000Z"
  }
}
```

#### Response (404 Not Found)

```json
{
  "success": false,
  "message": "Version not found"
}
```

---

### 5. Create New Version

**Endpoint:** `POST /api/v1/app/versions`

**Authentication:** Bearer Token (super_admin, admin)

#### Request

```http
POST /api/v1/app/versions HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
```

#### Request Body

```json
{
  "version": "1.2.0",
  "build": 15,
  "force_update": false,
  "release_notes": "## What's New\n- New feature A\n- Bug fix B\n- Performance improvement C",
  "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
  "ios_url": "https://apps.apple.com/app/id123456789",
  "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.2.0.exe",
  "mac_url": "https://cdn.company.com/restropos/macos/RestroPOS_1.2.0.dmg",
  "linux_url": "https://cdn.company.com/restropos/linux/RestroPOS_1.2.0.AppImage",
  "android_min_version": "1.0.0",
  "ios_min_version": "1.0.0",
  "windows_min_version": "1.0.0",
  "mac_min_version": null,
  "linux_min_version": null,
  "windows_sha256": "abc123...",
  "is_active": true,
  "channel": "stable"
}
```

#### Request Body Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Semantic version (e.g., `1.2.0`) |
| `build` | number | No | Build number |
| `force_update` | boolean | No | If true, users must update |
| `release_notes` | string | No | Changelog/release notes (supports markdown) |
| `android_url` | string | No | Play Store or APK URL |
| `ios_url` | string | No | App Store URL |
| `windows_url` | string | No | Windows installer URL |
| `mac_url` | string | No | macOS DMG URL |
| `linux_url` | string | No | Linux AppImage URL |
| `android_min_version` | string | No | Min supported Android version |
| `ios_min_version` | string | No | Min supported iOS version |
| `windows_min_version` | string | No | Min supported Windows version |
| `mac_min_version` | string | No | Min supported macOS version |
| `linux_min_version` | string | No | Min supported Linux version |
| `android_sha256` | string | No | SHA256 checksum for Android |
| `ios_sha256` | string | No | SHA256 checksum for iOS |
| `windows_sha256` | string | No | SHA256 checksum for Windows |
| `mac_sha256` | string | No | SHA256 checksum for macOS |
| `linux_sha256` | string | No | SHA256 checksum for Linux |
| `is_active` | boolean | No | If true, this becomes the active version (default: true) |
| `channel` | string | No | Release channel: `stable`, `beta`, `alpha` (default: `stable`) |

#### Response (201 Created)

```json
{
  "success": true,
  "message": "Version created successfully",
  "data": {
    "id": 3,
    "version": "1.2.0",
    "build": 15,
    "force_update": false,
    "release_notes": "## What's New\n- New feature A\n- Bug fix B",
    "released_at": "2026-02-24T07:00:00.000Z",
    "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
    "ios_url": "https://apps.apple.com/app/id123456789",
    "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.2.0.exe",
    "mac_url": "https://cdn.company.com/restropos/macos/RestroPOS_1.2.0.dmg",
    "linux_url": "https://cdn.company.com/restropos/linux/RestroPOS_1.2.0.AppImage",
    "is_active": true,
    "channel": "stable",
    "created_by": 1,
    "created_at": "2026-02-24T07:00:00.000Z",
    "updated_at": "2026-02-24T07:00:00.000Z"
  }
}
```

#### Response (400 Bad Request)

```json
{
  "success": false,
  "message": "Version is required"
}
```

```json
{
  "success": false,
  "message": "Invalid version format. Use semantic versioning (e.g., 1.0.0 or 1.0)"
}
```

---

### 6. Update Version

**Endpoint:** `PUT /api/v1/app/versions/:id`

**Authentication:** Bearer Token (super_admin, admin)

#### Request

```http
PUT /api/v1/app/versions/3 HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
```

#### Request Body (Partial Update)

```json
{
  "force_update": true,
  "release_notes": "## Critical Security Update\n- Fixed security vulnerability\n- Users must update immediately",
  "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.2.1.exe"
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Version updated successfully",
  "data": {
    "id": 3,
    "version": "1.2.0",
    "build": 15,
    "force_update": true,
    "release_notes": "## Critical Security Update\n- Fixed security vulnerability",
    "released_at": "2026-02-24T07:00:00.000Z",
    "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
    "ios_url": "https://apps.apple.com/app/id123456789",
    "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.2.1.exe",
    "mac_url": "https://cdn.company.com/restropos/macos/RestroPOS_1.2.0.dmg",
    "linux_url": "https://cdn.company.com/restropos/linux/RestroPOS_1.2.0.AppImage",
    "is_active": true,
    "channel": "stable",
    "created_by": 1,
    "created_at": "2026-02-24T07:00:00.000Z",
    "updated_at": "2026-02-24T08:00:00.000Z"
  }
}
```

#### Response (404 Not Found)

```json
{
  "success": false,
  "message": "Version not found"
}
```

---

### 7. Delete Version

**Endpoint:** `DELETE /api/v1/app/versions/:id`

**Authentication:** Bearer Token (super_admin, admin)

#### Request

```http
DELETE /api/v1/app/versions/1 HTTP/1.1
Host: api.example.com
Authorization: Bearer <token>
```

#### Response (200 OK)

```json
{
  "success": true,
  "message": "Version deleted successfully"
}
```

#### Response (404 Not Found)

```json
{
  "success": false,
  "message": "Version not found"
}
```

---

## Backend Integration

### Step 1: Run Migration

```bash
cd restro-backend
node src/database/migrations/run-027-migration.js
```

### Step 2: Create First Version

```bash
curl -X POST http://localhost:3000/api/v1/app/versions \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.0",
    "build": 1,
    "force_update": false,
    "release_notes": "Initial release",
    "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
    "ios_url": "https://apps.apple.com/app/id123456789",
    "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.0.0.exe",
    "is_active": true,
    "channel": "stable"
  }'
```

### Step 3: Release New Version

When releasing a new version:

1. Upload installers to CDN/hosting
2. Create new version via API:

```bash
curl -X POST http://localhost:3000/api/v1/app/versions \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.1.0",
    "build": 5,
    "force_update": false,
    "release_notes": "- Bug fixes\n- New features",
    "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
    "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.1.0.exe",
    "is_active": true
  }'
```

> **Note:** Setting `is_active: true` automatically deactivates previous versions in the same channel.

### Step 4: Force Update (Security/Breaking Changes)

```bash
curl -X PUT http://localhost:3000/api/v1/app/versions/5 \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "force_update": true,
    "release_notes": "## Critical Update\nThis update is required for security reasons."
  }'
```

---

## Frontend/Application Integration

### Step 1: Define API Endpoint

```dart
// lib/api/endpoints.dart
class ApiEndpoints {
  static const String checkAppUpdate = "/app/version";
}
```

### Step 2: Check for Updates

```dart
// lib/services/update_service.dart
import 'package:package_info_plus/package_info_plus.dart';

class UpdateService {
  final ApiService _api;
  
  Future<UpdateInfo?> checkForUpdate() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version;
      
      final response = await _api.get(
        ApiEndpoints.checkAppUpdate,
        headers: {
          'X-App-Version': currentVersion,
          'X-Platform': _getPlatform(),
        },
      );
      
      if (response.success && response.data != null) {
        return UpdateInfo.fromJson(response.data);
      }
      return null;
    } catch (e) {
      print('Update check failed: $e');
      return null;
    }
  }
  
  String _getPlatform() {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    if (Platform.isWindows) return 'windows';
    if (Platform.isMacOS) return 'macos';
    if (Platform.isLinux) return 'linux';
    return 'unknown';
  }
}
```

### Step 3: Parse Update Response

```dart
// lib/models/update_info.dart
class UpdateInfo {
  final String version;
  final int? build;
  final bool forceUpdate;
  final String? releaseNotes;
  final DateTime? releaseDate;
  final String? androidUrl;
  final String? iosUrl;
  final String? windowsUrl;
  final String? macUrl;
  final String? linuxUrl;
  final bool? updateAvailable;
  
  UpdateInfo({
    required this.version,
    this.build,
    required this.forceUpdate,
    this.releaseNotes,
    this.releaseDate,
    this.androidUrl,
    this.iosUrl,
    this.windowsUrl,
    this.macUrl,
    this.linuxUrl,
    this.updateAvailable,
  });
  
  factory UpdateInfo.fromJson(Map<String, dynamic> json) {
    return UpdateInfo(
      version: json['version'] ?? '',
      build: json['build'],
      forceUpdate: json['force_update'] ?? json['forceUpdate'] ?? false,
      releaseNotes: json['release_notes'] ?? json['releaseNotes'],
      releaseDate: json['release_date'] != null 
          ? DateTime.tryParse(json['release_date']) 
          : null,
      androidUrl: json['android_url'] ?? json['androidUrl'],
      iosUrl: json['ios_url'] ?? json['iosUrl'],
      windowsUrl: json['windows_url'] ?? json['windowsUrl'],
      macUrl: json['mac_url'] ?? json['macUrl'],
      linuxUrl: json['linux_url'] ?? json['linuxUrl'],
      updateAvailable: json['update_available'],
    );
  }
  
  String? get platformUrl {
    if (Platform.isAndroid) return androidUrl;
    if (Platform.isIOS) return iosUrl;
    if (Platform.isWindows) return windowsUrl;
    if (Platform.isMacOS) return macUrl;
    if (Platform.isLinux) return linuxUrl;
    return null;
  }
}
```

### Step 4: Compare Versions

```dart
// lib/utils/version_utils.dart
class VersionUtils {
  /// Compare two semantic versions
  /// Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
  static int compare(String v1, String v2) {
    final parts1 = v1.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final parts2 = v2.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    
    final maxLength = parts1.length > parts2.length ? parts1.length : parts2.length;
    
    for (var i = 0; i < maxLength; i++) {
      final p1 = i < parts1.length ? parts1[i] : 0;
      final p2 = i < parts2.length ? parts2[i] : 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  }
  
  /// Check if newVersion is newer than currentVersion
  static bool isNewer(String newVersion, String currentVersion) {
    return compare(newVersion, currentVersion) > 0;
  }
}
```

### Step 5: Show Update Dialog

```dart
// lib/widgets/update_dialog.dart
class AppUpdateDialog extends StatelessWidget {
  final UpdateInfo updateInfo;
  final VoidCallback onUpdate;
  final VoidCallback? onLater;
  
  const AppUpdateDialog({
    required this.updateInfo,
    required this.onUpdate,
    this.onLater,
  });
  
  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Update Available'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Version ${updateInfo.version} is available.'),
          if (updateInfo.releaseNotes != null) ...[
            SizedBox(height: 16),
            Text('What\'s New:', style: TextStyle(fontWeight: FontWeight.bold)),
            SizedBox(height: 8),
            Text(updateInfo.releaseNotes!),
          ],
        ],
      ),
      actions: [
        if (!updateInfo.forceUpdate && onLater != null)
          TextButton(
            onPressed: onLater,
            child: Text('Later'),
          ),
        ElevatedButton(
          onPressed: onUpdate,
          child: Text('Update Now'),
        ),
      ],
    );
  }
}
```

### Step 6: Handle Platform-Specific Updates

```dart
// lib/services/update_handler.dart
import 'package:url_launcher/url_launcher.dart';
import 'dart:io';

class UpdateHandler {
  Future<void> startUpdate(UpdateInfo info) async {
    final url = info.platformUrl;
    if (url == null) return;
    
    if (Platform.isAndroid || Platform.isIOS) {
      // Open store URL
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } else if (Platform.isWindows) {
      // Download and run installer
      await _downloadAndInstallWindows(url);
    } else if (Platform.isMacOS) {
      // Download and open DMG
      await _downloadAndOpenMac(url);
    } else if (Platform.isLinux) {
      // Download and run AppImage
      await _downloadAndRunLinux(url);
    }
  }
  
  Future<void> _downloadAndInstallWindows(String url) async {
    final appSupport = await getApplicationSupportDirectory();
    final fileName = url.split('/').last;
    final filePath = '${appSupport.path}/$fileName';
    
    // Download file
    await _downloadFile(url, filePath);
    
    // Run installer with silent flags
    await Process.start(filePath, ['/SILENT', '/CLOSEAPPLICATIONS'], 
        mode: ProcessStartMode.detached);
    
    // Exit app
    exit(0);
  }
  
  Future<void> _downloadAndOpenMac(String url) async {
    final appSupport = await getApplicationSupportDirectory();
    final fileName = url.split('/').last;
    final filePath = '${appSupport.path}/$fileName';
    
    await _downloadFile(url, filePath);
    await Process.run('open', [filePath]);
  }
  
  Future<void> _downloadAndRunLinux(String url) async {
    final appSupport = await getApplicationSupportDirectory();
    final fileName = url.split('/').last;
    final filePath = '${appSupport.path}/$fileName';
    
    await _downloadFile(url, filePath);
    await Process.run('chmod', ['+x', filePath]);
    await Process.start(filePath, [], mode: ProcessStartMode.detached);
    exit(0);
  }
  
  Future<void> _downloadFile(String url, String savePath) async {
    final response = await http.get(Uri.parse(url));
    final file = File(savePath);
    await file.writeAsBytes(response.bodyBytes);
  }
}
```

### Step 7: Integrate with App Startup

```dart
// lib/app/app.dart
class App extends StatefulWidget {
  @override
  _AppState createState() => _AppState();
}

class _AppState extends State<App> {
  @override
  void initState() {
    super.initState();
    _checkForUpdates();
  }
  
  Future<void> _checkForUpdates() async {
    // Delay to allow app to load
    await Future.delayed(Duration(seconds: 3));
    
    final updateService = UpdateService();
    final updateInfo = await updateService.checkForUpdate();
    
    if (updateInfo != null && updateInfo.updateAvailable == true) {
      _showUpdateDialog(updateInfo);
    }
  }
  
  void _showUpdateDialog(UpdateInfo info) {
    showDialog(
      context: context,
      barrierDismissible: !info.forceUpdate,
      builder: (context) => AppUpdateDialog(
        updateInfo: info,
        onUpdate: () {
          Navigator.of(context).pop();
          UpdateHandler().startUpdate(info);
        },
        onLater: info.forceUpdate ? null : () => Navigator.of(context).pop(),
      ),
    );
  }
  
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      // ...
    );
  }
}
```

---

## Version Comparison Logic

### Rules
- Versions use semantic versioning: `MAJOR.MINOR.PATCH`
- Missing parts are treated as `0` (e.g., `1.2` == `1.2.0`)
- Comparison is numeric per segment

### Examples

| Current | Latest | Result |
|---------|--------|--------|
| `1.0.0` | `1.1.0` | Update available |
| `1.2.0` | `1.2.0` | No update |
| `1.2.9` | `1.2.10` | Update available |
| `2.0.0` | `1.9.9` | No update |
| `1.2` | `1.2.1` | Update available |

---

## Error Handling

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created (new version) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

### Error Response Format

```json
{
  "success": false,
  "message": "Error description"
}
```

---

## Database Schema

```sql
CREATE TABLE app_versions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version VARCHAR(20) NOT NULL,
    build INT UNSIGNED DEFAULT NULL,
    force_update BOOLEAN DEFAULT FALSE,
    release_notes TEXT,
    released_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    android_url VARCHAR(500) DEFAULT NULL,
    ios_url VARCHAR(500) DEFAULT NULL,
    windows_url VARCHAR(500) DEFAULT NULL,
    mac_url VARCHAR(500) DEFAULT NULL,
    linux_url VARCHAR(500) DEFAULT NULL,
    android_min_version VARCHAR(20) DEFAULT NULL,
    ios_min_version VARCHAR(20) DEFAULT NULL,
    windows_min_version VARCHAR(20) DEFAULT NULL,
    mac_min_version VARCHAR(20) DEFAULT NULL,
    linux_min_version VARCHAR(20) DEFAULT NULL,
    android_sha256 VARCHAR(64) DEFAULT NULL,
    ios_sha256 VARCHAR(64) DEFAULT NULL,
    windows_sha256 VARCHAR(64) DEFAULT NULL,
    mac_sha256 VARCHAR(64) DEFAULT NULL,
    linux_sha256 VARCHAR(64) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    channel ENUM('stable', 'beta', 'alpha') DEFAULT 'stable',
    created_by BIGINT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## Quick Reference

### Minimal API Response (Frontend Compatible)

```json
{
  "version": "1.1.0",
  "force_update": false,
  "release_notes": "Bug fixes",
  "android_url": "https://play.google.com/store/apps/details?id=com.company.restropos",
  "ios_url": "https://apps.apple.com/app/id123456789",
  "windows_url": "https://cdn.company.com/restropos/windows/RestroPOS_Setup_1.1.0.exe"
}
```

### Force Update Scenarios

Set `force_update: true` when:
- Breaking API changes
- Security vulnerabilities
- Critical bug fixes
- Minimum version enforcement

---

*Last updated: February 24, 2026*
