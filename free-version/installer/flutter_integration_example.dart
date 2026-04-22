/// ============================================================
/// FLUTTER INTEGRATION EXAMPLE
/// 
/// This shows exactly how to integrate BackendManager into your
/// existing Flutter app. You need to make 3 changes:
///
/// 1. Add backend_manager.dart to your Flutter project
/// 2. Modify main.dart to start backend on app launch
/// 3. Add a splash/loading screen while backend starts
/// ============================================================

// ── FILE: lib/services/backend_manager.dart ──────────────────
// Copy backend_manager.dart to this path in your Flutter project.

// ── FILE: lib/main.dart ──────────────────────────────────────
// Add these changes to your existing main.dart:

import 'dart:io';
import 'package:flutter/material.dart';
// ... your existing imports ...

// ADD THIS IMPORT:
import 'services/backend_manager.dart';

// ADD THIS GLOBAL INSTANCE:
final backendManager = BackendManager();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Only manage backend on desktop (Windows)
  // Mobile connects to a remote server
  if (Platform.isWindows) {
    runApp(const RestroPOSApp(isDesktop: true));
  } else {
    runApp(const RestroPOSApp(isDesktop: false));
  }
}

// ── FILE: lib/app.dart (or wherever your root widget is) ─────

class RestroPOSApp extends StatelessWidget {
  final bool isDesktop;
  const RestroPOSApp({super.key, required this.isDesktop});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Restro POS',
      // If desktop, show splash screen first to start backend
      // If mobile, go directly to login/home
      home: isDesktop ? const DesktopSplashScreen() : const LoginScreen(),
    );
  }
}

// ── FILE: lib/screens/desktop_splash_screen.dart ─────────────
// NEW FILE: Shows loading progress while backend starts

class DesktopSplashScreen extends StatefulWidget {
  const DesktopSplashScreen({super.key});

  @override
  State<DesktopSplashScreen> createState() => _DesktopSplashScreenState();
}

class _DesktopSplashScreenState extends State<DesktopSplashScreen> {
  String _status = 'Initializing...';
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _startBackend();
  }

  Future<void> _startBackend() async {
    final success = await backendManager.start(
      onProgress: (msg) {
        if (mounted) {
          setState(() => _status = msg);
        }
      },
    );

    if (success) {
      if (mounted) {
        // Backend is ready — navigate to main app
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
      }
    } else {
      if (mounted) {
        setState(() {
          _error = true;
          _status = 'Failed to start backend. Check logs folder.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A2E),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Your app logo
            const Icon(Icons.restaurant, size: 80, color: Colors.white),
            const SizedBox(height: 24),
            const Text(
              'Restro POS',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 48),
            if (!_error) ...[
              const SizedBox(
                width: 200,
                child: LinearProgressIndicator(
                  backgroundColor: Colors.white24,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.greenAccent),
                ),
              ),
              const SizedBox(height: 16),
            ],
            Text(
              _status,
              style: TextStyle(
                fontSize: 14,
                color: _error ? Colors.redAccent : Colors.white70,
              ),
            ),
            if (_error) ...[
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    _error = false;
                    _status = 'Retrying...';
                  });
                  _startBackend();
                },
                child: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── HANDLE APP EXIT ──────────────────────────────────────────
// In your app's root widget or wherever you handle app lifecycle:

class AppLifecycleHandler extends StatefulWidget {
  final Widget child;
  const AppLifecycleHandler({super.key, required this.child});

  @override
  State<AppLifecycleHandler> createState() => _AppLifecycleHandlerState();
}

class _AppLifecycleHandlerState extends State<AppLifecycleHandler>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.detached) {
      // App is closing — stop backend
      backendManager.stop();
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

// ── WRAP YOUR APP WITH THE LIFECYCLE HANDLER ─────────────────
// In main.dart, wrap your app:
//
//   runApp(AppLifecycleHandler(child: RestroPOSApp(isDesktop: true)));
//
// This ensures backend stops when the user closes the Flutter window.

// Placeholder classes referenced above
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: Center(child: Text('Login')));
}
