# Order, Bill & GST Flow - Step by Step API Guide

## Overview
This document provides a complete step-by-step flow for order creation, customer linking, GST handling, and bill generation.

---

## Tax Type Logic

| Scenario | Customer State Code | Outlet State Code | Tax Type | Description |
|----------|---------------------|-------------------|----------|-------------|
| **Same State** | 23 (MP) | 23 (MP) | `CGST+SGST` | Intrastate supply - Central + State GST |
| **Different State** | 27 (MH) | 23 (MP) | `IGST` | Interstate supply - Integrated GST |
| **No GST Customer** | - | 23 (MP) | `CGST+SGST` | Default intrastate |

---

## Complete Flow

### Step 1: Create Order
**POST** `/api/v1/orders`

```json
{
  "outletId": 4,
  "tableId": 12,
  "orderType": "dine_in",
  "items": [
    { "itemId": 101, "quantity": 2 },
    { "itemId": 205, "quantity": 1 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 245,
    "orderNumber": "ORD-20260220-0045",
    "status": "pending",
    "orderType": "dine_in",
    "tableId": 12,
    "subtotal": 1200,
    "taxAmount": 60
  }
}
```

---

### Step 2: Search Customer by Phone (Partial Search)
**GET** `/api/v1/customers/4/by-phone?phone=9876`

Supports partial phone matching. Returns:
- **Single match**: Returns customer object
- **Multiple matches**: Returns array of customers
- **No match**: Returns `null`

**Response (Single Match):**
```json
{
  "success": true,
  "data": {
    "id": 15,
    "name": "Rajesh Kumar",
    "phone": "9876543210",
    "isGstCustomer": true,
    "gstin": "23AABCU9603R1ZM",
    "companyName": "ABC Traders",
    "gstState": "Madhya Pradesh",
    "gstStateCode": "23"
  }
}
```

**Response (Multiple Matches):**
```json
{
  "success": true,
  "data": [
    { "id": 15, "name": "Rajesh Kumar", "phone": "9876543210" },
    { "id": 22, "name": "Suresh Singh", "phone": "9876543211" }
  ]
}
```

**Response (No Match):**
```json
{
  "success": true,
  "data": null
}
```

---

### Step 3: Link Customer to Order

#### Option A: Link Existing Customer
**POST** `/api/v1/customers/link-order/245`

```json
{
  "customerId": 15
}
```

#### Option B: Create New Customer (Basic)
**POST** `/api/v1/customers/link-order/245`

```json
{
  "name": "Amit Sharma",
  "phone": "9988776655"
}
```

#### Option C: Create New Customer with GST (Same State - CGST+SGST)
**POST** `/api/v1/customers/link-order/245`

```json
{
  "name": "Local Traders",
  "phone": "9988776655",
  "isGstCustomer": true,
  "companyName": "Local Traders Pvt Ltd",
  "gstin": "23AABCU9603R1ZM",
  "companyPhone": "0731-2345678",
  "isInterstate": false
}
```

**Response (Same State - CGST+SGST):**
```json
{
  "success": true,
  "message": "Customer linked to order",
  "data": {
    "customerId": 25,
    "orderId": 245,
    "customerName": "Local Traders",
    "customerPhone": "9988776655",
    "isGstCustomer": true,
    "gstin": "23AABCU9603R1ZM",
    "companyName": "Local Traders Pvt Ltd",
    "isInterstate": false,
    "taxType": "CGST+SGST"
  }
}
```

#### Option D: Create New Customer with GST (Interstate - IGST)
**POST** `/api/v1/customers/link-order/245`

```json
{
  "name": "Mumbai Enterprises",
  "phone": "9988776655",
  "isGstCustomer": true,
  "companyName": "Mumbai Enterprises Pvt Ltd",
  "gstin": "27AABCU9603R1ZM",
  "companyPhone": "022-12345678",
  "isInterstate": true
}
```

**Response (Interstate - IGST):**
```json
{
  "success": true,
  "message": "Customer linked to order",
  "data": {
    "customerId": 26,
    "orderId": 245,
    "customerName": "Mumbai Enterprises",
    "customerPhone": "9988776655",
    "isGstCustomer": true,
    "gstin": "27AABCU9603R1ZM",
    "companyName": "Mumbai Enterprises Pvt Ltd",
    "isInterstate": true,
    "taxType": "IGST"
  }
}
```

---

### Step 4: Update Order GST Details (Optional)

Use this if customer GST details need to be updated after linking.

**PUT** `/api/v1/customers/order-gst/245`

#### Same State (CGST+SGST):
```json
{
  "customerId": 15,
  "gstin": "23AABCU9603R1ZM",
  "companyName": "ABC Traders",
  "companyPhone": "0731-2345678",
  "isInterstate": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order GST details updated",
  "data": {
    "orderId": 245,
    "isInterstate": false,
    "taxType": "CGST+SGST",
    "customerId": 15,
    "gstin": "23AABCU9603R1ZM",
    "companyName": "ABC Traders"
  }
}
```

#### Interstate (IGST):
```json
{
  "customerId": 15,
  "gstin": "27AABCU9603R1ZM",
  "companyName": "XYZ Enterprises",
  "companyPhone": "022-12345678",
  "isInterstate": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order GST details updated",
  "data": {
    "orderId": 245,
    "isInterstate": true,
    "taxType": "IGST",
    "customerId": 15,
    "gstin": "27AABCU9603R1ZM",
    "companyName": "XYZ Enterprises"
  }
}
```

> **Important:** This also updates the customer record, so GST details will be available next time the customer is fetched.

---

### Step 5: Generate Bill
**POST** `/api/v1/billing/generate/245`

```json
{
  "applyServiceCharge": true,
  "generatedBy": 5
}
```

**Response (Intrastate - CGST+SGST):**
```json
{
  "success": true,
  "data": {
    "id": 180,
    "invoiceNumber": "INV/2526/000180",
    "invoiceDate": "2026-02-20",
    "orderNumber": "ORD-20260220-0045",
    "customerName": "Local Traders",
    "customerPhone": "9988776655",
    "customerGstin": "23AABCU9603R1ZM",
    "customerCompanyName": "Local Traders Pvt Ltd",
    "customerGstState": "Madhya Pradesh",
    "customerGstStateCode": "23",
    "isInterstate": false,
    "subtotal": 1200.00,
    "taxableAmount": 1200.00,
    "cgstAmount": 30.00,
    "sgstAmount": 30.00,
    "igstAmount": 0.00,
    "totalTax": 60.00,
    "serviceCharge": 60.00,
    "grandTotal": 1320.00,
    "taxBreakup": {
      "CGST": { "name": "CGST", "rate": 2.5, "taxAmount": 30.00 },
      "SGST": { "name": "SGST", "rate": 2.5, "taxAmount": 30.00 }
    }
  }
}
```

**Response (Interstate - IGST):**
```json
{
  "success": true,
  "data": {
    "id": 181,
    "invoiceNumber": "INV/2526/000181",
    "invoiceDate": "2026-02-20",
    "orderNumber": "ORD-20260220-0046",
    "customerName": "Mumbai Enterprises",
    "customerPhone": "9988776655",
    "customerGstin": "27AABCU9603R1ZM",
    "customerCompanyName": "Mumbai Enterprises Pvt Ltd",
    "customerGstState": "Maharashtra",
    "customerGstStateCode": "27",
    "isInterstate": true,
    "subtotal": 1200.00,
    "taxableAmount": 1200.00,
    "cgstAmount": 0.00,
    "sgstAmount": 0.00,
    "igstAmount": 60.00,
    "totalTax": 60.00,
    "serviceCharge": 60.00,
    "grandTotal": 1320.00,
    "taxBreakup": {
      "IGST": { "name": "IGST", "rate": 5, "taxAmount": 60.00 }
    }
  }
}
```

---

### Step 6: Process Payment
**POST** `/api/v1/payments/process/245`

```json
{
  "payments": [
    { "method": "cash", "amount": 1320 }
  ],
  "processedBy": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "orderId": 245,
    "status": "completed",
    "totalPaid": 1320.00,
    "change": 0.00
  }
}
```

---

## Thermal Bill Print Format

### Same State Customer (CGST+SGST):
```
================================
        RESTAURANT NAME
================================
Add. 123 Main Street, Indore
Mob. 9876543210
GSTIN: 23AABCU9603R1ZM
--------------------------------
Date: 20/02/26          Dine In
14:30
Cashier: Admin     Bill No.: INV/2526/000180
--------------------------------
Customer: Local Traders
Phone: 9988776655
Company: Local Traders Pvt Ltd
GSTIN: 23AABCU9603R1ZM
State: Madhya Pradesh (23)
--------------------------------
Item           Qty.   Price  Amount
--------------------------------
Butter Paneer    2   250.00  500.00
Naan             4    50.00  200.00
--------------------------------
Total Qty: 6              Sub 700.00
CGST@2.5%                      17.50
SGST@2.5%                      17.50
Service Charge:                35.00
--------------------------------
        Grand Total ₹ 770.00
--------------------------------
           THANKS VISIT AGAIN
```

### Interstate Customer (IGST):
```
================================
        RESTAURANT NAME
================================
Add. 123 Main Street, Indore
Mob. 9876543210
GSTIN: 23AABCU9603R1ZM
--------------------------------
Date: 20/02/26          Dine In
14:30
Cashier: Admin     Bill No.: INV/2526/000181
--------------------------------
Customer: Mumbai Enterprises
Phone: 9988776655
Company: Mumbai Enterprises Pvt Ltd
GSTIN: 27AABCU9603R1ZM
State: Maharashtra (27)
** INTERSTATE SUPPLY **
--------------------------------
Item           Qty.   Price  Amount
--------------------------------
Butter Paneer    2   250.00  500.00
Naan             4    50.00  200.00
--------------------------------
Total Qty: 6              Sub 700.00
IGST@5%                        35.00
Service Charge:                35.00
--------------------------------
        Grand Total ₹ 770.00
--------------------------------
           THANKS VISIT AGAIN
```

### Walk-in Customer (No Customer Linked):
```
--------------------------------
Customer: Walk-in Customer
--------------------------------
```

---

## Indian State Codes Reference

| State | Code |
|-------|------|
| Madhya Pradesh | 23 |
| Maharashtra | 27 |
| Gujarat | 24 |
| Rajasthan | 08 |
| Uttar Pradesh | 09 |
| Karnataka | 29 |
| Delhi | 07 |
| Tamil Nadu | 33 |
| West Bengal | 19 |
| Kerala | 32 |

---

## Error Handling

### Customer Not Found
```json
{
  "success": false,
  "message": "Customer not found"
}
```

### Order Already Billed
```json
{
  "success": false,
  "message": "Order already paid"
}
```

### Invalid GSTIN Format
```json
{
  "success": false,
  "message": "Invalid GSTIN format"
}
```

---

## Summary

| Field | Same State | Different State |
|-------|------------|-----------------|
| `isInterstate` | `false` | `true` |
| `taxType` | `CGST+SGST` | `IGST` |
| `cgstAmount` | Calculated | `0` |
| `sgstAmount` | Calculated | `0` |
| `igstAmount` | `0` | Calculated |

The system automatically detects interstate transactions by comparing `gstStateCode` with `outletStateCode` from business profile.
