# Customer GST & Order History API Documentation

## Overview
This API allows cashiers to manage customers, track order history, and handle B2B GST billing with interstate IGST support.

---

## Shift History: cashVariance vs expectedCash

| Field | Description |
|-------|-------------|
| **expectedCash** | System-calculated cash amount = `Opening Cash + Cash Sales - Cash Refunds - Cash Payouts`. This is what SHOULD be in the drawer based on all recorded transactions. |
| **closingCash** | The actual physical cash counted by the cashier when closing the shift. |
| **cashVariance** | Difference = `closingCash - expectedCash`. **Positive** = surplus (more cash than expected). **Negative** = shortage (less cash than expected). |

### Example:
```
Opening Cash:     ₹5,000
+ Cash Sales:     ₹12,500
- Cash Refunds:   ₹500
- Cash Payouts:   ₹1,000
───────────────────────────
Expected Cash:    ₹16,000

Actual Count:     ₹15,850
Cash Variance:    -₹150 (shortage)
```

---

## Customer API Endpoints

**Base URL:** `/api/v1/customers`  
**Auth Required:** Yes (Bearer Token)  
**Roles:** super_admin, admin, manager, cashier

---

### 1. Create Customer
**POST** `/customers/:outletId`

Creates a new customer for the outlet.

#### Request:
```json
{
  "name": "Rajesh Kumar",
  "phone": "9876543210",
  "email": "rajesh@example.com",
  "address": "123 Main Street, Indore",
  
  // Optional GST details (for B2B customers)
  "isGstCustomer": true,
  "companyName": "ABC Traders Pvt Ltd",
  "gstin": "23AABCU9603R1ZM",
  "gstState": "Madhya Pradesh",
  "gstStateCode": "23",
  "companyPhone": "0731-2345678",
  "companyAddress": "456 Industrial Area, Indore",
  "notes": "Regular wholesale customer"
}
```

#### Response (201):
```json
{
  "success": true,
  "message": "Customer created successfully",
  "data": {
    "id": 15,
    "uuid": "cust-abc123",
    "outletId": 4,
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "email": "rajesh@example.com",
    "isGstCustomer": true,
    "companyName": "ABC Traders Pvt Ltd",
    "gstin": "23AABCU9603R1ZM",
    "gstState": "Madhya Pradesh",
    "gstStateCode": "23",
    "totalOrders": 0,
    "totalSpent": 0,
    "createdAt": "2026-02-19T17:00:00.000Z"
  }
}
```

---

### 2. Search Customers
**GET** `/customers/:outletId/search?q=rajesh`

Search by name, phone, company name, or GSTIN.

#### Query Parameters:
- `q` (required): Search query (min 2 chars)
- `limit` (optional): Max results (default: 20)

#### Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "name": "Rajesh Kumar",
      "phone": "9876543210",
      "companyName": "ABC Traders Pvt Ltd",
      "gstin": "23AABCU9603R1ZM",
      "totalOrders": 5,
      "totalSpent": 25000,
      "lastOrderAt": "2026-02-18T14:30:00.000Z"
    }
  ],
  "count": 1
}
```

---

### 3. Get Customer by Phone
**GET** `/customers/:outletId/by-phone?phone=9876543210`

Quick lookup for cashier when customer provides phone number.

#### Response:
```json
{
  "success": true,
  "data": {
    "id": 15,
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "isGstCustomer": true,
    "companyName": "ABC Traders Pvt Ltd",
    "gstin": "23AABCU9603R1ZM",
    "gstState": "Madhya Pradesh",
    "gstStateCode": "23",
    "totalOrders": 5,
    "totalSpent": 25000
  }
}
```

---

### 4. Get Customer by ID
**GET** `/customers/:id`

#### Response:
```json
{
  "success": true,
  "data": {
    "id": 15,
    "uuid": "cust-abc123",
    "outletId": 4,
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "email": "rajesh@example.com",
    "address": "123 Main Street, Indore",
    "isGstCustomer": true,
    "companyName": "ABC Traders Pvt Ltd",
    "gstin": "23AABCU9603R1ZM",
    "gstState": "Madhya Pradesh",
    "gstStateCode": "23",
    "companyPhone": "0731-2345678",
    "companyAddress": "456 Industrial Area, Indore",
    "totalOrders": 5,
    "totalSpent": 25000,
    "lastOrderAt": "2026-02-18T14:30:00.000Z",
    "notes": "Regular wholesale customer",
    "isActive": true
  }
}
```

---

### 5. Update Customer
**PUT** `/customers/:id`

#### Request:
```json
{
  "name": "Rajesh Kumar Singh",
  "phone": "9876543211",
  "gstin": "23AABCU9603R1ZN",
  "notes": "Updated contact number"
}
```

#### Response:
```json
{
  "success": true,
  "message": "Customer updated successfully",
  "data": { /* updated customer object */ }
}
```

---

### 6. Get Customer Order History
**GET** `/customers/:id/orders`

View past orders for a customer (for cashier reference).

#### Query Parameters:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

#### Response:
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": 245,
        "orderNumber": "ORD-20260218-0045",
        "orderDate": "2026-02-18",
        "orderTime": "14:30:00",
        "orderType": "dine_in",
        "status": "completed",
        "subtotal": 1200,
        "taxAmount": 60,
        "totalAmount": 1260,
        "itemCount": 4
      },
      {
        "id": 198,
        "orderNumber": "ORD-20260215-0023",
        "orderDate": "2026-02-15",
        "orderTime": "19:45:00",
        "orderType": "takeaway",
        "status": "completed",
        "subtotal": 850,
        "taxAmount": 42.5,
        "totalAmount": 893,
        "itemCount": 2
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1
    }
  }
}
```

---

### 7. Link Customer to Order
**POST** `/customers/link-order/:orderId`

Link an existing or new customer to an order. Creates customer if not found.

#### Request (Existing Customer):
```json
{
  "customerId": 15
}
```

#### Request (New Customer):
```json
{
  "name": "Amit Sharma",
  "phone": "9988776655"
}
```

#### Response:
```json
{
  "success": true,
  "message": "Customer linked to order",
  "data": {
    "customerId": 15,
    "orderId": 245,
    "customerName": "Rajesh Kumar",
    "customerPhone": "9876543210"
  }
}
```

---

### 8. Update Order GST (Interstate Detection)
**PUT** `/customers/order-gst/:orderId`

Add customer GST details to order. **Automatically detects interstate** and sets `is_interstate = true` if customer state differs from outlet state.

#### Request:
```json
{
  "customerId": 15,
  "customerGstin": "27AABCU9603R1ZM",
  "customerCompanyName": "XYZ Enterprises",
  "customerGstState": "Maharashtra",
  "customerGstStateCode": "27"
}
```

#### Response (Interstate Detected - Different State):
```json
{
  "success": true,
  "message": "Order GST details updated (Interstate)",
  "data": {
    "orderId": 245,
    "isInterstate": true,
    "customerGstin": "27AABCU9603R1ZM",
    "customerCompanyName": "XYZ Enterprises",
    "customerGstState": "Maharashtra",
    "customerGstStateCode": "27",
    "outletState": "Madhya Pradesh",
    "outletStateCode": "23"
  }
}
```

#### Response (Intrastate - Same State):
```json
{
  "success": true,
  "message": "Order GST details updated",
  "data": {
    "orderId": 245,
    "isInterstate": false,
    "customerGstin": "23AABCU9603R1ZM",
    "customerCompanyName": "ABC Traders",
    "customerGstState": "Madhya Pradesh",
    "customerGstStateCode": "23"
  }
}
```

---

## Workflow: Cashier Adding Customer at Billing

### Step 1: Search for Existing Customer
```
GET /api/v1/customers/4/by-phone?phone=9876543210
```
- If found → show order history and link to order
- If not found → create new customer

### Step 2: Create New Customer (if needed)
```
POST /api/v1/customers/4
{ "name": "John Doe", "phone": "9876543210" }
```

### Step 3: Link Customer to Order
```
POST /api/v1/customers/link-order/245
{ "customerId": 15 }
```

### Step 4: Add GST Details (if B2B customer)
```
PUT /api/v1/customers/order-gst/245
{
  "customerId": 15,
  "customerGstin": "27AABCU9603R1ZM",
  "customerCompanyName": "XYZ Enterprises",
  "customerGstState": "Maharashtra",
  "customerGstStateCode": "27"
}
```

### Step 5: Generate Bill
Bill will automatically use:
- **CGST + SGST** if customer state = outlet state (intrastate)
- **IGST** if customer state ≠ outlet state (interstate)

---

## GST State Codes Reference

| Code | State |
|------|-------|
| 23 | Madhya Pradesh |
| 27 | Maharashtra |
| 09 | Uttar Pradesh |
| 07 | Delhi |
| 29 | Karnataka |
| 33 | Tamil Nadu |
| 24 | Gujarat |
| 06 | Haryana |
| 03 | Punjab |
| 08 | Rajasthan |

---

## Testing Scenarios

### Test 1: Intrastate Order (Same State)
1. Create order in outlet (state: MP - 23)
2. Add customer from MP (state code: 23)
3. Generate bill → Should show **CGST 2.5% + SGST 2.5%**

### Test 2: Interstate Order (Different State)
1. Create order in outlet (state: MP - 23)
2. Add customer from Maharashtra (state code: 27)
3. Generate bill → Should show **IGST 5%**

### Test 3: Customer Order History
1. Create customer with phone 9876543210
2. Complete 3 orders linked to this customer
3. Call GET `/customers/:id/orders`
4. Verify all 3 orders appear with correct totals
