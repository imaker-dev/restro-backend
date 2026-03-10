# Dyno APIs - Step by Step Integration Guide

> **Based on Dyno API Documentation v2.0.19**

## Overview

This guide explains the complete flow of how orders come from Swiggy/Zomato through Dyno APIs to your POS system.

---

## Part 1: Understanding the Flow

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE ORDER FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Customer orders on Swiggy/Zomato app                               │
│     │                                                                        │
│     ▼                                                                        │
│  STEP 2: Swiggy/Zomato sends order to Dyno APIs                             │
│     │    (Dyno is connected to your restaurant on these platforms)          │
│     │                                                                        │
│     ▼                                                                        │
│  STEP 3: Dyno APIs calls YOUR webhook URL                                   │
│     │    POST https://your-server.com/api/v1/integrations/dyno/webhook      │
│     │                                                                        │
│     ▼                                                                        │
│  STEP 4: Your POS receives the order and creates:                           │
│     │    - online_orders record (external tracking)                          │
│     │    - orders record (POS order)                                         │
│     │    - KOT tickets (sent to kitchen)                                     │
│     │                                                                        │
│     ▼                                                                        │
│  STEP 5: Kitchen prepares food, updates status                              │
│     │                                                                        │
│     ▼                                                                        │
│  STEP 6: POS sends status update to Dyno                                    │
│     │    POST https://api.dynoapis.com/v1/orders/{id}/status                │
│     │                                                                        │
│     ▼                                                                        │
│  STEP 7: Dyno forwards status to Swiggy/Zomato                              │
│     │                                                                        │
│     ▼                                                                        │
│  STEP 8: Customer sees "Food Ready" / "Out for Delivery"                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Dyno Dashboard Setup

### Step 1: Login to Dyno Dashboard

1. Go to: **https://dynoapis.com/**
2. Click **Login**
3. Enter credentials:
   - Email: `admin@imaker.biz`
   - Password: `iMaker@#2026`

### Step 2: Find Your API Credentials

After login, look for these in the dashboard:

| Credential | Where to Find | What It's For |
|------------|---------------|---------------|
| **Dyno Order ID** | Dashboard / Settings | Identifies your account |
| **Access Token** | API Keys section | Authentication for API calls |
| **Property ID** | Restaurant/Property settings | Identifies your restaurant |
| **Webhook Secret** | Webhook settings | Verifies incoming webhooks |

### Step 3: Configure Webhook URL

In Dyno Dashboard:
1. Go to **Settings** → **Webhook Configuration**
2. Set your webhook URL:
   ```
   https://your-server.com/api/v1/integrations/dyno/webhook
   ```
3. Save the **Webhook Secret** - you'll need this for verification

### Step 4: Connect Swiggy/Zomato

In Dyno Dashboard:
1. Go to **Integrations** or **Channels**
2. Connect your Swiggy restaurant
3. Connect your Zomato restaurant
4. Map your menu items (Dyno may do this automatically)

---

## Part 3: POS Configuration

### Step 1: Add Environment Variables

Add to your `.env` file:

```env
# Dyno API Configuration
DYNO_API_BASE_URL=https://api.dynoapis.com/v1
DYNO_WEBHOOK_SECRET=<your-webhook-secret-from-dyno-dashboard>

# Feature Flags
ONLINE_ORDERS_ENABLED=true
```

### Step 2: Configure Integration Channel in Database

Run this SQL to add your Swiggy channel:

```sql
INSERT INTO integration_channels (
  outlet_id,
  channel_name,
  channel_display_name,
  dyno_order_id,
  dyno_access_token,
  property_id,
  property_name,
  webhook_secret,
  is_active,
  auto_accept_orders,
  auto_print_kot,
  default_prep_time
) VALUES (
  43,                              -- Your outlet_id
  'swiggy',                        -- Platform
  'Swiggy',                        -- Display name
  '<your-dyno-order-id>',          -- From Dyno dashboard
  '<your-access-token>',           -- From Dyno dashboard
  '<your-property-id>',            -- From Dyno dashboard
  'My Restaurant Name',            -- Your restaurant name
  '<your-webhook-secret>',         -- From Dyno dashboard
  1,                               -- Active
  0,                               -- Manual accept (set 1 for auto)
  1,                               -- Auto print KOT
  20                               -- Default prep time in minutes
);
```

For Zomato, run similar with `channel_name = 'zomato'`.

---

## Part 4: Order Status Flow

### Status Transitions

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  RECEIVED   │────▶│  ACCEPTED   │────▶│  PREPARING  │
│  (New order │     │  (You click │     │  (Kitchen   │
│   arrives)  │     │   Accept)   │     │   cooking)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  DELIVERED  │◀────│  PICKED_UP  │◀────│    READY    │
│  (Customer  │     │  (Rider     │     │  (Food is   │
│  received)  │     │   took it)  │     │   ready)    │
└─────────────┘     └─────────────┘     └─────────────┘
```

### What Happens at Each Status

| Status | Trigger | POS Action | Dyno Action |
|--------|---------|------------|-------------|
| **received** | Webhook arrives | Create order, show notification | - |
| **accepted** | Staff clicks Accept | Update order, send KOT | Tell Swiggy/Zomato |
| **preparing** | KOT sent to kitchen | Order status = preparing | Tell platform |
| **ready** | Kitchen marks done | Mark ready for pickup | Tell platform (rider notified) |
| **picked_up** | Rider picks up | Update order | Tell platform |
| **delivered** | Auto or manual | Complete order | Tell platform |
| **cancelled** | Staff/customer/platform | Cancel order, cancel KOTs | Tell platform |

---

## Part 5: API Endpoints Summary

### Webhook (Dyno → Your POS)

```
POST /api/v1/integrations/dyno/webhook

Headers:
  X-Dyno-Signature: <hmac-sha256-signature>
  X-Dyno-Timestamp: <unix-timestamp>
  X-Dyno-Channel-Id: <channel-id>
```

### Your POS Management APIs

| Action | Method | Endpoint |
|--------|--------|----------|
| Get active orders | GET | `/api/v1/integrations/orders/active` |
| Accept order | POST | `/api/v1/integrations/orders/:id/accept` |
| Reject order | POST | `/api/v1/integrations/orders/:id/reject` |
| Mark ready | POST | `/api/v1/integrations/orders/:id/ready` |
| Mark dispatched | POST | `/api/v1/integrations/orders/:id/dispatch` |

---

## Part 5B: Dyno API Endpoints (from OpenAPI v2.0.19)

### Essential APIs Only (Skip the rest)

#### Swiggy Integration
| Action | Method | Endpoint | Query Parameters |
|--------|--------|----------|------------------|
| Get Orders | GET | `/api/v1/swiggy/orders` | - |
| Accept Order | POST | `/api/v1/swiggy/orders/accept` | `order_id`, `prep_time=30` |
| Accept (Multi-res) | POST | `/api/v1/swiggy/orders/accept/{res_id}` | `order_id`, `prep_time=30` |
| Mark Ready | POST | `/api/v1/swiggy/orders/ready` | `order_id` |
| Mark Ready (Multi-res) | POST | `/api/v1/swiggy/orders/ready/{res_id}` | `order_id` |
| Get Items | GET | `/api/v1/swiggy/items` | - |
| Item In Stock | POST | `/api/v1/swiggy/items/instock` | `item_id` |
| Item Out of Stock | POST | `/api/v1/swiggy/items/outofstock` | `item_id` |

#### Zomato Integration
| Action | Method | Endpoint | Query Parameters |
|--------|--------|----------|------------------|
| Get Current Orders | GET | `/api/v1/zomato/orders/current` | - |
| Get Order Details | GET | `/api/v1/zomato/order/details` | `order_id` |
| Accept Order | POST | `/api/v1/zomato/orders/accept_order` | `order_id`, `delivery_time=30` |
| Accept (Multi-res) | POST | `/api/v1/zomato/orders/accept_order/{res_id}` | `order_id`, `delivery_time` |
| Mark Ready | POST | `/api/v1/zomato/orders/mark_ready` | `order_id` |
| Mark Ready (Multi-res) | POST | `/api/v1/zomato/orders/mark_ready/{res_id}` | `order_id` |
| Reject Order | POST | `/api/v1/zomato/orders/reject` | `restaurant_id`, `order_id` |
| Get Items | GET | `/api/v1/zomato/items` | - |
| Item In Stock | POST | `/api/v1/zomato/items/in_stock` | `item_id` |
| Item Out of Stock | POST | `/api/v1/zomato/items/out_of_stock` | `item_id` |

#### Webhook Endpoints (YOUR Server Implements) ✅ VERIFIED
| Action | Method | Your Endpoint | Status |
|--------|--------|---------------|--------|
| Receive Orders | POST | `/orders` | ✅ Working |
| Get Order Status | GET | `/{resId}/orders/status` | ✅ Working |
| Update Order Status | POST | `/{resId}/orders/status` | ✅ Working |
| Receive Order History | POST | `/{resId}/orders/history` | ✅ Working |
| Get Items Status | GET | `/{resId}/items/status` | ✅ Working |
| Update Items Status | POST | `/{resId}/items/status` | ✅ Working |
| Update Categories Status | POST | `/{resId}/categories/status` | ✅ Working |
| Receive All Items | POST | `/{resId}/items` | ✅ Working |

**Note:** `{resId}` = Property ID from Dyno (e.g., Swiggy/Zomato Restaurant ID)

### APIs We Skip (Not Essential)
- ❌ Login endpoints (handled by Dyno dashboard)
- ❌ Close outlet (rare use case)
- ❌ Order history (reporting only)
- ❌ Modify price (rare use case)
- ❌ Category stock (use item-level instead)
- ❌ Waayu integration (different platform)
- ❌ BigByts integration (different platform)

---

## Part 6: Testing Checklist

### Pre-Testing Setup

- [ ] Migration run successfully (tables created)
- [ ] Environment variables set
- [ ] Integration channel configured in database
- [ ] Server running without errors

### Test Scenarios

1. **Test Webhook Receipt**
   - [ ] Send test webhook
   - [ ] Verify signature validation
   - [ ] Verify order created in database

2. **Test Order Flow**
   - [ ] Accept order
   - [ ] Verify KOT generated
   - [ ] Mark ready
   - [ ] Mark dispatched

3. **Test Error Handling**
   - [ ] Invalid signature rejected
   - [ ] Duplicate order handled
   - [ ] Missing items handled

4. **Test Real Orders**
   - [ ] Place test order on Swiggy
   - [ ] Verify it arrives in POS
   - [ ] Complete the order flow

---

## Part 7: Troubleshooting

### Order Not Arriving?

1. Check webhook URL is correct in Dyno dashboard
2. Check server is publicly accessible
3. Check firewall allows incoming POST requests
4. Check integration_logs table for errors

### Signature Verification Failing?

1. Verify webhook_secret matches Dyno dashboard
2. Check server time is synchronized
3. Check payload is not modified

### Status Not Syncing to Platform?

1. Check access_token is correct
2. Check Dyno API is reachable
3. Check integration_logs for outbound errors

---

## Part 8: Quick Commands

### Check Integration Channels
```sql
SELECT id, channel_name, is_active, sync_status FROM integration_channels;
```

### Check Recent Online Orders
```sql
SELECT id, platform, external_order_id, pos_status, created_at 
FROM online_orders ORDER BY created_at DESC LIMIT 10;
```

### Check Integration Logs
```sql
SELECT id, log_type, direction, status, error_message, created_at 
FROM integration_logs ORDER BY created_at DESC LIMIT 20;
```

### Check Orders with Source
```sql
SELECT id, order_number, source, external_order_id, status 
FROM orders WHERE source != 'pos' ORDER BY created_at DESC LIMIT 10;
```
