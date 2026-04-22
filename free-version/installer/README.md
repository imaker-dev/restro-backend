# Restro POS — Single Installer Setup

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Single Installer (RestroPOS-Setup.exe)          │
│                                                  │
│  ┌─────────────┐       ┌──────────────────────┐ │
│  │ Flutter App  │ HTTP  │  backend/             │ │
│  │ (UI)        │──────→│  restro-pos.exe (API) │ │
│  │             │       │  mariadb/ (Database)  │ │
│  └──────┬──────┘       └──────────┬───────────┘ │
│         │                         │              │
│    App Open ───→ Start backend    │              │
│    App Close ──→ Stop backend     │              │
└──────────────────────────────────────────────────┘
```

**Key points:**
- ONE installer, ONE uninstaller
- No terminal windows
- No Windows services needed
- No admin privileges needed
- Flutter app controls backend lifecycle (start on open, stop on close)
- Auto-start on Windows login (optional, via Start Menu startup shortcut)

## Files Created

| File | Purpose |
|------|---------|
| `backend_manager.dart` | Dart class — add to Flutter project. Manages MariaDB + backend process lifecycle. |
| `flutter_integration_example.dart` | Shows exactly how to integrate BackendManager into Flutter app. |
| `restro-pos-setup.iss` | Inno Setup script — compiles into single .exe installer. |
| `build-installer.js` | Node script — builds backend + verifies Flutter + compiles installer. |

## Step-by-Step Build Guide

### 1. Backend Build (this repo)

```bash
# Download portable MariaDB (one-time)
node free-version/scripts/download-mariadb.js --platform=win64

# Build backend binary
node free-version/scripts/build.js --platform=win64 --skip-zip
```

Output: `dist/restro-pos-win64/` with `restro-pos.exe`, `mariadb/`, `.env`, etc.

### 2. Flutter Integration (Flutter repo)

**a. Copy `backend_manager.dart`** → `lib/services/backend_manager.dart`

**b. Add packages** to `pubspec.yaml` (if not already):
```yaml
dependencies:
  http: ^1.2.0
  path: ^1.9.0
```

**c. Modify `main.dart`:**
```dart
import 'dart:io';
import 'services/backend_manager.dart';

final backendManager = BackendManager();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  if (Platform.isWindows) {
    // Desktop: show splash, start backend, then navigate to app
    runApp(AppLifecycleHandler(
      child: RestroPOSApp(isDesktop: true),
    ));
  } else {
    // Mobile: connect to remote server directly
    runApp(RestroPOSApp(isDesktop: false));
  }
}
```

**d. Add splash screen** — see `flutter_integration_example.dart` for the complete `DesktopSplashScreen` widget.

**e. Add lifecycle handler** — wraps your app to stop backend when window closes.

**f. Build Flutter:**
```bash
flutter build windows --release
```

### 3. Install Inno Setup

Download **Inno Setup 6** from: https://jrsoftware.org/isinfo.php

### 4. Compile Installer

**Option A: GUI**
- Open `restro-pos-setup.iss` in Inno Setup Compiler
- Verify the `#define FlutterBuildDir` and `#define BackendBuildDir` paths
- Click Build → Compile

**Option B: Command line**
```bash
node free-version/installer/build-installer.js --flutter-dir=C:\path\to\flutter\build\windows\x64\runner\Release
```

**Option C: Direct ISCC**
```bash
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" free-version/installer/restro-pos-setup.iss
```

### 5. Output

```
dist/RestroPOS-Setup-1.0.0.exe    (~150-200 MB, single installer)
```

## Installed Directory Structure

```
C:\Program Files\RestroPOS\          (or user-chosen path)
├── iMakerRestro.exe                 ← Flutter app (user launches this)
├── flutter_windows.dll              ← Flutter runtime
├── data/                            ← Flutter assets
├── backend/                         ← Backend (managed by Flutter)
│   ├── restro-pos.exe               ← Node.js API server
│   ├── .env                         ← Configuration
│   ├── my.ini                       ← MariaDB config (auto-generated)
│   ├── mariadb/                     ← Portable MariaDB
│   │   └── bin/mariadbd.exe, etc.
│   ├── license/public.key           ← Activation key
│   ├── data/                        ← Database files (created on first run)
│   ├── uploads/                     ← User uploads
│   └── logs/                        ← Logs (app.log, db.log)
```

## How It Works at Runtime

1. **User double-clicks "Restro POS"** (Flutter app)
2. Flutter splash screen appears: "Starting..."
3. `BackendManager.start()` runs:
   - First run? → initializes MariaDB data directory
   - Writes `my.ini` config
   - Starts `mariadbd.exe` silently (no terminal)
   - Waits for DB to accept connections
   - Creates database + user (if first run)
   - Starts `restro-pos.exe` silently
   - Waits for `/health` endpoint to respond
4. Splash screen → navigates to Login/Home
5. App works normally (all API calls to `localhost:3000`)
6. **User closes app** → `BackendManager.stop()`:
   - Sends shutdown to backend
   - Sends shutdown to MariaDB
   - Both processes exit cleanly

## Uninstall

- Windows Settings → Apps → Restro POS → Uninstall
- Asks: "Keep database and uploads?" (Yes preserves data for reinstall)
- Stops all processes, removes files, removes shortcuts

## FAQ

**Q: What if the user force-kills the Flutter app?**
A: Backend processes may remain running. Next time the app opens, `BackendManager` detects they're already running via health check and reuses them. The `_stopBackend()` method also cleans up orphaned processes by port.

**Q: Can multiple users run it on the same PC?**
A: No — MariaDB binds to port 3307 and backend to port 3000. One instance per machine.

**Q: Does it need internet?**
A: No. Everything runs locally. Internet is only needed for initial activation token (one-time).

**Q: Admin privileges?**
A: Not required. Installs to user's AppData if no admin. Uses process spawning, not Windows services.
