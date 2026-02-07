# Captain Module - Complete API Documentation

## Overview

The Captain Module handles all operations for restaurant captains/waiters including:
- **Authentication** - PIN-based login
- **Table Management** - View, occupy, release tables
- **Menu Access** - View menu items with visibility rules
- **Order Management** - Create, modify, add items
- **KOT Management** - Send to kitchen, track status
- **Real-time Updates** - WebSocket events for live sync

---

## Base URL
```
http://localhost:3000/api/v1
```

## Authentication Header
```
Authorization: Bearer {accessToken}
```

---

# 1. AUTHENTICATION

## 1.1 Captain Login (PIN-based)

**Endpoint:** `POST /auth/login/pin`

**Description:** Captain logs in using employee code and PIN

### Request
```json
{
  "employeeCode": "CAP001",
  "pin": "1234",
  "outletId": 1
}
```

### Response (Success)
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 5,
      "uuid": "abc-123-def",
      "firstName": "John",
      "lastName": "Captain",
      "email": "john@restaurant.com",
      "employeeCode": "CAP001",
      "roles": ["captain"],
      "outletId": 1,
      "outletName": "Downtown Restaurant"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400
  }
}
```

### Response (Error)
```json
{
  "success": false,
  "message": "Invalid PIN or employee code"
}
```

---

## 1.2 Get Current User

**Endpoint:** `GET /auth/me`

### Response
```json
{
  "success": true,
  "data": {
    "id": 5,
    "firstName": "John",
    "lastName": "Captain",
    "roles": ["captain"],
    "permissions": ["orders.create", "orders.view", "kot.send", "tables.manage"],
    "assignedFloors": [1, 2],
    "assignedSections": [1, 3]
  }
}
```

---

## 1.3 Logout

**Endpoint:** `POST /auth/logout`

### Response
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

# 2. TABLE MANAGEMENT

## 2.1 Get Tables by Floor

**Endpoint:** `GET /tables/floor/{floorId}`

**Description:** Get all tables on a floor with real-time status

### Response
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tableNumber": "T01",
      "name": "Table 1",
      "capacity": 4,
      "status": "available",
      "floor_id": 1,
      "section_id": 1,
      "section_name": "AC Section",
      "current_order_id": null,
      "current_covers": 0,
      "session_start": null,
      "position_x": 100,
      "position_y": 200
    },
    {
      "id": 2,
      "tableNumber": "T02",
      "name": "Table 2",
      "capacity": 6,
      "status": "occupied",
      "floor_id": 1,
      "section_id": 1,
      "section_name": "AC Section",
      "current_order_id": 45,
      "current_covers": 4,
      "session_start": "2024-01-15T12:30:00Z",
      "order_total": 1250.00,
      "kot_pending": 2
    }
  ]
}
```

---

## 2.2 Get Real-time Table Status

**Endpoint:** `GET /tables/realtime/{outletId}`

**Description:** Get real-time status of all tables in outlet

### Response
```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 25,
      "available": 15,
      "occupied": 8,
      "reserved": 2,
      "billing": 0
    },
    "floors": [
      {
        "floorId": 1,
        "floorName": "Ground Floor",
        "tables": [
          {"id": 1, "tableNumber": "T01", "status": "available"},
          {"id": 2, "tableNumber": "T02", "status": "occupied", "orderId": 45}
        ]
      }
    ]
  }
}
```

---

## 2.3 Start Table Session (Occupy Table)

**Endpoint:** `POST /tables/{tableId}/session`

**Description:** Start a session when guests arrive

### Request
```json
{
  "covers": 4,
  "customerName": "Mr. Sharma",
  "customerPhone": "9876543210",
  "notes": "Birthday celebration"
}
```

### Response
```json
{
  "success": true,
  "message": "Table session started",
  "data": {
    "sessionId": 123,
    "tableId": 1,
    "tableNumber": "T01",
    "status": "occupied",
    "covers": 4,
    "startTime": "2024-01-15T12:30:00Z",
    "captainId": 5,
    "captainName": "John Captain"
  }
}
```

---

## 2.4 Get Current Table Session

**Endpoint:** `GET /tables/{tableId}/session`

### Response
```json
{
  "success": true,
  "data": {
    "sessionId": 123,
    "tableId": 1,
    "covers": 4,
    "customerName": "Mr. Sharma",
    "startTime": "2024-01-15T12:30:00Z",
    "duration": "01:30:00",
    "orders": [
      {
        "orderId": 45,
        "orderNumber": "ORD-0045",
        "status": "confirmed",
        "total": 1250.00,
        "kotCount": 2
      }
    ]
  }
}
```

---

## 2.5 End Table Session

**Endpoint:** `DELETE /tables/{tableId}/session`

**Description:** End session after payment (releases table)

### Response
```json
{
  "success": true,
  "message": "Table session ended",
  "data": {
    "tableId": 1,
    "status": "available",
    "sessionDuration": "02:15:00",
    "totalBilled": 1450.00
  }
}
```

---

## 2.6 Update Table Status

**Endpoint:** `PATCH /tables/{tableId}/status`

### Request
```json
{
  "status": "reserved",
  "notes": "Reserved for 8 PM"
}
```

**Valid statuses:** `available`, `occupied`, `reserved`, `billing`, `cleaning`

### Response
```json
{
  "success": true,
  "data": {
    "id": 1,
    "tableNumber": "T01",
    "status": "reserved"
  }
}
```

---

## 2.7 Merge Tables

**Endpoint:** `POST /tables/{primaryTableId}/merge`

### Request
```json
{
  "tableIds": [2, 3]
}
```

### Response
```json
{
  "success": true,
  "message": "Tables merged successfully",
  "data": {
    "primaryTableId": 1,
    "mergedTables": [2, 3],
    "totalCapacity": 14
  }
}
```

---

## 2.8 Unmerge Tables

**Endpoint:** `DELETE /tables/{primaryTableId}/merge`

### Response
```json
{
  "success": true,
  "message": "Tables unmerged"
}
```

---

## 2.9 Transfer Order to Another Table

**Endpoint:** `POST /orders/{orderId}/transfer`

### Request
```json
{
  "toTableId": 5,
  "reason": "Customer requested window seat"
}
```

### Response
```json
{
  "success": true,
  "message": "Order transferred",
  "data": {
    "orderId": 45,
    "fromTableId": 1,
    "toTableId": 5,
    "fromTableNumber": "T01",
    "toTableNumber": "T05"
  }
}
```

---

# 3. MENU ACCESS

## 3.1 Get Captain Menu (Simplified)

**Endpoint:** `GET /menu/{outletId}/captain`

**Description:** Get simplified menu optimized for captain app

### Query Parameters (Optional)
| Parameter | Type | Description |
|-----------|------|-------------|
| floorId | number | Filter by floor visibility |
| sectionId | number | Filter by section visibility |
| categoryId | number | Filter by category |
| search | string | Search items |

### Response
```json
{
  "success": true,
  "data": {
    "outletId": 1,
    "generatedAt": "2024-01-15T12:30:00Z",
    "timeSlot": "Lunch",
    "summary": {
      "categories": 8,
      "items": 45
    },
    "menu": [
      {
        "id": 1,
        "name": "Starters",
        "icon": "appetizer",
        "color": "#FF5722",
        "count": 12,
        "items": [
          {
            "id": 101,
            "name": "Paneer Tikka",
            "short": "Paneer Tikka",
            "price": 299,
            "type": "veg",
            "img": "https://cdn.example.com/paneer-tikka.jpg",
            "badge": "★",
            "recommended": true,
            "variants": [
              {"id": 201, "name": "Half", "price": 169, "default": false},
              {"id": 202, "name": "Full", "price": 299, "default": true}
            ],
            "addons": [
              {
                "id": 301,
                "name": "Extra Toppings",
                "required": false,
                "min": 0,
                "max": 3,
                "options": [
                  {"id": 401, "name": "Extra Cheese", "price": 50, "type": "veg", "img": "..."},
                  {"id": 402, "name": "Jalapenos", "price": 30, "type": "veg", "img": "..."}
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

## 3.2 Search Menu Items

**Endpoint:** `GET /menu/{outletId}/search?q={query}`

### Response
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "name": "Paneer Tikka",
      "categoryName": "Starters",
      "price": 299,
      "type": "veg"
    }
  ]
}
```

---

## 3.3 Get Item Details (for Order)

**Endpoint:** `GET /menu/item/{itemId}/order`

**Description:** Get complete item details with variants and addons for ordering

### Response
```json
{
  "success": true,
  "data": {
    "id": 101,
    "name": "Paneer Tikka",
    "description": "Marinated cottage cheese grilled to perfection",
    "basePrice": 299,
    "itemType": "veg",
    "categoryId": 1,
    "categoryName": "Starters",
    "imageUrl": "https://cdn.example.com/paneer-tikka.jpg",
    "preparationTime": 15,
    "hasVariants": true,
    "hasAddons": true,
    "allowSpecialNotes": true,
    "kitchenStationId": 1,
    "stationType": "kitchen",
    "taxGroup": {
      "id": 1,
      "name": "GST 5%",
      "rate": 5
    },
    "variants": [
      {"id": 201, "name": "Half", "price": 169, "isDefault": false},
      {"id": 202, "name": "Full", "price": 299, "isDefault": true}
    ],
    "addonGroups": [
      {
        "id": 301,
        "name": "Extra Toppings",
        "isRequired": false,
        "minSelection": 0,
        "maxSelection": 3,
        "addons": [
          {"id": 401, "name": "Extra Cheese", "price": 50, "itemType": "veg"},
          {"id": 402, "name": "Jalapenos", "price": 30, "itemType": "veg"}
        ]
      }
    ]
  }
}
```

---

# 4. ORDER MANAGEMENT

## 4.1 Create New Order

**Endpoint:** `POST /orders`

### Request
```json
{
  "outletId": 1,
  "tableId": 1,
  "orderType": "dine_in",
  "covers": 4,
  "customerName": "Mr. Sharma",
  "customerPhone": "9876543210",
  "items": [
    {
      "itemId": 101,
      "variantId": 202,
      "quantity": 2,
      "addonIds": [401, 402],
      "specialInstructions": "Less spicy"
    },
    {
      "itemId": 105,
      "quantity": 1
    }
  ],
  "notes": "Birthday celebration - complimentary dessert"
}
```

### Response
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "id": 46,
    "orderNumber": "ORD-0046",
    "uuid": "ord-abc-123",
    "outletId": 1,
    "tableId": 1,
    "tableNumber": "T01",
    "orderType": "dine_in",
    "status": "pending",
    "covers": 4,
    "subtotal": 678.00,
    "taxAmount": 33.90,
    "total": 711.90,
    "items": [
      {
        "id": 1001,
        "itemId": 101,
        "name": "Paneer Tikka",
        "variantName": "Full",
        "quantity": 2,
        "unitPrice": 299,
        "addons": [
          {"name": "Extra Cheese", "price": 50},
          {"name": "Jalapenos", "price": 30}
        ],
        "addonTotal": 80,
        "lineTotal": 758.00,
        "specialInstructions": "Less spicy",
        "kotStatus": "pending"
      }
    ],
    "createdAt": "2024-01-15T12:35:00Z",
    "createdBy": "John Captain"
  }
}
```

---

## 4.2 Get Order Details

**Endpoint:** `GET /orders/{orderId}`

### Response
```json
{
  "success": true,
  "data": {
    "id": 46,
    "orderNumber": "ORD-0046",
    "tableId": 1,
    "tableNumber": "T01",
    "status": "confirmed",
    "orderType": "dine_in",
    "covers": 4,
    "subtotal": 678.00,
    "discountAmount": 0,
    "taxAmount": 33.90,
    "total": 711.90,
    "paidAmount": 0,
    "balanceAmount": 711.90,
    "items": [
      {
        "id": 1001,
        "name": "Paneer Tikka (Full)",
        "quantity": 2,
        "unitPrice": 379,
        "lineTotal": 758.00,
        "kotStatus": "preparing",
        "kotNumber": "KOT-0023"
      }
    ],
    "kots": [
      {
        "id": 23,
        "kotNumber": "KOT-0023",
        "status": "preparing",
        "station": "kitchen",
        "itemCount": 2,
        "sentAt": "2024-01-15T12:36:00Z"
      }
    ],
    "timeline": [
      {"action": "created", "time": "12:35:00", "by": "John Captain"},
      {"action": "kot_sent", "time": "12:36:00", "by": "John Captain"},
      {"action": "kot_accepted", "time": "12:36:30", "by": "Kitchen"}
    ]
  }
}
```

---

## 4.3 Add Items to Existing Order

**Endpoint:** `POST /orders/{orderId}/items`

### Request
```json
{
  "items": [
    {
      "itemId": 110,
      "quantity": 1,
      "specialInstructions": "Extra crispy"
    },
    {
      "itemId": 115,
      "variantId": 220,
      "quantity": 2
    }
  ]
}
```

### Response
```json
{
  "success": true,
  "message": "Items added successfully",
  "data": {
    "orderId": 46,
    "newItems": [
      {"id": 1003, "name": "French Fries", "quantity": 1, "kotStatus": "pending"},
      {"id": 1004, "name": "Mojito (Large)", "quantity": 2, "kotStatus": "pending"}
    ],
    "newSubtotal": 1028.00,
    "newTotal": 1079.40
  }
}
```

---

## 4.4 Update Item Quantity (Before KOT)

**Endpoint:** `PUT /orders/items/{orderItemId}/quantity`

**Note:** Only works for items not yet sent to KOT

### Request
```json
{
  "quantity": 3
}
```

### Response
```json
{
  "success": true,
  "data": {
    "orderItemId": 1001,
    "newQuantity": 3,
    "newLineTotal": 1137.00
  }
}
```

---

## 4.5 Cancel Order Item

**Endpoint:** `POST /orders/items/{orderItemId}/cancel`

### Request
```json
{
  "reason": "Customer changed mind",
  "cancelReasonId": 2
}
```

### Response
```json
{
  "success": true,
  "message": "Item cancelled",
  "data": {
    "orderItemId": 1001,
    "refundAmount": 758.00,
    "requiresApproval": true,
    "approvalStatus": "pending"
  }
}
```

---

## 4.6 Cancel Entire Order

**Endpoint:** `POST /orders/{orderId}/cancel`

### Request
```json
{
  "reason": "Customer left",
  "cancelReasonId": 5
}
```

### Response
```json
{
  "success": true,
  "message": "Order cancelled",
  "data": {
    "orderId": 46,
    "status": "cancelled",
    "refundAmount": 0,
    "requiresApproval": true
  }
}
```

---

## 4.7 Get Active Orders

**Endpoint:** `GET /orders/active/{outletId}`

### Query Parameters (Optional)
| Parameter | Type | Description |
|-----------|------|-------------|
| floorId | number | Filter by floor |
| status | string | Filter by status |
| captainId | number | Filter by captain |

### Response
```json
{
  "success": true,
  "data": [
    {
      "id": 46,
      "orderNumber": "ORD-0046",
      "tableNumber": "T01",
      "status": "confirmed",
      "total": 1079.40,
      "itemCount": 4,
      "kotPending": 2,
      "kotPreparing": 1,
      "kotReady": 0,
      "createdAt": "2024-01-15T12:35:00Z",
      "duration": "00:45:00"
    }
  ]
}
```

---

## 4.8 Get Orders by Table

**Endpoint:** `GET /orders/table/{tableId}`

### Response
```json
{
  "success": true,
  "data": {
    "tableId": 1,
    "tableNumber": "T01",
    "currentOrder": {
      "id": 46,
      "orderNumber": "ORD-0046",
      "status": "confirmed",
      "total": 1079.40
    },
    "previousOrders": []
  }
}
```

---

# 5. KOT MANAGEMENT

## 5.1 Send KOT

**Endpoint:** `POST /orders/{orderId}/kot`

**Description:** Send pending items to kitchen/bar

### Request (Optional - send specific items)
```json
{
  "itemIds": [1003, 1004]
}
```

### Response
```json
{
  "success": true,
  "message": "KOT sent successfully",
  "data": {
    "tickets": [
      {
        "id": 24,
        "kotNumber": "KOT-0024",
        "station": "kitchen",
        "stationType": "kitchen",
        "status": "pending",
        "itemCount": 1,
        "items": [
          {"name": "French Fries", "quantity": 1, "instructions": "Extra crispy"}
        ],
        "printerId": 1,
        "printed": true
      },
      {
        "id": 25,
        "kotNumber": "BOT-0025",
        "station": "bar",
        "stationType": "bar",
        "status": "pending",
        "itemCount": 1,
        "items": [
          {"name": "Mojito (Large)", "quantity": 2}
        ],
        "printerId": 2,
        "printed": true
      }
    ],
    "summary": {
      "totalTickets": 2,
      "kitchenItems": 1,
      "barItems": 1
    }
  }
}
```

---

## 5.2 Get KOTs for Order

**Endpoint:** `GET /orders/{orderId}/kots`

### Response
```json
{
  "success": true,
  "data": [
    {
      "id": 23,
      "kotNumber": "KOT-0023",
      "station": "kitchen",
      "status": "ready",
      "items": [
        {"name": "Paneer Tikka", "quantity": 2, "status": "ready"}
      ],
      "sentAt": "2024-01-15T12:36:00Z",
      "acceptedAt": "2024-01-15T12:36:30Z",
      "readyAt": "2024-01-15T12:50:00Z"
    },
    {
      "id": 24,
      "kotNumber": "KOT-0024",
      "station": "kitchen",
      "status": "preparing",
      "items": [
        {"name": "French Fries", "quantity": 1, "status": "preparing"}
      ],
      "sentAt": "2024-01-15T12:40:00Z"
    }
  ]
}
```

---

## 5.3 Get Running KOTs for Table

**Endpoint:** `GET /tables/{tableId}/kots`

### Response
```json
{
  "success": true,
  "data": {
    "tableId": 1,
    "tableNumber": "T01",
    "kots": [
      {
        "kotNumber": "KOT-0023",
        "status": "ready",
        "station": "kitchen",
        "readyItems": 2,
        "totalItems": 2
      }
    ],
    "summary": {
      "pending": 0,
      "preparing": 1,
      "ready": 1
    }
  }
}
```

---

## 5.4 Mark KOT as Served

**Endpoint:** `POST /orders/kot/{kotId}/served`

**Description:** Captain marks items as served to customer

### Response
```json
{
  "success": true,
  "message": "KOT marked as served",
  "data": {
    "kotId": 23,
    "kotNumber": "KOT-0023",
    "status": "served",
    "servedAt": "2024-01-15T12:55:00Z",
    "servedBy": "John Captain"
  }
}
```

---

## 5.5 Reprint KOT

**Endpoint:** `POST /orders/kot/{kotId}/reprint`

### Response
```json
{
  "success": true,
  "message": "KOT sent to printer",
  "data": {
    "kotNumber": "KOT-0023",
    "printJobId": 567
  }
}
```

---

## 5.6 Get Active KOTs (All)

**Endpoint:** `GET /orders/kot/active/{outletId}`

### Query Parameters (Optional)
| Parameter | Type | Description |
|-----------|------|-------------|
| station | string | Filter by station (kitchen/bar) |
| status | string | Filter by status |

### Response
```json
{
  "success": true,
  "data": [
    {
      "id": 23,
      "kotNumber": "KOT-0023",
      "orderNumber": "ORD-0046",
      "tableNumber": "T01",
      "station": "kitchen",
      "status": "ready",
      "itemCount": 2,
      "waitTime": "15:00"
    }
  ]
}
```

---

# 6. BILLING (Captain Initiated)

## 6.1 Request Bill

**Endpoint:** `POST /orders/{orderId}/bill`

**Description:** Captain requests bill generation (goes to cashier)

### Request
```json
{
  "discountId": 5,
  "discountAmount": 100,
  "notes": "Regular customer - 10% off"
}
```

### Response
```json
{
  "success": true,
  "message": "Bill generated",
  "data": {
    "invoiceId": 789,
    "invoiceNumber": "INV-2024-0789",
    "orderId": 46,
    "tableNumber": "T01",
    "subtotal": 1028.00,
    "discountAmount": 100.00,
    "taxAmount": 46.40,
    "total": 974.40,
    "status": "pending",
    "qrCode": "https://pay.example.com/inv/789"
  }
}
```

---

## 6.2 Apply Discount

**Endpoint:** `POST /orders/{orderId}/discount`

### Request
```json
{
  "discountType": "percentage",
  "discountValue": 10,
  "reason": "Regular customer",
  "approvalCode": "MGR123"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "orderId": 46,
    "discountAmount": 102.80,
    "newTotal": 976.60
  }
}
```

---

# 7. REAL-TIME WEBSOCKET EVENTS

## 7.1 Connection Setup

```javascript
const socket = io('http://localhost:3000', {
  auth: { token: accessToken }
});

// Join captain room for outlet
socket.emit('join:captain', outletId);

// Join specific floor
socket.emit('join:floor', { outletId: 1, floorId: 1 });
```

---

## 7.2 Events to Listen

### Table Updates
```javascript
socket.on('table:updated', (data) => {
  // data: { tableId, status, orderId, covers, ... }
  console.log('Table updated:', data);
});
```

### Order Updates
```javascript
socket.on('order:updated', (data) => {
  // data: { orderId, orderNumber, status, action, ... }
  console.log('Order updated:', data);
});
```

### KOT Ready Notification
```javascript
socket.on('item:ready', (data) => {
  // data: { kotId, kotNumber, tableNumber, items, station }
  // Show notification: "KOT-0023 Ready - Table T01"
  console.log('Items ready:', data);
});
```

### KOT Status Updates
```javascript
socket.on('kot:updated', (data) => {
  // data: { kotId, status, station, type }
  // type: 'kot:new', 'kot:accepted', 'kot:preparing', 'kot:ready', 'kot:served'
  console.log('KOT updated:', data);
});
```

### Payment Completed
```javascript
socket.on('payment:updated', (data) => {
  // data: { orderId, tableId, status, amount }
  // Update table status to available
  console.log('Payment:', data);
});
```

### Notifications
```javascript
socket.on('notification', (data) => {
  // data: { message, type, timestamp }
  // type: 'info', 'warning', 'success', 'error'
  console.log('Notification:', data);
});
```

---

## 7.3 Events to Emit

```javascript
// Leave floor when switching
socket.emit('leave:floor', { outletId: 1, floorId: 1 });

// Leave outlet on logout
socket.emit('leave:outlet', outletId);
```

---

# 8. COMPLETE WORKFLOW SCENARIOS

## Scenario 1: New Dine-In Order (Basic)

```
Step 1: Login
POST /auth/login/pin
{ "employeeCode": "CAP001", "pin": "1234", "outletId": 1 }

Step 2: View available tables
GET /tables/floor/1

Step 3: Occupy table
POST /tables/1/session
{ "covers": 4 }

Step 4: Get menu
GET /menu/1/captain

Step 5: Create order
POST /orders
{
  "outletId": 1,
  "tableId": 1,
  "orderType": "dine_in",
  "items": [{ "itemId": 101, "quantity": 2 }]
}

Step 6: Send KOT
POST /orders/46/kot

Step 7: [WebSocket] Listen for item:ready event

Step 8: Mark served
POST /orders/kot/23/served

Step 9: Request bill
POST /orders/46/bill

Step 10: [Cashier completes payment]

Step 11: End session
DELETE /tables/1/session
```

---

## Scenario 2: Order with Variants and Addons

```
Step 1-4: Same as Scenario 1

Step 5: Create order with variants/addons
POST /orders
{
  "outletId": 1,
  "tableId": 1,
  "orderType": "dine_in",
  "items": [
    {
      "itemId": 101,
      "variantId": 202,
      "quantity": 2,
      "addonIds": [401, 402],
      "specialInstructions": "Extra spicy"
    }
  ]
}

Step 6-11: Same as Scenario 1
```

---

## Scenario 3: Add Items to Running Order

```
Step 1: Get existing order
GET /orders/table/1

Step 2: Add more items
POST /orders/46/items
{
  "items": [
    { "itemId": 110, "quantity": 1 },
    { "itemId": 115, "quantity": 2 }
  ]
}

Step 3: Send new KOT (only new items)
POST /orders/46/kot
```

---

## Scenario 4: Mixed Order (Kitchen + Bar)

```
Step 1: Create order with food and drinks
POST /orders
{
  "outletId": 1,
  "tableId": 1,
  "orderType": "dine_in",
  "items": [
    { "itemId": 101, "quantity": 2 },  // Food → Kitchen
    { "itemId": 201, "quantity": 2 }   // Drink → Bar
  ]
}

Step 2: Send KOT (auto-routes to stations)
POST /orders/46/kot

Response shows 2 tickets:
- KOT-0024 → Kitchen (food items)
- BOT-0025 → Bar (drink items)

Step 3: Listen for ready events from both stations
socket.on('item:ready', ...)
```

---

## Scenario 5: Table Transfer

```
Step 1: Get running order on table
GET /orders/table/1

Step 2: Transfer to new table
POST /orders/46/transfer
{ "toTableId": 5, "reason": "Customer request" }

Step 3: Table 1 becomes available, Table 5 occupied
```

---

## Scenario 6: Cancel Item (Before KOT)

```
Step 1: Update quantity to 0 or cancel
POST /orders/items/1001/cancel
{ "reason": "Customer changed mind" }
```

---

## Scenario 7: Cancel Item (After KOT - Needs Approval)

```
Step 1: Cancel item
POST /orders/items/1001/cancel
{ "reason": "Kitchen issue", "cancelReasonId": 3 }

Response: { "requiresApproval": true, "approvalStatus": "pending" }

Step 2: Manager approves via manager app
```

---

## Scenario 8: Merge Tables for Large Party

```
Step 1: Start session on primary table
POST /tables/1/session
{ "covers": 8 }

Step 2: Merge adjacent tables
POST /tables/1/merge
{ "tableIds": [2, 3] }

Step 3: Create order (uses primary table)
POST /orders
{ "tableId": 1, ... }

Step 4: After payment, unmerge
DELETE /tables/1/merge
```

---

## Scenario 9: Apply Discount

```
Step 1: Apply percentage discount
POST /orders/46/discount
{
  "discountType": "percentage",
  "discountValue": 10,
  "reason": "Happy hour"
}

Step 2: Or apply fixed discount
POST /orders/46/discount
{
  "discountType": "fixed",
  "discountValue": 100,
  "reason": "Complimentary"
}
```

---

## Scenario 10: Split Order Between Tables

```
Step 1: Get order items
GET /orders/46

Step 2: Transfer specific items to new order
POST /orders/46/split
{
  "itemIds": [1003, 1004],
  "toTableId": 5
}
```

---

# 9. ERROR RESPONSES

## Common Error Codes

| Code | Message | Resolution |
|------|---------|------------|
| 401 | Unauthorized | Re-login with valid token |
| 403 | Forbidden | User lacks permission |
| 404 | Not found | Check ID exists |
| 409 | Conflict | Table occupied / Order already billed |
| 422 | Validation error | Check request payload |

## Error Response Format
```json
{
  "success": false,
  "message": "Table is currently occupied",
  "code": "TABLE_OCCUPIED",
  "details": {
    "tableId": 1,
    "currentOrderId": 45
  }
}
```

---

# 10. TESTING CHECKLIST

## Authentication
- [ ] Login with valid PIN
- [ ] Login with invalid PIN (should fail)
- [ ] Access API without token (should fail)
- [ ] Access API with expired token (should fail)
- [ ] Logout and verify token invalid

## Tables
- [ ] View tables by floor
- [ ] Start session on available table
- [ ] Start session on occupied table (should fail)
- [ ] End session
- [ ] Merge tables
- [ ] Unmerge tables
- [ ] Transfer order

## Menu
- [ ] Get captain menu
- [ ] Filter by category
- [ ] Search items
- [ ] Verify visibility rules (floor/section/time)
- [ ] Verify global items visible everywhere

## Orders
- [ ] Create simple order
- [ ] Create order with variants
- [ ] Create order with addons
- [ ] Add items to existing order
- [ ] Update quantity before KOT
- [ ] Cancel item before KOT
- [ ] Cancel item after KOT (approval flow)
- [ ] Cancel entire order

## KOT
- [ ] Send KOT for all pending items
- [ ] Verify routing (kitchen vs bar)
- [ ] Receive ready notification
- [ ] Mark as served
- [ ] Reprint KOT

## Real-time
- [ ] Connect WebSocket
- [ ] Join captain room
- [ ] Receive table updates
- [ ] Receive KOT ready notifications
- [ ] Receive order updates

---

# 11. POSTMAN COLLECTION

Import the collection from:
```
docs/postman/RestroPOS-Captain-Modules.postman_collection.json
```

Set environment variables:
```
baseUrl: http://localhost:3000/api/v1
captainToken: (set after login)
outletId: 1
floorId: 1
tableId: 1
orderId: (set after order creation)
```
