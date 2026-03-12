# Due Payment Feature API Documentation

## Overview

The Due Payment feature allows cashiers to accept partial payments from customers and track the remaining due amount. This feature requires customer information (name and phone) to be linked to the order.

## How It Works

1. **Payment with Due**: When processing payment via `/api/v1/orders/payment`, if:
   - The payment amount is less than the total bill
   - The order has a linked customer with name and phone
   - The system creates a "due" balance for that customer

2. **Order Completion**: Orders with due amounts are marked as `completed` (not blocked)
   - Table is released (same as full payment)
   - KOTs and order items are marked as served
   - Invoice status is set to `partial`

3. **Due Collection**: Cashiers can collect the due amount via:
   - **Same payment API** (`/api/v1/orders/payment`) - just make another payment on the order
   - **Dedicated due collection API** (`/api/v1/customers/:outletId/due/:customerId/collect`)

4. **Pending Bills Filtering**:
   - `?status=pending` - Shows only unpaid bills (excludes partial/due)
   - `?status=partial` or `?status=due` - Shows only partial payment bills
   - `?status=completed` - Shows fully paid bills
   - `?status=all` - Shows all bills

## Payment Flow

```
Customer places order → Bill generated → Partial payment received
                                              ↓
                          Customer has name + phone? 
                                   ↓
                    Yes: Create due, complete order
                    No: Keep order as partial (cannot complete)
```

## API Endpoints

### 1. Process Payment (existing endpoint, now supports due)

**POST** `/api/v1/orders/payment`

```json
{
  "orderId": 123,
  "invoiceId": 456,
  "paymentMode": "cash",
  "amount": 500.00
}
```

**Response** (when amount < total and customer exists):
```json
{
  "success": true,
  "message": "Partial payment recorded. Due amount: ₹150.00",
  "data": {
    "payment": { ... },
    "paymentStatus": "partial",
    "orderStatus": "completed",
    "paymentSummary": {
      "orderTotal": 650.00,
      "totalPaid": 500.00,
      "dueAmount": 150.00
    }
  }
}
```

### 2. Get Customer Due Balance

**GET** `/api/v1/customers/:outletId/due/:customerId`

**Response**:
```json
{
  "success": true,
  "data": {
    "customerId": 123,
    "customerName": "John Doe",
    "customerPhone": "9876543210",
    "dueBalance": 500.00,
    "totalDueCollected": 1500.00,
    "pendingOrders": [
      {
        "orderId": 456,
        "orderNumber": "ORD240312001",
        "invoiceNumber": "INV/2526/000145",
        "totalAmount": 650.00,
        "dueAmount": 150.00,
        "createdAt": "2024-03-12T10:30:00.000Z"
      }
    ]
  }
}
```

### 3. Get Customer Due Transactions

**GET** `/api/v1/customers/:outletId/due/:customerId/transactions`

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 50)
- `type` (optional): `due_created`, `due_collected`, `due_waived`

**Response**:
```json
{
  "success": true,
  "transactions": [
    {
      "id": 1,
      "transactionType": "due_created",
      "amount": 150.00,
      "balanceAfter": 500.00,
      "orderNumber": "ORD240312001",
      "invoiceNumber": "INV/2526/000145",
      "createdBy": "Cashier Name",
      "createdAt": "2024-03-12T10:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 10, "totalPages": 1 }
}
```

### 4. Collect Due Payment

**POST** `/api/v1/customers/:outletId/due/:customerId/collect`

**Body**:
```json
{
  "amount": 150.00,
  "paymentMode": "cash",
  "transactionId": "TXN123",
  "referenceNumber": "REF456",
  "orderId": 456,
  "invoiceId": 789,
  "notes": "Collected remaining due"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Due payment collected successfully",
  "data": {
    "paymentId": 100,
    "paymentNumber": "PAY240312005",
    "customerId": 123,
    "customerName": "John Doe",
    "amountCollected": 150.00,
    "previousBalance": 500.00,
    "newBalance": 350.00,
    "paymentMode": "cash"
  }
}
```

### 5. Waive Due (Manager Only)

**POST** `/api/v1/customers/:outletId/due/:customerId/waive`

**Body**:
```json
{
  "amount": 50.00,
  "reason": "Customer complaint resolution"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Due waived successfully",
  "data": {
    "amountWaived": 50.00,
    "newBalance": 300.00
  }
}
```

### 6. List Customers with Due Balance

**GET** `/api/v1/customers/:outletId/due-list`

**Query Parameters**:
- `page` (default: 1)
- `limit` (default: 50)
- `minDue` (default: 0) - Filter customers with due >= this amount
- `sortBy`: `dueBalance`, `name`, `lastOrderAt`, `totalSpent`
- `sortOrder`: `ASC`, `DESC`

**Response**:
```json
{
  "success": true,
  "customers": [
    {
      "id": 123,
      "name": "John Doe",
      "phone": "9876543210",
      "dueBalance": 500.00,
      "totalDueCollected": 1500.00,
      "pendingDueOrders": 2,
      "lastOrderAt": "2024-03-12T10:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 25, "totalPages": 1 },
  "summary": {
    "totalCustomersWithDue": 25,
    "totalDueAmount": 12500.00,
    "avgDueAmount": 500.00
  }
}
```

## Customer API Updates

### Customer List (existing endpoint)

**GET** `/api/v1/customers/:outletId/list`

Now includes `dueBalance` and `totalDueCollected` in each customer object.

### Customer Details (existing endpoint)

**GET** `/api/v1/customers/:outletId/details/:customerId`

Now includes `dueBalance` and `totalDueCollected` in the customer object.
Order history now includes `dueAmount` for each order.

## Invoice/Bill Updates

### Invoice Object

Now includes:
- `paidAmount`: Amount paid so far
- `dueAmount`: Remaining due amount
- `isDuePayment`: Boolean indicating if this is a due payment

### Printed Bill

When a bill has due amount, the printed receipt shows:
```
Grand Total Rs.650.00
---------------------------
Paid Amount:       Rs.500.00
DUE AMOUNT:        Rs.150.00
---------------------------
```

## Database Schema

### New Table: customer_due_transactions

```sql
CREATE TABLE customer_due_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    outlet_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED,
    invoice_id BIGINT UNSIGNED,
    payment_id BIGINT UNSIGNED,
    transaction_type ENUM('due_created', 'due_collected', 'due_adjusted', 'due_waived'),
    amount DECIMAL(12, 2) NOT NULL,
    balance_after DECIMAL(14, 2) NOT NULL,
    payment_mode ENUM('cash', 'card', 'upi', 'wallet', 'credit', 'adjustment'),
    transaction_id VARCHAR(100),
    reference_number VARCHAR(100),
    notes TEXT,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Modified Tables

**customers**: Added `due_balance` and `total_due_collected` columns
**invoices**: Added `paid_amount`, `due_amount`, `is_due_payment` columns
**payments**: Added `is_due_collection`, `due_transaction_id` columns

## Payment Modes Supported

- `cash`
- `card`
- `upi`
- `wallet`
- `split` (multiple payment modes)

All modes support partial payment and due creation when customer info exists.
