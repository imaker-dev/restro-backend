# Real-Time Integration Guide - Flutter

This guide explains how to implement real-time table status updates in the Flutter Captain application using Socket.IO.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Flutter App                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  FloorView   │  │  TableCard   │  │  OrderView   │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └─────────────────┼─────────────────┘                │
│                           │                                  │
│              ┌────────────▼────────────┐                     │
│              │   TableProvider (State) │                     │
│              └────────────┬────────────┘                     │
│                           │                                  │
│              ┌────────────▼────────────┐                     │
│              │     SocketService       │                     │
│              └────────────┬────────────┘                     │
└───────────────────────────┼─────────────────────────────────┘
                            │
               ┌────────────▼────────────┐
               │    Backend Server       │
               │  (Socket.IO + Redis)    │
               └─────────────────────────┘
```

---

## 1. Dependencies

Add to `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  socket_io_client: ^2.0.3+1
  provider: ^6.1.1  # For state management
  # OR use Riverpod/Bloc if preferred
```

Run:
```bash
flutter pub get
```

---

## 2. Socket Service

```dart
// lib/services/socket_service.dart

import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'dart:async';

class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  IO.Socket? _socket;
  bool _isConnected = false;
  
  // Stream controllers for different events
  final _tableUpdateController = StreamController<Map<String, dynamic>>.broadcast();
  final _orderUpdateController = StreamController<Map<String, dynamic>>.broadcast();
  final _billStatusController = StreamController<Map<String, dynamic>>.broadcast();
  final _itemReadyController = StreamController<Map<String, dynamic>>.broadcast();
  final _connectionController = StreamController<bool>.broadcast();

  // Public streams
  Stream<Map<String, dynamic>> get tableUpdates => _tableUpdateController.stream;
  Stream<Map<String, dynamic>> get orderUpdates => _orderUpdateController.stream;
  Stream<Map<String, dynamic>> get billStatus => _billStatusController.stream;
  Stream<Map<String, dynamic>> get itemReady => _itemReadyController.stream;
  Stream<bool> get connectionStatus => _connectionController.stream;

  bool get isConnected => _isConnected;

  /// Initialize socket connection
  /// 
  /// IMPORTANT: serverUrl must be the BASE domain, NOT the /api/v1 path.
  /// - Local:      'http://192.168.1.100:3000'
  /// - Production: 'https://restro-backend.imaker.in:443'
  ///
  /// The :443 is REQUIRED for HTTPS — without it, socket_io_client
  /// resolves port to 0, causing 'Connection to ...:0/socket.io/' errors.
  void connect(String serverUrl, {String? token, String? outletId}) {
    if (_socket != null && _isConnected) {
      print('Socket already connected');
      return;
    }

    // Ensure HTTPS URLs have explicit port 443 to avoid :0 bug
    String fixedUrl = serverUrl;
    if (fixedUrl.startsWith('https://') && !RegExp(r':\d+').hasMatch(fixedUrl.replaceFirst('https://', ''))) {
      fixedUrl = fixedUrl.replaceFirst('https://', 'https://').replaceFirst(RegExp(r'(/.*)?$'), ':443');
    }
    // Strip any /api/v1 or other paths — Socket.IO needs base URL only
    final uri = Uri.parse(fixedUrl);
    fixedUrl = '${uri.scheme}://${uri.host}:${uri.port}';
    print('[WebSocket] Connecting to: $fixedUrl');

    _socket = IO.io(
      fixedUrl,
      IO.OptionBuilder()
          .setTransports(['polling', 'websocket']) // polling first for reliability
          .setPath('/socket.io/')
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(5000)
          .setAuth({'token': token ?? ''})
          .setQuery(outletId != null ? {'outletId': outletId} : {})
          .build(),
    );

    _setupEventListeners();
  }

  void _setupEventListeners() {
    _socket?.onConnect((_) {
      print('Socket connected: ${_socket?.id}');
      _isConnected = true;
      _connectionController.add(true);
    });

    _socket?.onDisconnect((_) {
      print('Socket disconnected');
      _isConnected = false;
      _connectionController.add(false);
    });

    _socket?.onConnectError((error) {
      print('Socket connection error: $error');
      _isConnected = false;
      _connectionController.add(false);
    });

    _socket?.onError((error) {
      print('Socket error: $error');
    });

    // Listen for table updates
    _socket?.on('table:updated', (data) {
      print('Table update received: $data');
      _tableUpdateController.add(Map<String, dynamic>.from(data));
    });

    // Listen for order updates
    _socket?.on('order:updated', (data) {
      print('Order update received: $data');
      _orderUpdateController.add(Map<String, dynamic>.from(data));
    });

    // Listen for bill status
    _socket?.on('bill:status', (data) {
      print('Bill status received: $data');
      _billStatusController.add(Map<String, dynamic>.from(data));
    });

    // Listen for item ready
    _socket?.on('item:ready', (data) {
      print('Item ready received: $data');
      _itemReadyController.add(Map<String, dynamic>.from(data));
    });

    // Listen for KOT updates
    _socket?.on('kot:updated', (data) {
      print('KOT update received: $data');
    });
  }

  /// Join outlet room
  void joinOutlet(int outletId) {
    _socket?.emit('join:outlet', outletId);
    print('Joined outlet: $outletId');
  }

  /// Join floor room for table updates
  void joinFloor(int outletId, int floorId) {
    _socket?.emit('join:floor', {'outletId': outletId, 'floorId': floorId});
    print('Joined floor: $outletId:$floorId');
  }

  /// Join captain room
  void joinCaptain(int outletId) {
    _socket?.emit('join:captain', outletId);
    print('Joined captain: $outletId');
  }

  /// Join cashier room
  void joinCashier(int outletId) {
    _socket?.emit('join:cashier', outletId);
    print('Joined cashier: $outletId');
  }

  /// Join kitchen room
  void joinKitchen(int outletId) {
    _socket?.emit('join:kitchen', outletId);
    print('Joined kitchen: $outletId');
  }

  /// Leave floor room
  void leaveFloor(int outletId, int floorId) {
    _socket?.emit('leave:floor', {'outletId': outletId, 'floorId': floorId});
    print('Left floor: $outletId:$floorId');
  }

  /// Leave outlet room
  void leaveOutlet(int outletId) {
    _socket?.emit('leave:outlet', outletId);
    print('Left outlet: $outletId');
  }

  /// Disconnect socket
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected = false;
    print('Socket disconnected and disposed');
  }

  /// Dispose all streams
  void dispose() {
    disconnect();
    _tableUpdateController.close();
    _orderUpdateController.close();
    _billStatusController.close();
    _itemReadyController.close();
    _connectionController.close();
  }
}
```

---

## 3. Table Model

```dart
// lib/models/table_model.dart

class TableModel {
  final int id;
  final int outletId;
  final int floorId;
  final String tableNumber;
  final String? name;
  final int capacity;
  String status;
  int? sessionId;
  int? guestCount;
  String? guestName;
  int? currentOrderId;
  String? orderNumber;
  double? totalAmount;

  TableModel({
    required this.id,
    required this.outletId,
    required this.floorId,
    required this.tableNumber,
    this.name,
    required this.capacity,
    required this.status,
    this.sessionId,
    this.guestCount,
    this.guestName,
    this.currentOrderId,
    this.orderNumber,
    this.totalAmount,
  });

  factory TableModel.fromJson(Map<String, dynamic> json) {
    return TableModel(
      id: json['id'],
      outletId: json['outlet_id'],
      floorId: json['floor_id'],
      tableNumber: json['table_number'],
      name: json['name'],
      capacity: json['capacity'] ?? 4,
      status: json['status'] ?? 'available',
      sessionId: json['session_id'],
      guestCount: json['guest_count'],
      guestName: json['guest_name'],
      currentOrderId: json['current_order_id'],
      orderNumber: json['order_number'],
      totalAmount: json['total_amount']?.toDouble(),
    );
  }

  TableModel copyWith({
    String? status,
    int? sessionId,
    int? guestCount,
    String? guestName,
    int? currentOrderId,
    String? orderNumber,
    double? totalAmount,
  }) {
    return TableModel(
      id: id,
      outletId: outletId,
      floorId: floorId,
      tableNumber: tableNumber,
      name: name,
      capacity: capacity,
      status: status ?? this.status,
      sessionId: sessionId ?? this.sessionId,
      guestCount: guestCount ?? this.guestCount,
      guestName: guestName ?? this.guestName,
      currentOrderId: currentOrderId ?? this.currentOrderId,
      orderNumber: orderNumber ?? this.orderNumber,
      totalAmount: totalAmount ?? this.totalAmount,
    );
  }
}
```

---

## 4. Table Provider (State Management)

```dart
// lib/providers/table_provider.dart

import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/table_model.dart';
import '../services/socket_service.dart';
import '../services/api_service.dart';

class TableProvider extends ChangeNotifier {
  final SocketService _socketService = SocketService();
  final ApiService _apiService = ApiService();
  
  List<TableModel> _tables = [];
  bool _isLoading = false;
  String? _error;
  int? _currentFloorId;
  int? _outletId;
  
  StreamSubscription? _tableUpdateSubscription;
  StreamSubscription? _connectionSubscription;

  List<TableModel> get tables => _tables;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isConnected => _socketService.isConnected;

  // Get tables by status
  List<TableModel> get availableTables => 
      _tables.where((t) => t.status == 'available').toList();
  List<TableModel> get occupiedTables => 
      _tables.where((t) => t.status == 'occupied').toList();
  List<TableModel> get billingTables => 
      _tables.where((t) => t.status == 'billing').toList();

  /// Initialize provider with outlet and connect socket
  Future<void> initialize(int outletId, String serverUrl, {String? token}) async {
    _outletId = outletId;
    
    // Connect to socket
    _socketService.connect(serverUrl, token: token);
    
    // Join outlet and captain rooms
    _socketService.joinOutlet(outletId);
    _socketService.joinCaptain(outletId);
    
    // Subscribe to table updates
    _tableUpdateSubscription = _socketService.tableUpdates.listen(_handleTableUpdate);
    
    // Subscribe to connection status
    _connectionSubscription = _socketService.connectionStatus.listen((connected) {
      notifyListeners();
    });
  }

  /// Load tables for a floor
  Future<void> loadFloorTables(int floorId) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      // Leave previous floor if any
      if (_currentFloorId != null && _outletId != null) {
        _socketService.leaveFloor(_outletId!, _currentFloorId!);
      }

      // Fetch tables from API
      final response = await _apiService.get('/tables/floor/$floorId');
      _tables = (response['data'] as List)
          .map((json) => TableModel.fromJson(json))
          .toList();

      // Join new floor room
      _currentFloorId = floorId;
      if (_outletId != null) {
        _socketService.joinFloor(_outletId!, floorId);
      }

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      _error = e.toString();
      notifyListeners();
    }
  }

  /// Handle real-time table update
  void _handleTableUpdate(Map<String, dynamic> data) {
    final tableId = data['tableId'];
    final newStatus = data['status'];
    final session = data['session'];

    // Find and update the table
    final index = _tables.indexWhere((t) => t.id == tableId);
    if (index != -1) {
      _tables[index] = _tables[index].copyWith(
        status: newStatus,
        sessionId: session?['id'],
        guestCount: session?['guestCount'],
        guestName: session?['guestName'],
        currentOrderId: data['orderId'],
      );
      notifyListeners();
      
      print('Table ${_tables[index].tableNumber} updated to $newStatus');
    }
  }

  /// Get table by ID
  TableModel? getTableById(int tableId) {
    try {
      return _tables.firstWhere((t) => t.id == tableId);
    } catch (_) {
      return null;
    }
  }

  /// Refresh tables
  Future<void> refresh() async {
    if (_currentFloorId != null) {
      await loadFloorTables(_currentFloorId!);
    }
  }

  @override
  void dispose() {
    _tableUpdateSubscription?.cancel();
    _connectionSubscription?.cancel();
    _socketService.dispose();
    super.dispose();
  }
}
```

---

## 5. API Service

```dart
// lib/services/api_service.dart

import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String? _baseUrl;
  String? _token;

  void configure({required String baseUrl, String? token}) {
    _baseUrl = baseUrl;
    _token = token;
  }

  void setToken(String token) {
    _token = token;
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> get(String path) async {
    final response = await http.get(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('API Error: ${response.statusCode}');
    }
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
      body: json.encode(data),
    );

    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body);
    } else {
      throw Exception('API Error: ${response.statusCode}');
    }
  }
}
```

---

## 6. Flutter Widget Example

```dart
// lib/screens/floor_view_screen.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/table_provider.dart';
import '../models/table_model.dart';

class FloorViewScreen extends StatefulWidget {
  final int outletId;
  final int floorId;

  const FloorViewScreen({
    Key? key,
    required this.outletId,
    required this.floorId,
  }) : super(key: key);

  @override
  State<FloorViewScreen> createState() => _FloorViewScreenState();
}

class _FloorViewScreenState extends State<FloorViewScreen> {
  @override
  void initState() {
    super.initState();
    // Load tables when screen opens
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TableProvider>().loadFloorTables(widget.floorId);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Floor View'),
        actions: [
          // Connection status indicator
          Consumer<TableProvider>(
            builder: (context, provider, _) => Padding(
              padding: const EdgeInsets.all(8.0),
              child: Icon(
                provider.isConnected ? Icons.wifi : Icons.wifi_off,
                color: provider.isConnected ? Colors.green : Colors.red,
              ),
            ),
          ),
          // Refresh button
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<TableProvider>().refresh(),
          ),
        ],
      ),
      body: Consumer<TableProvider>(
        builder: (context, provider, _) {
          if (provider.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (provider.error != null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Error: ${provider.error}'),
                  ElevatedButton(
                    onPressed: () => provider.refresh(),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => provider.refresh(),
            child: GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1,
              ),
              itemCount: provider.tables.length,
              itemBuilder: (context, index) {
                return TableCard(table: provider.tables[index]);
              },
            ),
          );
        },
      ),
    );
  }
}

class TableCard extends StatelessWidget {
  final TableModel table;

  const TableCard({Key? key, required this.table}) : super(key: key);

  Color get statusColor {
    switch (table.status) {
      case 'available':
        return Colors.green;
      case 'occupied':
        return Colors.orange;
      case 'billing':
        return Colors.blue;
      case 'reserved':
        return Colors.purple;
      case 'blocked':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  IconData get statusIcon {
    switch (table.status) {
      case 'available':
        return Icons.check_circle;
      case 'occupied':
        return Icons.restaurant;
      case 'billing':
        return Icons.receipt;
      case 'reserved':
        return Icons.schedule;
      case 'blocked':
        return Icons.block;
      default:
        return Icons.help;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 4,
      color: statusColor.withOpacity(0.1),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: statusColor, width: 2),
      ),
      child: InkWell(
        onTap: () {
          // Handle table tap
          _showTableActions(context);
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(statusIcon, color: statusColor, size: 32),
              const SizedBox(height: 8),
              Text(
                table.tableNumber,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: statusColor,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                table.status.toUpperCase(),
                style: TextStyle(
                  fontSize: 10,
                  color: statusColor,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (table.guestName != null) ...[
                const SizedBox(height: 4),
                Text(
                  table.guestName!,
                  style: const TextStyle(fontSize: 11),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              if (table.guestCount != null) ...[
                Text(
                  '${table.guestCount} guests',
                  style: TextStyle(fontSize: 10, color: Colors.grey[600]),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  void _showTableActions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Table ${table.tableNumber}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.add),
              title: const Text('Start Session'),
              enabled: table.status == 'available',
              onTap: () {
                Navigator.pop(context);
                // Start session
              },
            ),
            ListTile(
              leading: const Icon(Icons.shopping_cart),
              title: const Text('View Order'),
              enabled: table.status == 'occupied',
              onTap: () {
                Navigator.pop(context);
                // View order
              },
            ),
            ListTile(
              leading: const Icon(Icons.receipt),
              title: const Text('Generate Bill'),
              enabled: table.status == 'occupied',
              onTap: () {
                Navigator.pop(context);
                // Generate bill
              },
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## 7. App Setup (main.dart)

```dart
// lib/main.dart

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/table_provider.dart';
import 'services/api_service.dart';
import 'screens/floor_view_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => TableProvider()),
      ],
      child: MaterialApp(
        title: 'Captain App',
        theme: ThemeData(
          primarySwatch: Colors.blue,
          useMaterial3: true,
        ),
        home: const SplashScreen(),
      ),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({Key? key}) : super(key: key);

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _initializeApp();
  }

  Future<void> _initializeApp() async {
    // Configure API service
    // Local:      'http://192.168.1.100:3000/api/v1'
    // Production: 'https://restro-backend.imaker.in/api/v1'
    ApiService().configure(
      baseUrl: 'https://restro-backend.imaker.in/api/v1',
      token: 'your-auth-token',
    );

    // Initialize socket and table provider
    // IMPORTANT: Socket URL is the BASE domain with explicit port.
    // Do NOT use the /api/v1 path for Socket.IO!
    // Local:      'http://192.168.1.100:3000'
    // Production: 'https://restro-backend.imaker.in:443'
    await context.read<TableProvider>().initialize(
      4, // outletId
      'https://restro-backend.imaker.in:443', // Socket server URL (explicit :443!)
      token: 'your-auth-token',
    );

    // Navigate to floor view
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => const FloorViewScreen(outletId: 4, floorId: 1),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: CircularProgressIndicator(),
      ),
    );
  }
}
```

---

## 8. Event Payloads Reference (Exact from Code)

### table:updated
**Event field values:** `session_started`, `session_ended`, `status_changed`, `tables_merged`, `tables_unmerged`

```dart
{
  "tableId": 1,
  "floorId": 1,
  "outletId": 4,
  "tableNumber": "T1",
  "status": "occupied",  // available, occupied, billing, reserved, blocked
  "event": "session_started",  // Event type
  "sessionId": 30,
  "captain": 5,
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

### order:updated
**Type field values:** `order:created`, `order:items_added`, `order:item_modified`, `order:item_cancelled`, `order:status_changed`, `order:kot_sent`, `order:item_ready`, `order:all_ready`, `order:all_served`, `order:billed`, `order:payment_received`, `order:cancelled`, `order:transferred`

```dart
{
  "type": "order:created",  // Event type
  "outletId": 4,
  "orderId": 35,
  "order": { ... },  // Full order object
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

### bill:status
**Status field values:** `pending`, `paid`

```dart
{
  "outletId": 4,
  "orderId": 35,
  "tableId": 1,
  "invoiceId": 50,
  "status": "pending",  // pending, paid
  "grandTotal": 1794.37,
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

### item:ready
```dart
{
  "type": "kot:item_ready",
  "outletId": 4,
  "kotId": 25,
  "kotNumber": "KOT0205001",
  "station": "kitchen",
  "orderId": 35,
  "tableId": 1,
  "tableName": "T1",
  "items": [{"id": 1, "name": "Paneer Tikka", "quantity": 2}]
}
```

### kot:updated
**Type field values:** `kot:created`, `kot:accepted`, `kot:preparing`, `kot:ready`, `kot:item_ready`, `kot:served`

```dart
{
  "type": "kot:created",
  "outletId": 4,
  "kotId": 25,
  "station": "kitchen",
  "kot": { ... }
}
```

---

## 9. Usage Summary

| Step | Code |
|------|------|
| 1. Add dependency | `socket_io_client: ^2.0.3+1` |
| 2. Connect | `_socketService.connect(serverUrl)` |
| 3. Join rooms | `_socketService.joinFloor(outletId, floorId)` |
| 4. Listen | `_socketService.tableUpdates.listen(callback)` |
| 5. Update UI | `notifyListeners()` in Provider |

---

## 10. Troubleshooting

### `:0` Port Error (CRITICAL)
If you see `Connection to 'https://domain:0/socket.io/...'`:
1. **Add explicit port** — Use `https://restro-backend.imaker.in:443` (not just `https://restro-backend.imaker.in`)
2. **Remove /api/v1** — Socket.IO URL must be the base domain only
3. **Don't pass REST API URL** — The Socket URL and API URL are different

### `websocket error` / `Transport Error` on Production
1. Use `['polling', 'websocket']` transport order (NOT `['websocket']` only)
2. Polling connects through any proxy; WebSocket upgrade happens after
3. If WebSocket upgrade fails, Socket.IO stays on polling (still works)

### Connection Issues on Android
- Add to `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET"/>
```
- For local testing, use actual IP (not `localhost`)

### Connection Issues on iOS
- Add to `Info.plist` for HTTP:
```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
```

### Events Not Receiving
1. Verify socket is connected: `_socketService.isConnected`
2. Check room joining: Look for "Joined floor" in logs
3. Verify event name: `table:updated` (not `table:update`)

### State Not Updating
1. Call `notifyListeners()` after updating data
2. Use `Consumer` widget to listen to changes
3. Check if `tableId` matches correctly

### Quick URL Reference
| Environment | REST API URL | Socket.IO URL |
|-------------|-------------|---------------|
| Local | `http://192.168.1.100:3000/api/v1` | `http://192.168.1.100:3000` |
| Production | `https://restro-backend.imaker.in/api/v1` | `https://restro-backend.imaker.in:443` |

---

## Summary

Real-time table status in Flutter:
1. **SocketService** - Manages WebSocket connection and events
2. **TableProvider** - State management with real-time updates
3. **Consumer Widget** - Auto-rebuilds UI on changes

All devices (tablet, mobile, desktop) will see table status updates instantly!
