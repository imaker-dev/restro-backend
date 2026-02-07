# Real-Time Integration Guide

This guide explains how to implement real-time table status updates across all devices (tablet, desktop, mobile) in the Captain application.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Captain App    │     │  Cashier App    │     │  Kitchen App    │
│  (Tablet/Mobile)│     │  (Desktop)      │     │  (KDS)          │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │    Socket.IO          │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      Backend Server      │
                    │   (Express + Socket.IO)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │         Redis           │
                    │    (Pub/Sub Channel)    │
                    └─────────────────────────┘
```

## Backend WebSocket Events

### Available Events

| Event | Description | Data |
|-------|-------------|------|
| `table:updated` | Table status changed | `{ tableId, status, floorId, session }` |
| `order:updated` | Order created/updated | `{ orderId, status, tableId, items }` |
| `kot:updated` | KOT status changed | `{ kotId, status, station }` |
| `item:ready` | Item ready to serve | `{ kotId, itemId, tableName }` |
| `bill:status` | Bill status changed | `{ orderId, tableId, status }` |
| `payment:updated` | Payment processed | `{ orderId, paymentStatus }` |

### Room Structure

```javascript
// Room types for different app roles
outlet:{outletId}     // All events for outlet
floor:{outletId}:{floorId}  // Table updates for specific floor
captain:{outletId}    // Captain-specific events
cashier:{outletId}    // Cashier-specific events  
kitchen:{outletId}    // Kitchen display events
station:{outletId}:{station}  // Station-specific (kitchen/bar/mocktail)
```

---

## Frontend Implementation

### 1. Install Socket.IO Client

```bash
# npm
npm install socket.io-client

# yarn
yarn add socket.io-client
```

### 2. Create Socket Service

```javascript
// src/services/socketService.js

import { io } from 'socket.io-client';

class SocketService {
  socket = null;
  listeners = new Map();

  // Initialize connection
  connect(serverUrl, token) {
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    return this.socket;
  }

  // Join rooms based on user role
  joinRooms(outletId, floorId, role = 'captain') {
    if (!this.socket) return;

    // Always join outlet room
    this.socket.emit('join:outlet', outletId);

    // Join floor room for table updates
    if (floorId) {
      this.socket.emit('join:floor', { outletId, floorId });
    }

    // Join role-specific room
    if (role === 'captain') {
      this.socket.emit('join:captain', outletId);
    } else if (role === 'cashier') {
      this.socket.emit('join:cashier', outletId);
    } else if (role === 'kitchen') {
      this.socket.emit('join:kitchen', outletId);
    }
  }

  // Leave rooms (when switching floors)
  leaveFloor(outletId, floorId) {
    if (!this.socket) return;
    this.socket.emit('leave:floor', { outletId, floorId });
  }

  // Subscribe to events
  on(event, callback) {
    if (!this.socket) return;
    this.socket.on(event, callback);
    this.listeners.set(event, callback);
  }

  // Unsubscribe from events
  off(event) {
    if (!this.socket) return;
    const callback = this.listeners.get(event);
    if (callback) {
      this.socket.off(event, callback);
      this.listeners.delete(event);
    }
  }

  // Disconnect
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new SocketService();
```

### 3. React Hook for Real-Time Tables

```javascript
// src/hooks/useRealtimeTables.js

import { useState, useEffect, useCallback } from 'react';
import socketService from '../services/socketService';
import api from '../services/api';

export function useRealtimeTables(outletId, floorId) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch initial tables
  const fetchTables = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/tables/floor/${floorId}`);
      setTables(response.data.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [floorId]);

  // Handle real-time table update
  const handleTableUpdate = useCallback((data) => {
    console.log('Table update received:', data);
    
    setTables(prevTables => 
      prevTables.map(table => {
        if (table.id === data.tableId) {
          return {
            ...table,
            status: data.status,
            session_id: data.session?.id || null,
            guest_count: data.session?.guestCount || null,
            guest_name: data.session?.guestName || null,
            current_order_id: data.orderId || null,
          };
        }
        return table;
      })
    );
  }, []);

  useEffect(() => {
    if (!outletId || !floorId) return;

    // Fetch initial data
    fetchTables();

    // Join floor room for real-time updates
    socketService.joinRooms(outletId, floorId, 'captain');

    // Subscribe to table updates
    socketService.on('table:updated', handleTableUpdate);

    // Cleanup on unmount or floor change
    return () => {
      socketService.off('table:updated');
      socketService.leaveFloor(outletId, floorId);
    };
  }, [outletId, floorId, fetchTables, handleTableUpdate]);

  return { tables, loading, error, refetch: fetchTables };
}
```

### 4. React Component Example

```jsx
// src/components/FloorView.jsx

import React, { useEffect } from 'react';
import socketService from '../services/socketService';
import { useRealtimeTables } from '../hooks/useRealtimeTables';

const SERVER_URL = 'http://localhost:3000';

function FloorView({ outletId, floorId, authToken }) {
  // Initialize socket on mount
  useEffect(() => {
    socketService.connect(SERVER_URL, authToken);
    
    return () => {
      socketService.disconnect();
    };
  }, [authToken]);

  // Get real-time tables
  const { tables, loading, error } = useRealtimeTables(outletId, floorId);

  if (loading) return <div>Loading tables...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="floor-grid">
      {tables.map(table => (
        <TableCard 
          key={table.id} 
          table={table}
        />
      ))}
    </div>
  );
}

function TableCard({ table }) {
  const statusColors = {
    available: '#22c55e',   // green
    occupied: '#f59e0b',    // amber
    billing: '#3b82f6',     // blue
    reserved: '#8b5cf6',    // purple
    blocked: '#ef4444',     // red
  };

  return (
    <div 
      className="table-card"
      style={{ 
        backgroundColor: statusColors[table.status] || '#gray',
        padding: '16px',
        borderRadius: '8px',
        margin: '8px',
      }}
    >
      <h3>{table.table_number}</h3>
      <p>Status: {table.status}</p>
      {table.guest_name && <p>Guest: {table.guest_name}</p>}
      {table.guest_count && <p>Guests: {table.guest_count}</p>}
    </div>
  );
}

export default FloorView;
```

### 5. React Native Implementation

```javascript
// src/services/socketService.js (React Native)

import { io } from 'socket.io-client';

class SocketService {
  socket = null;

  connect(serverUrl, token) {
    this.socket = io(serverUrl, {
      transports: ['websocket'], // React Native works best with websocket only
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      forceNew: true,
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });

    return this.socket;
  }

  // ... same methods as web version
}

export default new SocketService();
```

---

## Event Payloads

### table:updated

```javascript
{
  "tableId": 1,
  "floorId": 1,
  "outletId": 4,
  "status": "occupied",  // available, occupied, billing, reserved, blocked
  "session": {
    "id": 30,
    "guestCount": 4,
    "guestName": "Mr. Sharma",
    "startedAt": "2026-02-05T12:30:00.000Z"
  },
  "orderId": 35,
  "event": "session_started",  // session_started, session_ended, status_changed
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

### order:updated

```javascript
{
  "type": "order:created",  // order:created, order:updated, order:cancelled, order:paid
  "outletId": 4,
  "orderId": 35,
  "tableId": 1,
  "orderNumber": "ORD2602050001",
  "status": "pending",
  "items": [...],
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

### bill:status

```javascript
{
  "outletId": 4,
  "orderId": 35,
  "tableId": 1,
  "invoiceId": 50,
  "status": "pending",  // pending, processing, paid
  "grandTotal": 1794.37,
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

### item:ready

```javascript
{
  "outletId": 4,
  "kotId": 25,
  "kotNumber": "KOT0205001",
  "tableId": 1,
  "tableName": "T1",
  "items": [
    { "name": "Paneer Tikka", "quantity": 2 }
  ],
  "station": "kitchen",
  "timestamp": "2026-02-05T12:35:00.000Z"
}
```

---

## Complete Integration Flow

```
1. App Launch
   ├─► Connect to Socket.IO server
   ├─► Authenticate with token
   └─► Join outlet room
   
2. Floor Selection
   ├─► Fetch tables from API (initial load)
   ├─► Join floor room: socket.emit('join:floor', { outletId, floorId })
   └─► Subscribe to 'table:updated' event
   
3. Real-Time Updates
   ├─► Receive 'table:updated' event
   ├─► Update local state with new status
   └─► UI automatically re-renders
   
4. Floor Change
   ├─► Leave current floor room
   ├─► Join new floor room
   └─► Fetch new floor tables
   
5. App Close/Logout
   └─► Disconnect socket
```

---

## Testing Real-Time Updates

### Manual Test Script

```javascript
// Run in browser console or Node.js

const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  
  // Join rooms
  socket.emit('join:outlet', 4);
  socket.emit('join:floor', { outletId: 4, floorId: 1 });
  socket.emit('join:captain', 4);
  
  console.log('Joined rooms, waiting for events...');
});

// Listen for all events
socket.on('table:updated', (data) => {
  console.log('📋 TABLE UPDATE:', data);
});

socket.on('order:updated', (data) => {
  console.log('🛒 ORDER UPDATE:', data);
});

socket.on('bill:status', (data) => {
  console.log('💰 BILL STATUS:', data);
});

socket.on('item:ready', (data) => {
  console.log('🍽️ ITEM READY:', data);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

---

## Troubleshooting

### Connection Issues

1. **CORS Errors**: Ensure backend CORS config includes your frontend domain
2. **Transport Fallback**: Try polling if websocket fails
3. **Auth Errors**: Verify token is valid and passed correctly

### Events Not Received

1. **Check Room Join**: Ensure you've joined the correct room
2. **Verify Redis**: Backend needs Redis for pub/sub across instances
3. **Check Event Name**: Event is `table:updated` (not `table:update`)

### State Not Updating

1. **Immutable Updates**: Always create new object references in React
2. **Key Matching**: Ensure `tableId` matches your local state key
3. **Re-render Trigger**: Use `useState` or state management properly

---

## Summary

| Step | Action | Code |
|------|--------|------|
| 1 | Install | `npm install socket.io-client` |
| 2 | Connect | `io('http://server:3000')` |
| 3 | Join Room | `socket.emit('join:floor', { outletId, floorId })` |
| 4 | Listen | `socket.on('table:updated', callback)` |
| 5 | Update State | Update local tables array with new status |

Real-time table status is now synchronized across all devices!
