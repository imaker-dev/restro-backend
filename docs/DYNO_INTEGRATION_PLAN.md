# Swiggy & Zomato Integration via Dyno APIs

## Executive Summary

This document outlines the complete integration architecture for connecting your POS system with Swiggy and Zomato food delivery platforms through Dyno APIs middleware.

---

## 1. Current POS Architecture Analysis

### 1.1 Order Workflow (Existing)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Captain   │───▶│ Create Order│───▶│  Add Items  │───▶│  Send KOT   │
│  (Dine-in)  │    │  (pending)  │    │  (pending)  │    │ (confirmed) │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
       ┌───────────────────────────────────────────────────────┘
       ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Kitchen   │───▶│  Preparing  │───▶│    Ready    │───▶│   Served    │
│  Receives   │    │   Status    │    │   Status    │    │   Status    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                               │
       ┌───────────────────────────────────────────────────────┘
       ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Generate   │───▶│   Payment   │───▶│  Completed  │
│    Bill     │    │  Received   │    │   Order     │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 1.2 Order Types Supported
- `dine_in` - Table-based orders
- `takeaway` - Counter pickup
- `delivery` - Self-delivery
- `online` - Third-party aggregators (NEW - to be enhanced)

### 1.3 Order Status Lifecycle
```
pending → confirmed → preparing → ready → served → billed → paid/completed → cancelled
```

### 1.4 KOT/BOT Routing (Existing)
- Items route to stations based on `kitchen_station_id` or `counter_id`
- Stations: kitchen, bar, dessert, mocktail, tandoor, wok, grill
- Real-time WebSocket events via Redis pub/sub
- Direct TCP printing to thermal printers

---

## 2. Dyno APIs Integration Architecture

### 2.1 High-Level Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Customer   │───▶│   Swiggy/    │───▶│  Dyno APIs   │
│   Orders     │    │   Zomato     │    │  Middleware  │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                    ┌──────────────────────────┘
                    │ Webhook / Polling
                    ▼
┌──────────────────────────────────────────────────────────────┐
│                      POS BACKEND                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │  Webhook    │  │   Order     │  │    KOT      │           │
│  │  Handler    │─▶│   Service   │─▶│   Service   │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
│         │                │                │                   │
│         ▼                ▼                ▼                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │  Validate   │  │  Map Items  │  │   Print &   │           │
│  │  & Log      │  │  & Create   │  │   Notify    │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└──────────────────────────────────────────────────────────────┘
                    │
                    │ Status Updates
                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Dyno APIs   │───▶│   Swiggy/    │───▶│   Customer   │
│  Status API  │    │   Zomato     │    │   Notified   │
└──────────────┘    └──────────────┘    └──────────────┘
```

### 2.2 Integration Methods

#### Option A: Webhook (Recommended)
- Dyno pushes orders to POS endpoint
- Real-time, immediate order receipt
- Requires public endpoint or tunnel

#### Option B: Polling
- POS polls Dyno API periodically (every 30-60 seconds)
- Works behind firewalls
- Slight delay in order receipt

#### Option C: Hybrid (Best)
- Webhook for immediate orders
- Polling as fallback for missed webhooks
- Maximum reliability

---

## 3. Database Schema Changes

### 3.1 New Tables

```sql
-- =====================================================
-- ONLINE ORDER INTEGRATION TABLES
-- Migration: 030_online_order_integration.sql
-- =====================================================

-- Integration Channels (Swiggy, Zomato, etc.)
CREATE TABLE IF NOT EXISTS integration_channels (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    channel_name ENUM('swiggy', 'zomato', 'uber_eats', 'dunzo', 'other') NOT NULL,
    channel_display_name VARCHAR(50) NOT NULL,
    
    -- Dyno API Credentials
    dyno_order_id VARCHAR(50),           -- DA202602245543816450
    dyno_access_token VARCHAR(100),       -- From Dyno dashboard
    property_id VARCHAR(50),              -- Swiggy/Zomato restaurant ID
    property_name VARCHAR(100),
    property_area VARCHAR(100),
    
    -- Webhook Configuration
    webhook_secret VARCHAR(255),          -- For signature verification
    webhook_url VARCHAR(255),             -- Callback URL (our endpoint)
    
    -- Settings
    is_active BOOLEAN DEFAULT TRUE,
    auto_accept_orders BOOLEAN DEFAULT FALSE,
    auto_print_kot BOOLEAN DEFAULT TRUE,
    default_prep_time INT DEFAULT 20,     -- Minutes
    
    -- Sync Status
    last_sync_at DATETIME,
    sync_status ENUM('active', 'error', 'paused') DEFAULT 'active',
    sync_error_message TEXT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_outlet_channel (outlet_id, channel_name),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_channel_active (is_active, channel_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Online Orders (External Order Tracking)
CREATE TABLE IF NOT EXISTS online_orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    channel_id BIGINT UNSIGNED NOT NULL,
    pos_order_id BIGINT UNSIGNED,         -- Link to orders table
    
    -- External IDs
    external_order_id VARCHAR(100) NOT NULL,  -- Swiggy/Zomato order ID
    dyno_order_id VARCHAR(100),               -- Dyno's internal ID
    
    -- Platform Info
    platform ENUM('swiggy', 'zomato', 'uber_eats', 'dunzo', 'other') NOT NULL,
    platform_order_number VARCHAR(50),
    
    -- Customer Info (from platform)
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    customer_address TEXT,
    customer_instructions TEXT,
    
    -- Order Details
    order_type ENUM('delivery', 'pickup') DEFAULT 'delivery',
    payment_method ENUM('prepaid', 'cod', 'wallet') NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    
    -- Amounts (from platform)
    item_total DECIMAL(12,2) DEFAULT 0,
    platform_discount DECIMAL(12,2) DEFAULT 0,
    delivery_charge DECIMAL(12,2) DEFAULT 0,
    packaging_charge DECIMAL(12,2) DEFAULT 0,
    taxes DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    
    -- Timing
    order_placed_at DATETIME,
    estimated_delivery_at DATETIME,
    accepted_at DATETIME,
    food_ready_at DATETIME,
    picked_up_at DATETIME,
    delivered_at DATETIME,
    cancelled_at DATETIME,
    
    -- Status Tracking
    platform_status VARCHAR(50),          -- Original status from platform
    pos_status ENUM('received', 'accepted', 'rejected', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled') DEFAULT 'received',
    last_status_sync_at DATETIME,
    
    -- Cancellation
    cancel_reason VARCHAR(255),
    cancelled_by ENUM('restaurant', 'customer', 'platform'),
    
    -- Raw Data
    raw_order_data JSON,                  -- Store original webhook payload
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_external_order (channel_id, external_order_id),
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES integration_channels(id) ON DELETE CASCADE,
    FOREIGN KEY (pos_order_id) REFERENCES orders(id) ON DELETE SET NULL,
    INDEX idx_online_orders_outlet (outlet_id),
    INDEX idx_online_orders_platform (platform),
    INDEX idx_online_orders_status (pos_status),
    INDEX idx_online_orders_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Channel Menu Mapping (Map external items to POS items)
CREATE TABLE IF NOT EXISTS channel_menu_mapping (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    channel_id BIGINT UNSIGNED NOT NULL,
    
    -- External Item
    external_item_id VARCHAR(100) NOT NULL,
    external_item_name VARCHAR(200),
    external_variant_id VARCHAR(100),
    external_variant_name VARCHAR(100),
    external_addon_id VARCHAR(100),
    external_addon_name VARCHAR(100),
    
    -- POS Item
    pos_item_id BIGINT UNSIGNED,
    pos_variant_id BIGINT UNSIGNED,
    pos_addon_id BIGINT UNSIGNED,
    
    -- Mapping Status
    is_mapped BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT TRUE,
    
    -- Audit
    mapped_by BIGINT UNSIGNED,
    mapped_at DATETIME,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_channel_external_item (channel_id, external_item_id, external_variant_id, external_addon_id),
    FOREIGN KEY (channel_id) REFERENCES integration_channels(id) ON DELETE CASCADE,
    FOREIGN KEY (pos_item_id) REFERENCES items(id) ON DELETE SET NULL,
    FOREIGN KEY (pos_variant_id) REFERENCES variants(id) ON DELETE SET NULL,
    FOREIGN KEY (pos_addon_id) REFERENCES addons(id) ON DELETE SET NULL,
    INDEX idx_mapping_item (pos_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Integration Logs (Audit Trail)
CREATE TABLE IF NOT EXISTS integration_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    outlet_id BIGINT UNSIGNED NOT NULL,
    channel_id BIGINT UNSIGNED,
    online_order_id BIGINT UNSIGNED,
    
    -- Log Details
    log_type ENUM('webhook_received', 'order_created', 'status_update', 'status_sync', 'error', 'retry', 'menu_sync') NOT NULL,
    direction ENUM('inbound', 'outbound') NOT NULL,
    
    -- Request/Response
    endpoint VARCHAR(255),
    method VARCHAR(10),
    request_headers JSON,
    request_body JSON,
    response_status INT,
    response_body JSON,
    
    -- Status
    status ENUM('success', 'failed', 'pending') DEFAULT 'pending',
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    -- Timing
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    duration_ms INT,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES integration_channels(id) ON DELETE SET NULL,
    FOREIGN KEY (online_order_id) REFERENCES online_orders(id) ON DELETE SET NULL,
    INDEX idx_logs_outlet (outlet_id),
    INDEX idx_logs_type (log_type),
    INDEX idx_logs_status (status),
    INDEX idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add source field to orders table
ALTER TABLE orders
ADD COLUMN source ENUM('pos', 'swiggy', 'zomato', 'uber_eats', 'dunzo', 'other') DEFAULT 'pos' AFTER order_type,
ADD COLUMN external_order_id VARCHAR(100) AFTER source,
ADD COLUMN online_order_id BIGINT UNSIGNED AFTER external_order_id,
ADD INDEX idx_orders_source (source),
ADD INDEX idx_orders_external (external_order_id);
```

### 3.2 Orders Table Enhancement

| Column | Type | Description |
|--------|------|-------------|
| `source` | ENUM | 'pos', 'swiggy', 'zomato', etc. |
| `external_order_id` | VARCHAR(100) | Platform's order ID |
| `online_order_id` | BIGINT | FK to online_orders table |

---

## 4. Service Architecture

### 4.1 New Services Required

```
src/
├── services/
│   ├── dyno.service.js           # Dyno API client
│   ├── onlineOrder.service.js    # Online order processing
│   └── channelSync.service.js    # Menu & status sync
├── controllers/
│   └── integration.controller.js  # Webhook & API handlers
├── routes/
│   └── integration.routes.js      # Integration endpoints
├── middleware/
│   └── webhookAuth.js            # Webhook verification
└── jobs/
    ├── orderPolling.job.js       # Poll for new orders
    └── statusSync.job.js         # Sync status to Dyno
```

### 4.2 Service Responsibilities

#### dyno.service.js
```javascript
// Core Dyno API interactions
- authenticate(accessToken)
- getNewOrders(channelId)
- updateOrderStatus(orderId, status)
- syncMenuAvailability(items)
- verifyWebhookSignature(payload, signature)
```

#### onlineOrder.service.js
```javascript
// Online order lifecycle management
- processIncomingOrder(webhookPayload)
- mapExternalItems(items, channelId)
- createPosOrder(onlineOrder)
- acceptOrder(onlineOrderId)
- rejectOrder(onlineOrderId, reason)
- markReady(onlineOrderId)
- markDispatched(onlineOrderId)
```

---

## 5. API Endpoints

### 5.1 Webhook Endpoint (Inbound)

```
POST /api/v1/integrations/dyno/webhook
```

**Headers:**
```
X-Dyno-Signature: <HMAC-SHA256 signature>
X-Dyno-Timestamp: <Unix timestamp>
Content-Type: application/json
```

**Payload (New Order):**
```json
{
  "event": "order.new",
  "timestamp": "2026-03-07T10:30:00Z",
  "data": {
    "platform": "swiggy",
    "external_order_id": "SWG123456789",
    "dyno_order_id": "DYNO_ABC123",
    "restaurant_id": "RES_123",
    "customer": {
      "name": "John Doe",
      "phone": "+919876543210",
      "address": "123 Main St, City",
      "instructions": "Ring doorbell twice"
    },
    "items": [
      {
        "external_item_id": "ITEM_001",
        "name": "Butter Chicken",
        "variant_id": "VAR_HALF",
        "variant_name": "Half",
        "quantity": 2,
        "unit_price": 250,
        "total_price": 500,
        "addons": [
          {
            "addon_id": "ADD_001",
            "name": "Extra Gravy",
            "price": 30
          }
        ],
        "instructions": "Less spicy"
      }
    ],
    "payment": {
      "method": "prepaid",
      "is_paid": true,
      "item_total": 500,
      "taxes": 25,
      "delivery_charge": 40,
      "packaging_charge": 20,
      "discount": 50,
      "total": 535
    },
    "timing": {
      "placed_at": "2026-03-07T10:30:00Z",
      "expected_delivery": "2026-03-07T11:00:00Z"
    }
  }
}
```

### 5.2 Status Update Endpoint (Outbound)

```
POST https://api.dynoapis.com/v1/orders/{orderId}/status
```

**Request:**
```json
{
  "status": "preparing",
  "estimated_ready_time": "2026-03-07T10:45:00Z",
  "message": "Order is being prepared"
}
```

**Status Values:**
| POS Status | Dyno Status | Description |
|------------|-------------|-------------|
| received | RECEIVED | Order received in POS |
| accepted | ACCEPTED | Restaurant accepted |
| preparing | PREPARING | Kitchen started prep |
| ready | READY_FOR_PICKUP | Food ready |
| picked_up | DISPATCHED | Delivery partner picked up |
| delivered | DELIVERED | Order delivered |
| cancelled | CANCELLED | Order cancelled |

### 5.3 Management Endpoints

```
# Channel Management
GET    /api/v1/integrations/channels                    # List channels
POST   /api/v1/integrations/channels                    # Add channel
PUT    /api/v1/integrations/channels/:id                # Update channel
DELETE /api/v1/integrations/channels/:id                # Remove channel

# Menu Mapping
GET    /api/v1/integrations/channels/:id/menu-mapping   # Get mappings
POST   /api/v1/integrations/channels/:id/menu-mapping   # Map item
PUT    /api/v1/integrations/menu-mapping/:id            # Update mapping
POST   /api/v1/integrations/channels/:id/sync-menu      # Trigger menu sync

# Online Orders
GET    /api/v1/integrations/orders                      # List online orders
GET    /api/v1/integrations/orders/:id                  # Get order details
POST   /api/v1/integrations/orders/:id/accept           # Accept order
POST   /api/v1/integrations/orders/:id/reject           # Reject order
POST   /api/v1/integrations/orders/:id/ready            # Mark ready
POST   /api/v1/integrations/orders/:id/dispatch         # Mark dispatched

# Logs & Debugging
GET    /api/v1/integrations/logs                        # View logs
POST   /api/v1/integrations/test-webhook                # Test webhook
```

---

## 6. Online Order Processing Flow

### 6.1 Order Receipt Flow

```
1. Dyno Webhook → POST /api/v1/integrations/dyno/webhook
   │
2. Verify Signature → webhookAuth middleware
   │
3. Parse & Validate → Joi validation
   │
4. Log Inbound → integration_logs (webhook_received)
   │
5. Create online_orders record
   │
6. Map Items → channel_menu_mapping
   │   ├── All mapped? → Continue
   │   └── Unmapped items? → Alert admin, use item name
   │
7. Create POS Order
   │   ├── order_type: 'delivery'
   │   ├── source: 'swiggy' / 'zomato'
   │   ├── external_order_id: platform order ID
   │   ├── No table_id (delivery order)
   │   ├── No captain (system created)
   │   └── created_by: system user ID
   │
8. Auto-Generate KOT (if auto_print_kot = true)
   │   ├── Route to correct stations
   │   ├── Label: "🟠 ONLINE ORDER (SWIGGY)"
   │   └── Print to kitchen printers
   │
9. Emit WebSocket Events
   │   ├── 'online_order:new' → Dashboard
   │   ├── 'kot:created' → Kitchen displays
   │   └── 'order:created' → Order management
   │
10. Update Status to Dyno → 'ACCEPTED'
    │
11. Log Outbound → integration_logs (status_update)
```

### 6.2 KOT Labeling for Online Orders

```
┌────────────────────────────────────┐
│    🟠 ONLINE ORDER - SWIGGY       │
│    ═══════════════════════════    │
│    KOT#: KOT0307001               │
│    Order: SWG123456789            │
│    Time: 10:35 AM                 │
│    ──────────────────────────     │
│    2 x Butter Chicken (Half)      │
│       + Extra Gravy               │
│       >> Less spicy               │
│    1 x Naan                       │
│    ──────────────────────────     │
│    Customer: John D.              │
│    Delivery By: 11:00 AM          │
│    ──────────────────────────     │
└────────────────────────────────────┘
```

---

## 7. Status Synchronization

### 7.1 Status Flow Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│                    POS ORDER STATUS FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Online Order Received]                                         │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │  RECEIVED   │ ──────────────▶ Dyno: RECEIVED                 │
│  └─────────────┘                                                │
│         │                                                        │
│         ▼ (Auto or Manual Accept)                               │
│  ┌─────────────┐                                                │
│  │  ACCEPTED   │ ──────────────▶ Dyno: ACCEPTED                 │
│  │  (pending)  │                                                │
│  └─────────────┘                                                │
│         │                                                        │
│         ▼ (KOT Sent)                                            │
│  ┌─────────────┐                                                │
│  │ PREPARING   │ ──────────────▶ Dyno: PREPARING                │
│  │ (confirmed) │                                                │
│  └─────────────┘                                                │
│         │                                                        │
│         ▼ (Kitchen marks ready)                                 │
│  ┌─────────────┐                                                │
│  │    READY    │ ──────────────▶ Dyno: READY_FOR_PICKUP         │
│  │   (ready)   │                                                │
│  └─────────────┘                                                │
│         │                                                        │
│         ▼ (Delivery partner picks up)                           │
│  ┌─────────────┐                                                │
│  │  PICKED_UP  │ ──────────────▶ Dyno: DISPATCHED               │
│  │  (served)   │                                                │
│  └─────────────┘                                                │
│         │                                                        │
│         ▼ (Confirmed delivery)                                  │
│  ┌─────────────┐                                                │
│  │  DELIVERED  │ ──────────────▶ Dyno: DELIVERED                │
│  │ (completed) │                                                │
│  └─────────────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Sync Job (Background)

```javascript
// jobs/statusSync.job.js
// Runs every 60 seconds

1. Get all online_orders where:
   - pos_status changed since last_status_sync_at
   - last_status_sync_at is NULL or older than 5 minutes

2. For each order:
   - Map POS status to Dyno status
   - Call Dyno API to update
   - Log result
   - Update last_status_sync_at
```

---

## 8. Error Handling

### 8.1 Scenarios & Responses

| Scenario | Handling |
|----------|----------|
| **Item not mapped** | Create order with item name from platform, flag for review |
| **Webhook retry** | Idempotency check via external_order_id |
| **POS server offline** | Dyno retries webhook, or use polling fallback |
| **Duplicate order** | Check external_order_id uniqueness, reject duplicate |
| **Cancelled from platform** | Receive cancel webhook, void order, print cancel slip |
| **Status sync failure** | Retry with exponential backoff, alert after 3 failures |
| **Invalid webhook signature** | Reject with 401, log security event |

### 8.2 Retry Strategy

```javascript
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,  // 1 second
  maxDelay: 30000,     // 30 seconds
  backoffMultiplier: 2
};
```

---

## 9. Security Implementation

### 9.1 Webhook Verification

```javascript
// middleware/webhookAuth.js

function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-dyno-signature'];
  const timestamp = req.headers['x-dyno-timestamp'];
  const body = JSON.stringify(req.body);
  
  // Prevent replay attacks (5 minute window)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return res.status(401).json({ error: 'Webhook timestamp expired' });
  }
  
  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.DYNO_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  
  next();
}
```

### 9.2 IP Allowlist (Optional)

```javascript
const DYNO_IP_ALLOWLIST = [
  '52.66.xxx.xxx',    // Dyno production
  '13.127.xxx.xxx',   // Dyno backup
];

function ipAllowlist(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress;
  if (!DYNO_IP_ALLOWLIST.includes(clientIp)) {
    return res.status(403).json({ error: 'IP not allowed' });
  }
  next();
}
```

---

## 10. Real-time & Fallback

### 10.1 WebSocket Events

```javascript
// New online order received
socket.emit('online_order:new', {
  id: onlineOrderId,
  platform: 'swiggy',
  orderNumber: 'SWG123456789',
  items: [...],
  customer: {...},
  estimatedDelivery: '11:00 AM'
});

// Online order status changed
socket.emit('online_order:status', {
  id: onlineOrderId,
  status: 'preparing',
  timestamp: new Date()
});
```

### 10.2 Kitchen Display Fallback

```javascript
// If WebSocket fails, kitchen screens poll:
GET /api/v1/orders/online/active?outletId=43

// Returns all active online orders
{
  "success": true,
  "data": [
    {
      "id": 1,
      "platform": "swiggy",
      "orderNumber": "SWG123456789",
      "status": "preparing",
      "items": [...],
      "estimatedDelivery": "2026-03-07T11:00:00Z"
    }
  ]
}
```

---

## 11. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Database migrations
- [ ] Core services (dyno.service.js, onlineOrder.service.js)
- [ ] Webhook endpoint with signature verification
- [ ] Basic order creation from webhook

### Phase 2: KOT Integration (Week 2-3)
- [ ] Online order KOT formatting
- [ ] Station routing for online orders
- [ ] Kitchen display labeling
- [ ] Print integration

### Phase 3: Status Sync (Week 3-4)
- [ ] Status update API calls
- [ ] Background sync job
- [ ] Retry mechanism
- [ ] Error logging

### Phase 4: Menu Mapping (Week 4-5)
- [ ] Admin UI for menu mapping
- [ ] Bulk import/export
- [ ] Item availability sync

### Phase 5: Testing & Polish (Week 5-6)
- [ ] End-to-end testing
- [ ] Load testing
- [ ] Error scenario testing
- [ ] Documentation

---

## 12. Configuration

### 12.1 Environment Variables

```env
# Dyno API Configuration
DYNO_API_BASE_URL=https://api.dynoapis.com/v1
DYNO_WEBHOOK_SECRET=your-webhook-secret
DYNO_API_TIMEOUT=30000

# Feature Flags
ONLINE_ORDERS_ENABLED=true
AUTO_ACCEPT_ONLINE_ORDERS=false
AUTO_PRINT_ONLINE_KOT=true

# Polling Configuration (if used)
DYNO_POLLING_INTERVAL=60000
DYNO_POLLING_ENABLED=false
```

### 12.2 Channel Setup in Database

```sql
INSERT INTO integration_channels (
  outlet_id, channel_name, channel_display_name,
  dyno_order_id, dyno_access_token, property_id,
  property_name, property_area, is_active
) VALUES (
  43, 'swiggy', 'Swiggy',
  'DA202602245543816450', '827870a61e064d798703a6ef1911071f', 'PROP_SWIGGY_001',
  'Restaurant Name', 'City Area', TRUE
);
```

---

## 13. Testing Checklist

### 13.1 Unit Tests
- [ ] Webhook signature verification
- [ ] Item mapping logic
- [ ] Status mapping
- [ ] Order creation

### 13.2 Integration Tests
- [ ] End-to-end webhook flow
- [ ] KOT generation
- [ ] Status sync to Dyno
- [ ] Error handling scenarios

### 13.3 Manual Testing
- [ ] Receive test order from Dyno
- [ ] Verify KOT prints correctly
- [ ] Kitchen display shows online order
- [ ] Status updates reflect in platform

---

## 14. Monitoring & Alerts

### 14.1 Metrics to Track
- Webhook response time
- Order processing time
- Status sync success rate
- Failed mappings count
- Error rate by type

### 14.2 Alert Conditions
- Webhook failures > 5 in 10 minutes
- Status sync lag > 5 minutes
- Unmapped items in order
- Channel connection lost

---

## 15. Summary

This integration plan provides a complete framework for connecting your POS with Swiggy and Zomato via Dyno APIs. The key principles are:

1. **Never direct communication** - All traffic through Dyno middleware
2. **Idempotent operations** - Handle retries gracefully
3. **Real-time + fallback** - WebSocket primary, polling backup
4. **Complete audit trail** - Log everything
5. **Graceful degradation** - Online orders work even with partial mapping

**Next Steps:**
1. Review and approve this plan
2. Create database migration
3. Implement core services
4. Set up test channel in Dyno
5. Begin phased implementation
