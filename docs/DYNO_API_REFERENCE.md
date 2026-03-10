# Dyno APIs - Complete API Reference

## Overview

This document contains all API endpoints, request/response formats, and workflow diagrams for the Swiggy/Zomato integration via Dyno APIs.

---

## 1. Integration Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ONLINE ORDER WORKFLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   CUSTOMER                PLATFORM              DYNO                POS      │
│      │                       │                   │                   │       │
│      │ Place Order           │                   │                   │       │
│      │──────────────────────▶│                   │                   │       │
│      │                       │                   │                   │       │
│      │                       │ Forward Order     │                   │       │
│      │                       │──────────────────▶│                   │       │
│      │                       │                   │                   │       │
│      │                       │                   │ POST /webhook     │       │
│      │                       │                   │──────────────────▶│       │
│      │                       │                   │                   │       │
│      │                       │                   │   201 Created     │       │
│      │                       │                   │◀──────────────────│       │
│      │                       │                   │                   │       │
│      │                       │                   │                   │ KOT   │
│      │                       │                   │                   │──────▶│
│      │                       │                   │                   │Kitchen│
│      │                       │                   │                   │       │
│      │                       │                   │ Status: ACCEPTED  │       │
│      │                       │◀──────────────────│◀──────────────────│       │
│      │                       │                   │                   │       │
│      │ Order Confirmed       │                   │                   │       │
│      │◀──────────────────────│                   │                   │       │
│      │                       │                   │                   │       │
│      │                       │                   │ Status: PREPARING │       │
│      │                       │◀──────────────────│◀──────────────────│       │
│      │                       │                   │                   │       │
│      │                       │                   │ Status: READY     │       │
│      │                       │◀──────────────────│◀──────────────────│       │
│      │                       │                   │                   │       │
│      │ Food Ready            │                   │                   │       │
│      │◀──────────────────────│                   │                   │       │
│      │                       │                   │                   │       │
│      │                       │ Rider Picks Up    │ Status: DISPATCHED│       │
│      │                       │◀──────────────────│◀──────────────────│       │
│      │                       │                   │                   │       │
│      │ Out for Delivery      │                   │                   │       │
│      │◀──────────────────────│                   │                   │       │
│      │                       │                   │                   │       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Webhook Endpoints (Inbound from Dyno)

### 2.1 Receive New Order

**Endpoint:** `POST /api/v1/integrations/dyno/webhook`

**Headers:**
```
Content-Type: application/json
X-Dyno-Signature: <HMAC-SHA256 signature>
X-Dyno-Timestamp: <Unix timestamp>
X-Dyno-Channel-Id: <channel_id>
```

**Request Payload (New Order):**
```json
{
  "event": "order.new",
  "timestamp": "2026-03-07T10:30:00.000Z",
  "data": {
    "platform": "swiggy",
    "external_order_id": "SWG123456789",
    "dyno_order_id": "DYNO_ABC123",
    "platform_order_number": "ORD-SWG-12345",
    "restaurant_id": "RES_123",
    "customer": {
      "name": "John Doe",
      "phone": "+919876543210",
      "address": "123 Main Street, Apartment 4B, City - 380001",
      "instructions": "Ring doorbell twice, leave at door if not home"
    },
    "items": [
      {
        "external_item_id": "ITEM_001",
        "name": "Butter Chicken",
        "variant_id": "VAR_HALF",
        "variant_name": "Half",
        "quantity": 2,
        "unit_price": 250.00,
        "total_price": 500.00,
        "addons": [
          {
            "addon_id": "ADD_001",
            "name": "Extra Gravy",
            "price": 30.00
          },
          {
            "addon_id": "ADD_002",
            "name": "Raita",
            "price": 25.00
          }
        ],
        "instructions": "Less spicy please"
      },
      {
        "external_item_id": "ITEM_002",
        "name": "Garlic Naan",
        "variant_id": null,
        "variant_name": null,
        "quantity": 4,
        "unit_price": 45.00,
        "total_price": 180.00,
        "addons": [],
        "instructions": null
      }
    ],
    "payment": {
      "method": "prepaid",
      "is_paid": true,
      "item_total": 680.00,
      "taxes": 34.00,
      "delivery_charge": 40.00,
      "packaging_charge": 20.00,
      "discount": 50.00,
      "total": 724.00
    },
    "timing": {
      "placed_at": "2026-03-07T10:30:00.000Z",
      "expected_delivery": "2026-03-07T11:15:00.000Z"
    }
  }
}
```

**Success Response (201 Created):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "onlineOrderId": 125,
    "posOrderId": 892,
    "orderNumber": "ORD2603070045"
  }
}
```

**Duplicate Order Response (200 OK):**
```json
{
  "success": true,
  "message": "Order already processed",
  "onlineOrderId": 125
}
```

**Error Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid webhook signature"
}
```

**Error Response (500 Internal Error):**
```json
{
  "success": false,
  "error": "Failed to process order: Item mapping failed"
}
```

---

### 2.2 Order Cancellation (from Platform)

**Endpoint:** `POST /api/v1/integrations/dyno/webhook`

**Request Payload:**
```json
{
  "event": "order.cancelled",
  "timestamp": "2026-03-07T10:35:00.000Z",
  "data": {
    "platform": "swiggy",
    "external_order_id": "SWG123456789",
    "cancel_reason": "Customer requested cancellation",
    "cancelled_by": "customer"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Order cancelled"
}
```

---

## 3. Channel Management APIs

### 3.1 Get All Channels

**Endpoint:** `GET /api/v1/integrations/channels`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| outletId | number | No | Filter by outlet (defaults to user's outlet) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "outlet_id": 43,
      "channel_name": "swiggy",
      "channel_display_name": "Swiggy",
      "dyno_order_id": "DA202602245543816450",
      "dyno_access_token": "***07f2",
      "property_id": "PROP_SWG_001",
      "property_name": "My Restaurant - Main Branch",
      "property_area": "Ahmedabad",
      "webhook_secret": "***hidden***",
      "is_active": true,
      "auto_accept_orders": false,
      "auto_print_kot": true,
      "default_prep_time": 20,
      "last_sync_at": "2026-03-07T10:00:00.000Z",
      "sync_status": "active",
      "sync_error_message": null,
      "created_at": "2026-03-01T09:00:00.000Z",
      "updated_at": "2026-03-07T10:00:00.000Z"
    },
    {
      "id": 2,
      "outlet_id": 43,
      "channel_name": "zomato",
      "channel_display_name": "Zomato",
      "dyno_order_id": "DA202602245543816450",
      "dyno_access_token": "***a3b1",
      "property_id": "PROP_ZOM_001",
      "property_name": "My Restaurant",
      "property_area": "Ahmedabad",
      "webhook_secret": "***hidden***",
      "is_active": true,
      "auto_accept_orders": true,
      "auto_print_kot": true,
      "default_prep_time": 25,
      "last_sync_at": "2026-03-07T10:05:00.000Z",
      "sync_status": "active",
      "sync_error_message": null,
      "created_at": "2026-03-01T09:30:00.000Z",
      "updated_at": "2026-03-07T10:05:00.000Z"
    }
  ]
}
```

---

### 3.2 Create/Update Channel

**Endpoint:** `POST /api/v1/integrations/channels`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "outletId": 43,
  "channelName": "swiggy",
  "channelDisplayName": "Swiggy",
  "dynoOrderId": "DA202602245543816450",
  "dynoAccessToken": "827870a61e064d798703a6ef1911071f",
  "propertyId": "PROP_SWG_001",
  "propertyName": "My Restaurant - Main Branch",
  "propertyArea": "Ahmedabad",
  "webhookSecret": "my-webhook-secret-key",
  "autoAcceptOrders": false,
  "autoPrintKot": true,
  "defaultPrepTime": 20
}
```

**Response (201 Created - New Channel):**
```json
{
  "success": true,
  "message": "Channel created",
  "data": {
    "id": 1,
    "created": true
  }
}
```

**Response (200 OK - Updated):**
```json
{
  "success": true,
  "message": "Channel updated",
  "data": {
    "id": 1,
    "updated": true
  }
}
```

---

### 3.3 Delete/Deactivate Channel

**Endpoint:** `DELETE /api/v1/integrations/channels/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Channel deactivated"
}
```

---

## 4. Menu Mapping APIs

### 4.1 Get Menu Mappings

**Endpoint:** `GET /api/v1/integrations/channels/:channelId/menu-mapping`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| unmappedOnly | boolean | No | If true, returns only unmapped items |

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "channel_id": 1,
      "external_item_id": "ITEM_001",
      "external_item_name": "Butter Chicken",
      "external_variant_id": "VAR_HALF",
      "external_variant_name": "Half",
      "external_addon_id": null,
      "external_addon_name": null,
      "pos_item_id": 245,
      "pos_variant_id": 512,
      "pos_addon_id": null,
      "pos_item_name": "Butter Chicken",
      "pos_variant_name": "Half Portion",
      "is_mapped": true,
      "is_available": true,
      "mapped_by": 1,
      "mapped_at": "2026-03-01T10:00:00.000Z",
      "created_at": "2026-03-01T09:00:00.000Z",
      "updated_at": "2026-03-01T10:00:00.000Z"
    },
    {
      "id": 2,
      "channel_id": 1,
      "external_item_id": "ITEM_002",
      "external_item_name": "Garlic Naan",
      "external_variant_id": null,
      "external_variant_name": null,
      "external_addon_id": null,
      "external_addon_name": null,
      "pos_item_id": null,
      "pos_variant_id": null,
      "pos_addon_id": null,
      "pos_item_name": null,
      "pos_variant_name": null,
      "is_mapped": false,
      "is_available": true,
      "mapped_by": null,
      "mapped_at": null,
      "created_at": "2026-03-07T10:30:00.000Z",
      "updated_at": "2026-03-07T10:30:00.000Z"
    }
  ]
}
```

---

### 4.2 Create/Update Menu Mapping

**Endpoint:** `POST /api/v1/integrations/channels/:channelId/menu-mapping`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "externalItemId": "ITEM_002",
  "externalItemName": "Garlic Naan",
  "externalVariantId": null,
  "externalVariantName": null,
  "posItemId": 156,
  "posVariantId": null,
  "isAvailable": true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Mapping created",
  "id": 3
}
```

**Response (200 OK - Updated):**
```json
{
  "success": true,
  "message": "Mapping updated",
  "id": 2
}
```

---

## 5. Online Order Management APIs

### 5.1 Get Active Online Orders

**Endpoint:** `GET /api/v1/integrations/orders/active`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| outletId | number | No | Filter by outlet |

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 125,
      "outlet_id": 43,
      "channel_id": 1,
      "pos_order_id": 892,
      "external_order_id": "SWG123456789",
      "dyno_order_id": "DYNO_ABC123",
      "platform": "swiggy",
      "platform_order_number": "ORD-SWG-12345",
      "customer_name": "John Doe",
      "customer_phone": "+919876543210",
      "customer_address": "123 Main Street, City - 380001",
      "customer_instructions": "Ring doorbell twice",
      "order_type": "delivery",
      "payment_method": "prepaid",
      "is_paid": true,
      "item_total": 680.00,
      "platform_discount": 50.00,
      "delivery_charge": 40.00,
      "packaging_charge": 20.00,
      "taxes": 34.00,
      "total_amount": 724.00,
      "order_placed_at": "2026-03-07T10:30:00.000Z",
      "estimated_delivery_at": "2026-03-07T11:15:00.000Z",
      "accepted_at": "2026-03-07T10:31:00.000Z",
      "food_ready_at": null,
      "picked_up_at": null,
      "delivered_at": null,
      "cancelled_at": null,
      "platform_status": "ACCEPTED",
      "pos_status": "preparing",
      "last_status_sync_at": "2026-03-07T10:35:00.000Z",
      "cancel_reason": null,
      "cancelled_by": null,
      "channel_display_name": "Swiggy",
      "pos_order_number": "ORD2603070045",
      "created_at": "2026-03-07T10:30:30.000Z",
      "updated_at": "2026-03-07T10:35:00.000Z"
    }
  ]
}
```

---

### 5.2 Get Online Orders (with Filters)

**Endpoint:** `GET /api/v1/integrations/orders`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| outletId | number | No | Filter by outlet |
| platform | string | No | Filter by platform (swiggy, zomato) |
| status | string | No | Filter by status |
| startDate | string | No | Start date (YYYY-MM-DD) |
| endDate | string | No | End date (YYYY-MM-DD) |
| limit | number | No | Max results (default: 50) |

**Example:** `GET /api/v1/integrations/orders?platform=swiggy&status=delivered&startDate=2026-03-01&endDate=2026-03-07`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 120,
      "platform": "swiggy",
      "external_order_id": "SWG123456780",
      "pos_status": "delivered",
      "total_amount": 450.00,
      "customer_name": "Jane Smith",
      "channel_display_name": "Swiggy",
      "pos_order_number": "ORD2603050012",
      "created_at": "2026-03-05T12:00:00.000Z"
    }
  ]
}
```

---

### 5.3 Get Order Details

**Endpoint:** `GET /api/v1/integrations/orders/:id`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 125,
    "outlet_id": 43,
    "channel_id": 1,
    "pos_order_id": 892,
    "external_order_id": "SWG123456789",
    "dyno_order_id": "DYNO_ABC123",
    "platform": "swiggy",
    "platform_order_number": "ORD-SWG-12345",
    "customer_name": "John Doe",
    "customer_phone": "+919876543210",
    "customer_address": "123 Main Street, Apartment 4B, City - 380001",
    "customer_instructions": "Ring doorbell twice",
    "order_type": "delivery",
    "payment_method": "prepaid",
    "is_paid": true,
    "item_total": 680.00,
    "platform_discount": 50.00,
    "delivery_charge": 40.00,
    "packaging_charge": 20.00,
    "taxes": 34.00,
    "total_amount": 724.00,
    "order_placed_at": "2026-03-07T10:30:00.000Z",
    "estimated_delivery_at": "2026-03-07T11:15:00.000Z",
    "accepted_at": "2026-03-07T10:31:00.000Z",
    "food_ready_at": "2026-03-07T10:50:00.000Z",
    "picked_up_at": null,
    "delivered_at": null,
    "cancelled_at": null,
    "platform_status": "READY_FOR_PICKUP",
    "pos_status": "ready",
    "last_status_sync_at": "2026-03-07T10:50:30.000Z",
    "raw_order_data": { "...original webhook payload..." },
    "channel_display_name": "Swiggy",
    "dyno_access_token": "***07f2"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Order not found"
}
```

---

### 5.4 Accept Order

**Endpoint:** `POST /api/v1/integrations/orders/:id/accept`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prepTime": 25
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "prepTime": 25
}
```

---

### 5.5 Reject Order

**Endpoint:** `POST /api/v1/integrations/orders/:id/reject`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Item out of stock"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Rejection reason required"
}
```

---

### 5.6 Mark Order Ready

**Endpoint:** `POST /api/v1/integrations/orders/:id/ready`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true
}
```

---

### 5.7 Mark Order Dispatched

**Endpoint:** `POST /api/v1/integrations/orders/:id/dispatch`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "success": true
}
```

---

## 6. Integration Logs API

### 6.1 Get Logs

**Endpoint:** `GET /api/v1/integrations/logs`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| outletId | number | No | Filter by outlet |
| channelId | number | No | Filter by channel |
| logType | string | No | Filter by type (webhook_received, order_created, status_update, error) |
| status | string | No | Filter by status (success, failed, pending) |
| limit | number | No | Max results (default: 100) |

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1001,
      "outlet_id": 43,
      "channel_id": 1,
      "online_order_id": 125,
      "log_type": "webhook_received",
      "direction": "inbound",
      "endpoint": "/webhook",
      "method": "POST",
      "request_headers": {"x-dyno-signature": "..."},
      "request_body": {"event": "order.new", "...": "..."},
      "response_status": 201,
      "response_body": {"success": true, "...": "..."},
      "status": "success",
      "error_message": null,
      "retry_count": 0,
      "started_at": "2026-03-07T10:30:30.000Z",
      "completed_at": "2026-03-07T10:30:31.500Z",
      "duration_ms": 1500,
      "created_at": "2026-03-07T10:30:30.000Z"
    },
    {
      "id": 1002,
      "outlet_id": 43,
      "channel_id": 1,
      "online_order_id": 125,
      "log_type": "status_update",
      "direction": "outbound",
      "endpoint": "/orders/SWG123456789/status",
      "method": "POST",
      "request_headers": null,
      "request_body": {"status": "ACCEPTED", "prep_time_minutes": 20},
      "response_status": 200,
      "response_body": {"success": true},
      "status": "success",
      "error_message": null,
      "retry_count": 0,
      "started_at": "2026-03-07T10:31:00.000Z",
      "completed_at": "2026-03-07T10:31:00.800Z",
      "duration_ms": 800,
      "created_at": "2026-03-07T10:31:00.000Z"
    }
  ]
}
```

---

## 7. Test Webhook API

### 7.1 Send Test Order

**Endpoint:** `POST /api/v1/integrations/test-webhook`

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "channelId": 1,
  "testOrder": {
    "items": [
      {
        "external_item_id": "TEST_001",
        "name": "Test Burger",
        "quantity": 2,
        "unit_price": 150,
        "total_price": 300
      }
    ]
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Test order created",
  "data": {
    "success": true,
    "onlineOrderId": 130,
    "posOrderId": 900,
    "orderNumber": "ORD2603070050"
  }
}
```

---

## 8. Status Mapping Reference

### POS Status → Dyno Status → Platform Display

| POS Status | Dyno Status | Swiggy Display | Zomato Display |
|------------|-------------|----------------|----------------|
| received | RECEIVED | Order Received | New Order |
| accepted | ACCEPTED | Confirmed | Accepted |
| preparing | PREPARING | Being Prepared | Preparing |
| ready | READY_FOR_PICKUP | Ready for Pickup | Food Ready |
| picked_up | DISPATCHED | Out for Delivery | Picked Up |
| delivered | DELIVERED | Delivered | Delivered |
| cancelled | CANCELLED | Cancelled | Cancelled |

---

## 9. Error Codes Reference

| HTTP Code | Error | Description |
|-----------|-------|-------------|
| 200 | - | Success |
| 201 | - | Created |
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | Invalid/missing auth token or webhook signature |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server error |

---

## 10. WebSocket Events

### Online Order Events

**Channel:** `online_order:update`

**Event: New Order**
```json
{
  "type": "online_order:new",
  "outletId": 43,
  "onlineOrderId": 125,
  "posOrderId": 892,
  "platform": "swiggy",
  "externalOrderId": "SWG123456789",
  "customer": {
    "name": "John Doe",
    "phone": "+919876543210"
  },
  "itemCount": 2,
  "totalAmount": 724.00,
  "timestamp": "2026-03-07T10:30:30.000Z"
}
```

**Event: Order Accepted**
```json
{
  "type": "online_order:accepted",
  "outletId": 43,
  "onlineOrderId": 125,
  "posOrderId": 892,
  "prepTime": 20,
  "timestamp": "2026-03-07T10:31:00.000Z"
}
```

**Event: Order Ready**
```json
{
  "type": "online_order:ready",
  "outletId": 43,
  "onlineOrderId": 125,
  "posOrderId": 892,
  "timestamp": "2026-03-07T10:50:00.000Z"
}
```

**Event: Order Cancelled**
```json
{
  "type": "online_order:cancelled",
  "outletId": 43,
  "onlineOrderId": 125,
  "posOrderId": 892,
  "reason": "Customer requested cancellation",
  "cancelledBy": "customer",
  "timestamp": "2026-03-07T10:35:00.000Z"
}
```

---

## 11. Environment Variables

```env
# Dyno API Configuration
DYNO_API_BASE_URL=https://api.dynoapis.com/v1
DYNO_WEBHOOK_SECRET=your-global-webhook-secret
DYNO_API_TIMEOUT=30000

# Feature Flags
ONLINE_ORDERS_ENABLED=true
AUTO_ACCEPT_ONLINE_ORDERS=false
AUTO_PRINT_ONLINE_KOT=true

# Polling (if webhook not available)
DYNO_POLLING_ENABLED=false
DYNO_POLLING_INTERVAL=60000
```

---

## 12. Security Checklist

- [x] Webhook signature verification (HMAC-SHA256)
- [x] Timestamp validation (5-minute window)
- [x] Rate limiting (100 requests/minute)
- [x] Duplicate order prevention
- [x] Sensitive data masking in logs
- [x] Authentication required for management APIs
- [x] Role-based access control
