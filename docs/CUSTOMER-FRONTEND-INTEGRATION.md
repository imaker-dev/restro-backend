# Customer APIs Frontend Integration Guide

## Overview
This guide explains how to integrate these customer APIs in frontend apps:

1. Customer List API (with advanced filtering)
2. Customer Details API (full profile + full order history)

Base URL:
`/api/v1/customers`

Auth:
Use `Authorization: Bearer <token>` on every request.

Allowed roles:
`super_admin`, `admin`, `manager`, `cashier`

---

## 1. Customer List API

### Endpoint
`GET /api/v1/customers/:outletId/list`

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default `1`) |
| `limit` | number | Page size (default `50`, max `200`) |
| `search` | string | Search in name/phone/email/company/GSTIN |
| `gstOnly` | boolean | Backward-compatible GST filter |
| `isGstCustomer` | boolean | Explicit GST customer filter |
| `isActive` | boolean | Active/inactive customer filter |
| `hasPhone` | boolean | Filter customers having phone |
| `hasEmail` | boolean | Filter customers having email |
| `isInterstate` | boolean | Interstate customer filter |
| `minTotalSpent` | number | Minimum total spending |
| `maxTotalSpent` | number | Maximum total spending |
| `minTotalOrders` | number | Minimum orders count |
| `maxTotalOrders` | number | Maximum orders count |
| `createdFrom` | string | Customer created from datetime |
| `createdTo` | string | Customer created to datetime |
| `lastOrderFrom` | string | Last order from datetime |
| `lastOrderTo` | string | Last order to datetime |
| `orderType` | string | `dine_in \| takeaway \| delivery \| online` |
| `paymentStatus` | string | `pending \| partial \| completed \| refunded` |
| `sortBy` | string | `name`, `createdAt`, `updatedAt`, `totalOrders`, `totalSpent`, `lastOrderAt`, `avgOrderValue` |
| `sortOrder` | string | `ASC` or `DESC` |

### Example Request
```http
GET /api/v1/customers/44/list?page=1&limit=20&search=amit&isActive=true&minTotalSpent=1000&sortBy=lastOrderAt&sortOrder=DESC
Authorization: Bearer <token>
```

### Response Shape
```json
{
  "success": true,
  "customers": [
    {
      "id": 15,
      "uuid": "b7e6...",
      "outletId": 44,
      "name": "Amit Sharma",
      "phone": "9988776655",
      "email": "amit@example.com",
      "address": null,
      "isGstCustomer": true,
      "companyName": "ABC Pvt Ltd",
      "gstin": "27ABCDE1234F1Z5",
      "gstState": "Maharashtra",
      "gstStateCode": "27",
      "companyPhone": null,
      "companyAddress": null,
      "isInterstate": true,
      "totalOrders": 12,
      "totalSpent": 22450.5,
      "lastOrderAt": "2026-02-27T11:22:00.000Z",
      "firstOrderAt": "2026-01-04T09:10:00.000Z",
      "avgOrderValue": 1870.87,
      "notes": null,
      "isActive": true,
      "createdAt": "2026-01-04T09:10:00.000Z",
      "updatedAt": "2026-02-27T11:22:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 148,
    "totalPages": 8
  },
  "summary": {
    "totalCustomers": 148,
    "gstCustomers": 27,
    "activeCustomers": 145,
    "totalOrders": 1200,
    "totalSpent": 1895500.75
  }
}
```

---

## 2. Customer Details API

### Endpoint
`GET /api/v1/customers/:outletId/details/:customerId`

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `includeOrders` | boolean | Include order history (default `true`) |
| `includeItems` | boolean | Include order items (default `true`) |
| `includePayments` | boolean | Include payment rows (default `true`) |
| `includeCancelledOrders` | boolean | Include cancelled orders (default `true`) |
| `paginate` | boolean | Paginate order history (`false` by default) |
| `page` | number | Required when `paginate=true` |
| `limit` | number | Required when `paginate=true` |
| `search` | string | Search by order/invoice/table |
| `status` | string | Order status filter |
| `paymentStatus` | string | Order payment status filter |
| `orderType` | string | `dine_in \| takeaway \| delivery \| online` |
| `fromDate` | string | Orders from datetime |
| `toDate` | string | Orders to datetime |
| `minAmount` | number | Min order total |
| `maxAmount` | number | Max order total |
| `sortBy` | string | `createdAt`, `billedAt`, `totalAmount`, `orderNumber`, `invoiceDate` |
| `sortOrder` | string | `ASC` or `DESC` |

### Example Request (Full History)
```http
GET /api/v1/customers/44/details/15?includeItems=true&includePayments=true&includeCancelledOrders=false&sortBy=createdAt&sortOrder=DESC
Authorization: Bearer <token>
```

### Example Request (Paginated History)
```http
GET /api/v1/customers/44/details/15?paginate=true&page=1&limit=10&status=paid
Authorization: Bearer <token>
```

### Response Shape
```json
{
  "success": true,
  "customer": {
    "id": 15,
    "name": "Amit Sharma",
    "phone": "9988776655",
    "isGstCustomer": true,
    "totalOrders": 12,
    "totalSpent": 22450.5,
    "firstOrderAt": "2026-01-04T09:10:00.000Z",
    "lastOrderAt": "2026-02-27T11:22:00.000Z",
    "avgOrderValue": 1870.87
  },
  "orderHistory": [
    {
      "id": 901,
      "orderNumber": "ORD2602270012",
      "orderType": "dine_in",
      "status": "paid",
      "paymentStatus": "completed",
      "totalAmount": 1480,
      "invoice": {
        "id": 341,
        "invoiceNumber": "INV/2526/000341",
        "grandTotal": 1480
      },
      "items": [
        {
          "id": 1801,
          "itemName": "Paneer Tikka",
          "quantity": 2,
          "totalPrice": 520
        }
      ],
      "payments": [
        {
          "id": 1201,
          "paymentMode": "upi",
          "totalAmount": 1480,
          "status": "completed"
        }
      ],
      "createdAt": "2026-02-27T11:22:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 12,
    "totalPages": 2
  },
  "historyStats": {
    "totalOrders": 12,
    "activeOrders": 12,
    "cancelledOrders": 0,
    "fullyPaidOrders": 10,
    "totalSpent": 22450.5,
    "avgOrderValue": 1870.87,
    "firstOrderAt": "2026-01-04T09:10:00.000Z",
    "lastOrderAt": "2026-02-27T11:22:00.000Z"
  },
  "historyBreakdown": {
    "byOrderType": [
      { "orderType": "dine_in", "count": 8, "amount": 15000 },
      { "orderType": "takeaway", "count": 4, "amount": 7450.5 }
    ],
    "byPaymentStatus": [
      { "paymentStatus": "completed", "count": 10, "amount": 21000 },
      { "paymentStatus": "pending", "count": 2, "amount": 1450.5 }
    ]
  }
}
```

---

## Frontend Integration (Recommended)

### 1. API Client Helpers (TypeScript)
```ts
type QueryValue = string | number | boolean | undefined | null;

function toQuery(params: Record<string, QueryValue>) {
  const qp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qp.set(k, String(v));
  });
  return qp.toString();
}

export async function fetchCustomers(
  outletId: number,
  filters: Record<string, QueryValue>,
  token: string
) {
  const q = toQuery(filters);
  const res = await fetch(`/api/v1/customers/${outletId}/list?${q}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function fetchCustomerDetails(
  outletId: number,
  customerId: number,
  filters: Record<string, QueryValue>,
  token: string
) {
  const q = toQuery(filters);
  const res = await fetch(`/api/v1/customers/${outletId}/details/${customerId}?${q}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}
```

### 2. List Page UX
Use:
- debounce (`300-500ms`) for `search`
- server-side pagination from `pagination`
- summary cards from `summary`
- sortable table/grid using `sortBy` + `sortOrder`

### 3. Details Page UX
Render:
- profile header from `customer`
- KPI cards from `historyStats`
- charts/segments from `historyBreakdown`
- order timeline/table from `orderHistory`

Use `paginate=true` if customer history is large.

### 4. Error Handling
- `401/403`: redirect to login or show access denied
- `404` (details API): show "Customer not found for this outlet"
- `500`: show retry action

---

## Ready-to-Use Endpoint Examples

Customer list:
```http
GET /api/v1/customers/44/list?page=1&limit=20&search=amit&isActive=true&hasPhone=true&sortBy=totalSpent&sortOrder=DESC
```

Top GST customers:
```http
GET /api/v1/customers/44/list?isGstCustomer=true&minTotalSpent=5000&sortBy=totalSpent&sortOrder=DESC
```

Customer details with compact payload:
```http
GET /api/v1/customers/44/details/15?includeItems=false&includePayments=false
```

Customer details with paginated history:
```http
GET /api/v1/customers/44/details/15?paginate=true&page=2&limit=10
```

---

## Notes
- The list/details responses return payload directly at root (`customers`, `customer`, `orderHistory`, etc.), not inside a `data` wrapper.
- Send datetime filters in backend-parseable format, e.g. `YYYY-MM-DD` or `YYYY-MM-DD HH:mm:ss`.
- For very large histories, always use `paginate=true`.
