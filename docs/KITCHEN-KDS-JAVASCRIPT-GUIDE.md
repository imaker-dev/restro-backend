# Kitchen Display System (KDS) - JavaScript Implementation Guide

Complete JavaScript implementation guide for Kitchen Display System with **real-time socket events** and **polling fallback**.

---

## Overview

The Kitchen Display System receives KOTs (Kitchen Order Tickets) in real-time via WebSocket. When socket connection fails, it falls back to polling APIs.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     KITCHEN DISPLAY SYSTEM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐     PRIMARY      ┌──────────────────────────┐   │
│   │   Socket    │ ◄──────────────► │  Server (Socket.IO)      │   │
│   │  Connection │                  │  - kot:updated events    │   │
│   └─────────────┘                  └──────────────────────────┘   │
│          │                                                         │
│          │ FALLBACK (when socket fails)                           │
│          ▼                                                         │
│   ┌─────────────┐     POLLING      ┌──────────────────────────┐   │
│   │   REST API  │ ◄──────────────► │  GET /kot/active         │   │
│   │   Polling   │   (5 seconds)    │  GET /station/:station   │   │
│   └─────────────┘                  └──────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Authentication

Kitchen staff login returns a token with `outletId` embedded. All subsequent API calls use this token.

```javascript
const API_BASE = 'http://localhost:3000/api/v1';

async function loginKitchenStaff(email, password) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Store token - outletId is embedded in the token
    localStorage.setItem('token', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    return data.data;
  }
  
  throw new Error(data.message);
}

// Alternative: PIN Login for kitchen staff
async function loginWithPin(pin, outletId) {
  const response = await fetch(`${API_BASE}/auth/pin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, outletId })
  });
  
  const data = await response.json();
  
  if (data.success) {
    localStorage.setItem('token', data.data.accessToken);
    return data.data;
  }
  
  throw new Error(data.message);
}

// Get auth header for API calls
function getAuthHeader() {
  const token = localStorage.getItem('token');
  return { 'Authorization': `Bearer ${token}` };
}
```

---

## 2. Socket Connection (Primary - Real-time)

### Connect and Join Rooms

```javascript
import { io } from 'socket.io-client';

const STATION = 'kitchen'; // or 'bar', 'mocktail', 'dessert'
let socket = null;
let isSocketConnected = false;

function connectSocket() {
  const token = localStorage.getItem('token');
  
  socket = io('http://localhost:3000', {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });
  
  socket.on('connect', () => {
    console.log('Socket connected');
    isSocketConnected = true;
    
    // Join kitchen room - outletId comes from token on server
    socket.emit('join:kitchen');
    
    // Optionally join station-specific room
    socket.emit('join:station', { station: STATION });
    
    // Stop aggressive polling when socket is connected
    stopPolling();
    startBackgroundPolling(); // Slow backup polling (30s)
  });
  
  socket.on('disconnect', () => {
    console.log('Socket disconnected');
    isSocketConnected = false;
    
    // Start aggressive polling as fallback
    startPolling();
  });
  
  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    isSocketConnected = false;
    startPolling();
  });
  
  // Listen for KOT updates
  setupKotEventListeners();
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

### KOT Event Listeners

```javascript
function setupKotEventListeners() {
  // Main KOT update event
  socket.on('kot:updated', (data) => {
    console.log('KOT Event:', data.type, data.kot?.id);
    
    switch (data.type) {
      case 'kot:created':
        handleNewKot(data.kot);
        break;
        
      case 'kot:accepted':
        handleKotAccepted(data.kot);
        break;
        
      case 'kot:preparing':
        handleKotPreparing(data.kot);
        break;
        
      case 'kot:item_ready':
        handleItemReady(data.kot);
        break;
        
      case 'kot:ready':
        handleKotReady(data.kot);
        break;
        
      case 'kot:served':
        handleKotServed(data.kot);
        break;
    }
  });
}
```

### Event Handlers

```javascript
// State management
let kotsByStatus = {
  pending: [],
  accepted: [],
  preparing: [],
  ready: []
};

function handleNewKot(kot) {
  // Add to pending column
  kotsByStatus.pending.push(kot);
  
  // Play notification sound
  playNotificationSound();
  
  // Show notification
  showNotification(`New KOT: ${kot.kot_number}`, `Table ${kot.table_number}`);
  
  // Update UI
  renderKotColumn('pending');
}

function handleKotAccepted(kot) {
  // Move from pending to accepted
  moveKotBetweenColumns(kot.id, 'pending', 'accepted');
  updateKotData(kot);
  renderKotColumn('pending');
  renderKotColumn('accepted');
}

function handleKotPreparing(kot) {
  // Move from accepted to preparing
  moveKotBetweenColumns(kot.id, 'accepted', 'preparing');
  updateKotData(kot);
  startKotTimer(kot.id);
  renderKotColumn('accepted');
  renderKotColumn('preparing');
}

function handleItemReady(kot) {
  // Update item status within KOT
  updateKotData(kot);
  highlightReadyItems(kot.id, kot.items.filter(i => i.status === 'ready'));
  renderKotCard(kot.id);
}

function handleKotReady(kot) {
  // Move from preparing to ready
  moveKotBetweenColumns(kot.id, 'preparing', 'ready');
  updateKotData(kot);
  stopKotTimer(kot.id);
  
  // Ring pickup bell
  ringPickupBell();
  
  renderKotColumn('preparing');
  renderKotColumn('ready');
}

function handleKotServed(kot) {
  // Remove from ready column
  removeKotFromColumn(kot.id, 'ready');
  renderKotColumn('ready');
}

// Helper functions
function moveKotBetweenColumns(kotId, fromStatus, toStatus) {
  const index = kotsByStatus[fromStatus].findIndex(k => k.id === kotId);
  if (index !== -1) {
    const [kot] = kotsByStatus[fromStatus].splice(index, 1);
    kotsByStatus[toStatus].push(kot);
  }
}

function updateKotData(newKotData) {
  for (const status in kotsByStatus) {
    const index = kotsByStatus[status].findIndex(k => k.id === newKotData.id);
    if (index !== -1) {
      kotsByStatus[status][index] = { ...kotsByStatus[status][index], ...newKotData };
      break;
    }
  }
}

function removeKotFromColumn(kotId, status) {
  kotsByStatus[status] = kotsByStatus[status].filter(k => k.id !== kotId);
}
```

---

## 3. Polling APIs (Fallback)

### API Client Setup

```javascript
const api = {
  async get(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: getAuthHeader()
    });
    return response.json();
  },
  
  async post(endpoint, body = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return response.json();
  }
};
```

### Polling Implementation

```javascript
const STATION = 'kitchen';
let pollInterval = null;
let backgroundPollInterval = null;

// Aggressive polling (when socket is down)
function startPolling() {
  stopPolling();
  console.log('Starting polling (5s interval)');
  pollKots(); // Immediate first poll
  pollInterval = setInterval(pollKots, 5000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Background polling (when socket is connected, as backup)
function startBackgroundPolling() {
  stopBackgroundPolling();
  backgroundPollInterval = setInterval(pollKots, 30000);
}

function stopBackgroundPolling() {
  if (backgroundPollInterval) {
    clearInterval(backgroundPollInterval);
    backgroundPollInterval = null;
  }
}

// Main polling function
async function pollKots() {
  try {
    // Option 1: Get all active KOTs at once
    const response = await api.get(`/orders/kot/active?station=${STATION}`);
    
    if (response.success) {
      syncKotsWithPolledData(response.data);
    }
    
  } catch (error) {
    console.error('Polling error:', error);
  }
}

// Alternative: Poll by status for better UI updates
async function pollKotsByStatus() {
  try {
    const [pendingRes, preparingRes, readyRes] = await Promise.all([
      api.get(`/orders/kot/active?station=${STATION}&status=pending`),
      api.get(`/orders/kot/active?station=${STATION}&status=preparing`),
      api.get(`/orders/kot/active?station=${STATION}&status=ready`)
    ]);
    
    if (pendingRes.success) syncColumn('pending', pendingRes.data);
    if (preparingRes.success) syncColumn('preparing', preparingRes.data);
    if (readyRes.success) syncColumn('ready', readyRes.data);
    
  } catch (error) {
    console.error('Polling error:', error);
  }
}

// Sync polled data with current state
function syncKotsWithPolledData(polledKots) {
  const previousIds = new Set(
    Object.values(kotsByStatus).flat().map(k => k.id)
  );
  const currentIds = new Set(polledKots.map(k => k.id));
  
  // Find new KOTs
  polledKots.forEach(kot => {
    if (!previousIds.has(kot.id)) {
      handleNewKot(kot);
    }
  });
  
  // Find removed KOTs (served)
  previousIds.forEach(id => {
    if (!currentIds.has(id)) {
      // KOT was served, remove it
      for (const status in kotsByStatus) {
        removeKotFromColumn(id, status);
      }
    }
  });
  
  // Update existing KOTs
  polledKots.forEach(kot => {
    const currentStatus = findKotStatus(kot.id);
    if (currentStatus && currentStatus !== kot.status) {
      // Status changed
      moveKotBetweenColumns(kot.id, currentStatus, kot.status);
    }
    updateKotData(kot);
  });
  
  // Re-render all columns
  Object.keys(kotsByStatus).forEach(renderKotColumn);
}

function syncColumn(status, kots) {
  const previous = new Set(kotsByStatus[status].map(k => k.id));
  const current = new Set(kots.map(k => k.id));
  
  // New KOTs in this status
  kots.forEach(kot => {
    if (!previous.has(kot.id)) {
      if (status === 'pending') {
        handleNewKot(kot);
      } else {
        kotsByStatus[status].push(kot);
      }
    } else {
      updateKotData(kot);
    }
  });
  
  // KOTs moved out of this status
  previous.forEach(id => {
    if (!current.has(id)) {
      removeKotFromColumn(id, status);
    }
  });
  
  renderKotColumn(status);
}

function findKotStatus(kotId) {
  for (const status in kotsByStatus) {
    if (kotsByStatus[status].some(k => k.id === kotId)) {
      return status;
    }
  }
  return null;
}
```

### Get Station Dashboard (Alternative Polling)

```javascript
async function pollStationDashboard() {
  try {
    const response = await api.get(`/orders/station/${STATION}`);
    
    if (response.success) {
      const { kots, stats } = response.data;
      
      // Update stats display
      updateStatsDisplay(stats);
      
      // Sync KOTs
      syncKotsWithPolledData(kots);
    }
  } catch (error) {
    console.error('Dashboard poll error:', error);
  }
}

function updateStatsDisplay(stats) {
  document.getElementById('pending-count').textContent = stats.pending_count;
  document.getElementById('preparing-count').textContent = stats.preparing_count;
  document.getElementById('ready-count').textContent = stats.ready_count;
  document.getElementById('avg-prep-time').textContent = `${Math.round(stats.avg_prep_time)} min`;
}
```

---

## 4. KOT Actions (Kitchen Staff)

### Accept KOT

```javascript
async function acceptKot(kotId) {
  try {
    const response = await api.post(`/orders/kot/${kotId}/accept`);
    
    if (response.success) {
      // If socket connected, update will come via event
      // If polling, manually update
      if (!isSocketConnected) {
        handleKotAccepted(response.data);
      }
    } else {
      showError(response.message);
    }
  } catch (error) {
    showError('Failed to accept KOT');
  }
}
```

### Start Preparing

```javascript
async function startPreparingKot(kotId) {
  try {
    const response = await api.post(`/orders/kot/${kotId}/preparing`);
    
    if (response.success) {
      if (!isSocketConnected) {
        handleKotPreparing(response.data);
      }
    } else {
      showError(response.message);
    }
  } catch (error) {
    showError('Failed to start preparing');
  }
}
```

### Mark Single Item Ready

```javascript
async function markItemReady(itemId) {
  try {
    const response = await api.post(`/orders/kot/items/${itemId}/ready`);
    
    if (response.success) {
      if (!isSocketConnected) {
        handleItemReady(response.data);
      }
    } else {
      showError(response.message);
    }
  } catch (error) {
    showError('Failed to mark item ready');
  }
}
```

### Mark Entire KOT Ready

```javascript
async function markKotReady(kotId) {
  try {
    const response = await api.post(`/orders/kot/${kotId}/ready`);
    
    if (response.success) {
      if (!isSocketConnected) {
        handleKotReady(response.data);
      }
    } else {
      showError(response.message);
    }
  } catch (error) {
    showError('Failed to mark KOT ready');
  }
}
```

---

## 5. Complete KDS Application

### Initialization

```javascript
class KitchenDisplaySystem {
  constructor(station = 'kitchen') {
    this.station = station;
    this.socket = null;
    this.isConnected = false;
    this.pollInterval = null;
    this.kotsByStatus = {
      pending: [],
      accepted: [],
      preparing: [],
      ready: []
    };
  }
  
  async init() {
    // Check if already logged in
    const token = localStorage.getItem('token');
    if (!token) {
      this.showLoginScreen();
      return;
    }
    
    // Load initial data via polling
    await this.loadInitialData();
    
    // Connect socket for real-time updates
    this.connectSocket();
    
    // Start background polling as backup
    this.startBackgroundPolling();
    
    // Render initial UI
    this.renderAllColumns();
  }
  
  async loadInitialData() {
    try {
      const response = await api.get(`/orders/kot/active?station=${this.station}`);
      if (response.success) {
        // Group KOTs by status
        response.data.forEach(kot => {
          if (this.kotsByStatus[kot.status]) {
            this.kotsByStatus[kot.status].push(kot);
          }
        });
      }
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  }
  
  connectSocket() {
    // ... socket connection code from Section 2
  }
  
  startBackgroundPolling() {
    this.pollInterval = setInterval(() => this.pollKots(), 30000);
  }
  
  async pollKots() {
    // ... polling code from Section 3
  }
  
  renderAllColumns() {
    ['pending', 'accepted', 'preparing', 'ready'].forEach(status => {
      this.renderColumn(status);
    });
  }
  
  renderColumn(status) {
    const container = document.getElementById(`${status}-column`);
    container.innerHTML = this.kotsByStatus[status]
      .map(kot => this.renderKotCard(kot))
      .join('');
  }
  
  renderKotCard(kot) {
    return `
      <div class="kot-card" data-kot-id="${kot.id}">
        <div class="kot-header">
          <span class="kot-number">${kot.kot_number}</span>
          <span class="table-number">Table ${kot.table_number}</span>
        </div>
        <div class="kot-items">
          ${kot.items.map(item => `
            <div class="kot-item ${item.status === 'ready' ? 'item-ready' : ''}">
              <span class="quantity">${item.quantity}x</span>
              <span class="item-name">${item.item_name}</span>
              ${item.special_instructions ? `<span class="instructions">${item.special_instructions}</span>` : ''}
              ${kot.status === 'preparing' ? `
                <button onclick="kds.markItemReady(${item.id})">Ready</button>
              ` : ''}
            </div>
          `).join('')}
        </div>
        <div class="kot-actions">
          ${this.getActionButtons(kot)}
        </div>
        <div class="kot-timer" id="timer-${kot.id}"></div>
      </div>
    `;
  }
  
  getActionButtons(kot) {
    switch (kot.status) {
      case 'pending':
        return `<button onclick="kds.acceptKot(${kot.id})">Accept</button>`;
      case 'accepted':
        return `<button onclick="kds.startPreparing(${kot.id})">Start Cooking</button>`;
      case 'preparing':
        return `<button onclick="kds.markReady(${kot.id})">All Ready</button>`;
      case 'ready':
        return `<span class="waiting">Waiting for pickup...</span>`;
      default:
        return '';
    }
  }
  
  // Action methods
  async acceptKot(kotId) { /* ... */ }
  async startPreparing(kotId) { /* ... */ }
  async markItemReady(itemId) { /* ... */ }
  async markReady(kotId) { /* ... */ }
}

// Initialize
const kds = new KitchenDisplaySystem('kitchen');
kds.init();
```

---

## 6. API Reference (Quick)

### Polling APIs (No outletId needed - from token)

| Endpoint | Description |
|----------|-------------|
| `GET /orders/kot/active` | All active KOTs |
| `GET /orders/kot/active?status=pending` | Only pending KOTs |
| `GET /orders/kot/active?status=preparing` | Only preparing KOTs |
| `GET /orders/kot/active?status=ready` | Only ready KOTs |
| `GET /orders/kot/active?station=kitchen` | Only kitchen station |
| `GET /orders/station/:station` | Station dashboard with stats |
| `GET /orders/kot/:id` | Single KOT details |

### Action APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/orders/kot/:id/accept` | POST | Accept KOT |
| `/orders/kot/:id/preparing` | POST | Start preparing |
| `/orders/kot/items/:itemId/ready` | POST | Mark single item ready |
| `/orders/kot/:id/ready` | POST | Mark entire KOT ready |

### Socket Events

| Event | Type | Description |
|-------|------|-------------|
| `kot:updated` | `kot:created` | New KOT arrived |
| `kot:updated` | `kot:accepted` | KOT accepted |
| `kot:updated` | `kot:preparing` | KOT cooking started |
| `kot:updated` | `kot:item_ready` | Single item ready |
| `kot:updated` | `kot:ready` | Entire KOT ready |
| `kot:updated` | `kot:served` | KOT picked up |

---

## 7. Testing

Run the test scripts to verify the implementation:

```bash
# Test socket events and status transitions
node src/tests/test-kot-socket-events.js

# Test polling APIs
node src/tests/test-kot-polling-apis.js
```
