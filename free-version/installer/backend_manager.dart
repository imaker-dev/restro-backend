import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:http/http.dart' as http;

/// Manages the lifecycle of the Restro POS backend (MariaDB + Node backend).
///
/// Usage in your Flutter app:
/// ```dart
/// final backend = BackendManager();
///
/// // In main() or splash screen:
/// await backend.start(onProgress: (msg) => print(msg));
///
/// // When app exits:
/// await backend.stop();
/// ```
///
/// Directory structure expected (relative to Flutter .exe):
/// ```
/// C:\Program Files\RestroPOS\
/// ├── iMakerRestro.exe          ← Flutter app
/// ├── backend\
/// │   ├── restro-pos.exe        ← Node backend binary
/// │   ├── .env                  ← Config
/// │   ├── mariadb\bin\...       ← Portable MariaDB
/// │   ├── license\public.key
/// │   ├── data\                 ← DB data (created on first run)
/// │   ├── uploads\
/// │   └── logs\
/// ```
class BackendManager {
  Process? _mariadbProcess;
  Process? _backendProcess;
  bool _running = false;

  /// Backend directory path (sibling to Flutter exe)
  late final String backendDir;

  /// Backend API base URL
  final String backendUrl;

  /// MariaDB port
  final int dbPort;

  /// Backend API port
  final int apiPort;

  BackendManager({
    this.backendUrl = 'http://localhost:3000',
    this.dbPort = 3307,
    this.apiPort = 3000,
  }) {
    // Resolve backend dir relative to the Flutter executable
    final exeDir = p.dirname(Platform.resolvedExecutable);
    backendDir = p.join(exeDir, 'backend');
  }

  bool get isRunning => _running;

  // ─── Public API ────────────────────────────────────────────────

  /// Start MariaDB + backend. Call this from splash screen.
  /// [onProgress] callback for UI updates during startup.
  /// Returns true if backend is healthy, false on failure.
  Future<bool> start({Function(String message)? onProgress}) async {
    try {
      onProgress?.call('Checking backend files...');
      if (!_validateFiles()) {
        onProgress?.call('ERROR: Backend files missing!');
        return false;
      }

      // Ensure directories exist
      _ensureDirectories();

      // First-time database initialization
      if (!await _isDbInitialized()) {
        onProgress?.call('First time setup — initializing database...');
        final initOk = await _initializeDatabase(onProgress);
        if (!initOk) {
          onProgress?.call('ERROR: Database initialization failed.');
          return false;
        }
      }

      // Write MariaDB config
      _writeMariaDbConfig();

      // Start MariaDB
      onProgress?.call('Starting database...');
      final dbOk = await _startMariaDb(onProgress);
      if (!dbOk) {
        onProgress?.call('ERROR: Database failed to start.');
        return false;
      }

      // Ensure DB user exists (first run)
      onProgress?.call('Ensuring database user...');
      await _ensureDatabaseUser();

      // Start backend
      onProgress?.call('Starting backend server...');
      final apiOk = await _startBackend(onProgress);
      if (!apiOk) {
        onProgress?.call('ERROR: Backend failed to start.');
        await _stopMariaDb();
        return false;
      }

      _running = true;
      onProgress?.call('Ready!');
      return true;
    } catch (e) {
      onProgress?.call('ERROR: $e');
      await stop();
      return false;
    }
  }

  /// Stop backend + MariaDB. Call when app exits.
  Future<void> stop() async {
    _running = false;
    await _stopBackend();
    await _stopMariaDb();
  }

  /// Check if backend is healthy (quick check for ongoing use).
  Future<bool> healthCheck() async {
    try {
      final response = await http
          .get(Uri.parse('$backendUrl/health'))
          .timeout(const Duration(seconds: 2));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // ─── File Validation ───────────────────────────────────────────

  bool _validateFiles() {
    final requiredFiles = [
      p.join(backendDir, 'restro-pos.exe'),
      p.join(backendDir, '.env'),
    ];
    final requiredDirs = [
      p.join(backendDir, 'mariadb', 'bin'),
    ];
    for (final f in requiredFiles) {
      if (!File(f).existsSync()) return false;
    }
    for (final d in requiredDirs) {
      if (!Directory(d).existsSync()) return false;
    }
    return true;
  }

  void _ensureDirectories() {
    for (final dir in ['data', 'uploads', 'logs']) {
      Directory(p.join(backendDir, dir)).createSync(recursive: true);
    }
  }

  // ─── MariaDB ───────────────────────────────────────────────────

  String get _mariadbBin => p.join(backendDir, 'mariadb', 'bin');

  String _findExe(List<String> candidates) {
    for (final name in candidates) {
      final path = p.join(_mariadbBin, name);
      if (File(path).existsSync()) return path;
    }
    throw FileSystemException('None found: $candidates');
  }

  Future<bool> _isDbInitialized() async {
    return Directory(p.join(backendDir, 'data', 'mysql')).existsSync();
  }

  Future<bool> _initializeDatabase(Function(String)? onProgress) async {
    try {
      // Clean data dir
      final dataDir = Directory(p.join(backendDir, 'data'));
      if (dataDir.existsSync()) dataDir.deleteSync(recursive: true);
      dataDir.createSync(recursive: true);

      final installDb = _findExe(['mariadb-install-db.exe', 'mysql_install_db.exe']);
      final result = await Process.run(
        installDb,
        ['--datadir=${p.join(backendDir, 'data')}', '--verbose-bootstrap'],
        workingDirectory: backendDir,
      );

      final logFile = File(p.join(backendDir, 'logs', 'db-init.log'));
      logFile.writeAsStringSync('${result.stdout}\n${result.stderr}');

      if (!Directory(p.join(backendDir, 'data', 'mysql')).existsSync()) {
        onProgress?.call('DB init failed. Check logs/db-init.log');
        return false;
      }
      return true;
    } catch (e) {
      onProgress?.call('DB init error: $e');
      return false;
    }
  }

  void _writeMariaDbConfig() {
    // MariaDB needs forward slashes in paths
    final dir = backendDir.replaceAll('\\', '/');
    final config = '''[mysqld]
port=$dbPort
datadir=$dir/data
basedir=$dir/mariadb
skip-networking=0
bind-address=127.0.0.1
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
innodb_buffer_pool_size=256M
max_connections=50
log-error=$dir/logs/db.log

[client]
port=$dbPort
default-character-set=utf8mb4
''';
    File(p.join(backendDir, 'my.ini')).writeAsStringSync(config);
  }

  Future<bool> _startMariaDb(Function(String)? onProgress) async {
    try {
      final mariadbd = _findExe(['mariadbd.exe', 'mysqld.exe']);
      final iniPath = p.join(backendDir, 'my.ini');

      _mariadbProcess = await Process.start(
        mariadbd,
        ['--defaults-file=$iniPath'],
        workingDirectory: backendDir,
        mode: ProcessStartMode.detached,
      );

      // Wait for DB to accept connections (max 30 seconds)
      final client = _findExe(['mariadb.exe', 'mysql.exe']);
      for (int i = 0; i < 30; i++) {
        await Future.delayed(const Duration(seconds: 1));
        final result = await Process.run(
          client,
          ['-h', '127.0.0.1', '-P', '$dbPort', '-u', 'root', '--connect-timeout=1', '-e', 'SELECT 1'],
          workingDirectory: backendDir,
        );
        if (result.exitCode == 0) {
          onProgress?.call('Database ready.');
          return true;
        }
        onProgress?.call('Waiting for database... (${i + 1}/30)');
      }
      onProgress?.call('Database timeout after 30s');
      return false;
    } catch (e) {
      onProgress?.call('MariaDB start error: $e');
      return false;
    }
  }

  Future<void> _ensureDatabaseUser() async {
    try {
      final client = _findExe(['mariadb.exe', 'mysql.exe']);
      await Process.run(client, [
        '-h', '127.0.0.1', '-P', '$dbPort', '-u', 'root', '-e',
        "CREATE DATABASE IF NOT EXISTS restro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; "
        "CREATE USER IF NOT EXISTS 'restro'@'127.0.0.1' IDENTIFIED BY 'restro_pos_2024'; "
        "CREATE USER IF NOT EXISTS 'restro'@'localhost' IDENTIFIED BY 'restro_pos_2024'; "
        "GRANT ALL PRIVILEGES ON restro.* TO 'restro'@'127.0.0.1'; "
        "GRANT ALL PRIVILEGES ON restro.* TO 'restro'@'localhost'; "
        "FLUSH PRIVILEGES;"
      ], workingDirectory: backendDir);
    } catch (_) {
      // Non-fatal — user may already exist
    }
  }

  Future<void> _stopMariaDb() async {
    try {
      final admin = _findExe(['mariadb-admin.exe', 'mysqladmin.exe']);
      await Process.run(
        admin,
        ['-h', '127.0.0.1', '-P', '$dbPort', '-u', 'root', 'shutdown'],
        workingDirectory: backendDir,
      ).timeout(const Duration(seconds: 10));
    } catch (_) {}
    _mariadbProcess?.kill();
    _mariadbProcess = null;
  }

  // ─── Backend (restro-pos.exe) ──────────────────────────────────

  Future<bool> _startBackend(Function(String)? onProgress) async {
    try {
      _backendProcess = await Process.start(
        p.join(backendDir, 'restro-pos.exe'),
        [],
        workingDirectory: backendDir,
        mode: ProcessStartMode.detached,
        environment: {
          // Ensure the backend finds its config
          'NODE_ENV': 'production',
        },
      );

      // Pipe backend output to log file
      final logFile = File(p.join(backendDir, 'logs', 'app.log'));
      final logSink = logFile.openWrite(mode: FileMode.append);
      _backendProcess!.stdout.transform(utf8.decoder).listen((data) {
        logSink.write(data);
      });
      _backendProcess!.stderr.transform(utf8.decoder).listen((data) {
        logSink.write('[ERR] $data');
      });

      // Wait for backend health check (max 30 seconds)
      // Backend runs migrations on first start, so give it time
      for (int i = 0; i < 30; i++) {
        await Future.delayed(const Duration(seconds: 1));
        if (await healthCheck()) {
          onProgress?.call('Backend server ready.');
          return true;
        }
        onProgress?.call('Starting backend... (${i + 1}/30)');
      }
      onProgress?.call('Backend timeout after 30s');
      return false;
    } catch (e) {
      onProgress?.call('Backend start error: $e');
      return false;
    }
  }

  Future<void> _stopBackend() async {
    _backendProcess?.kill();
    _backendProcess = null;

    // Also kill by port in case process handle was lost
    try {
      if (Platform.isWindows) {
        final result = await Process.run('cmd', ['/c',
          'for /f "tokens=5" %a in (\'netstat -aon ^| findstr :$apiPort ^| findstr LISTENING\') do taskkill /F /PID %a'
        ]);
        // Ignore errors — process may already be dead
      }
    } catch (_) {}
  }
}
