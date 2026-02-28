# Floor-Based Shift System

## Overview

The shift system is now **floor-isolated** - each floor has its own independent shift managed by an assigned cashier. This ensures that:

1. Each floor's operations are independent
2. Bills are routed to the correct floor's cashier
3. Reports are filtered by floor/cashier/shift
4. Table sessions can only start when the floor's shift is open

## Database Changes

### Migration: `028_floor_based_shifts.sql`

New columns added:

| Table | Column | Description |
|-------|--------|-------------|
| `day_sessions` | `floor_id` | Links shift to specific floor |
| `day_sessions` | `cashier_id` | Cashier who owns this shift |
| `cash_drawer` | `floor_id` | Floor for cash transaction |
| `payments` | `floor_id` | Floor where payment was made |

**Run migration:**
```bash
mysql -u root -p restro_db < src/database/migrations/028_floor_based_shifts.sql
```

## How It Works

### 1. Shift Opening

When a cashier opens a shift:
- System gets cashier's assigned floor from `user_floors`
- Creates `day_sessions` record with `floor_id` and `cashier_id`
- Only affects that specific floor

```
POST /api/v1/orders/cash-drawer/:outletId/open
Body: { openingCash: 5000, floorId: 1 }  // floorId optional - defaults to assigned floor
```

### 2. Floor Isolation

| Cashier | Floor | Action | Result |
|---------|-------|--------|--------|
| Cashier A | 1st Floor | Opens shift | Only 1st floor shift opens |
| Cashier B | 2nd Floor | Opens shift | Only 2nd floor shift opens |
| Cashier A | 2nd Floor | Opens shift | ❌ Error: Not assigned to this floor |

### 3. Table Session Validation

Before starting a table session:
1. System checks table's floor
2. Verifies floor shift is open
3. If not open → **blocks action**

**Error Message:**
```json
{
  "success": false,
  "message": "Shift not opened for Ground Floor. Please ask the assigned cashier to open the shift first.",
  "code": "SHIFT_NOT_OPEN",
  "floorId": 1,
  "floorName": "Ground Floor"
}
```

### 4. Bill Routing

When a bill is generated:
- System finds floor from order's table
- Gets floor's active shift cashier
- Routes bill notification to that cashier

**Socket Event: `bill:status`**
```json
{
  "outletId": 1,
  "orderId": 123,
  "floorId": 1,
  "floorCashierId": 5,  // Routes to this cashier
  "billStatus": "pending",
  "grandTotal": 1500
}
```

### 5. Reports Filtering

Cashiers can only see their own shift history:

```
GET /api/v1/orders/shifts/:outletId/history
Query: ?floorId=1&cashierId=5&startDate=2024-02-01
```

**For Cashier Role:** Automatically filtered to their own shifts only.

## API Endpoints

### Shift Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/cash-drawer/:outletId/open` | POST | Open shift for floor |
| `/cash-drawer/:outletId/close` | POST | Close shift for floor |
| `/cash-drawer/:outletId/status` | GET | Get shift status (query: `?floorId=`) |
| `/shifts/:outletId/floors` | GET | Get all floor shifts status |
| `/shifts/:outletId/floor/:floorId/status` | GET | Check specific floor shift |
| `/shifts/:outletId/history` | GET | Get shift history with filters |

### Request/Response Examples

**Open Shift:**
```http
POST /api/v1/orders/cash-drawer/1/open
Content-Type: application/json

{
  "openingCash": 5000,
  "floorId": 1  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Shift opened for floor",
  "data": {
    "success": true,
    "openingCash": 5000,
    "floorId": 1,
    "floorName": "Ground Floor",
    "sessionId": 45
  }
}
```

**Get All Floor Shifts:**
```http
GET /api/v1/orders/shifts/1/floors
```

**Response:**
```json
{
  "success": true,
  "data": {
    "floors": [
      {
        "floorId": 1,
        "floorName": "Ground Floor",
        "floorNumber": 0,
        "shift": {
          "id": 45,
          "status": "open",
          "openingTime": "2024-02-27T10:00:00",
          "openingCash": 5000,
          "cashierId": 5,
          "cashierName": "John"
        },
        "assignedCashiers": [{ "id": 5, "name": "John" }],
        "isShiftOpen": true
      },
      {
        "floorId": 2,
        "floorName": "First Floor",
        "shift": null,
        "assignedCashiers": [{ "id": 6, "name": "Jane" }],
        "isShiftOpen": false
      }
    ],
    "date": "2024-02-27"
  }
}
```

## Blocked Operations When Shift Not Open

| Operation | Blocked? | Error Code |
|-----------|----------|------------|
| Start table session | ✅ | `SHIFT_NOT_OPEN` |
| Create order (dine-in) | ✅ | `SHIFT_NOT_OPEN` |
| Generate KOT | ✅ | `SHIFT_NOT_OPEN` |
| Generate bill | ✅ | `SHIFT_NOT_OPEN` |
| Collect payment | ✅ | `SHIFT_NOT_OPEN` |
| Takeaway order | ❌ | (Not floor-dependent) |

## User Assignment

### Assigning Cashier to Floor

```http
PUT /api/v1/users/:userId
Content-Type: application/json

{
  "floors": [
    { "floorId": 1, "outletId": 1, "isPrimary": true }
  ]
}
```

### Checking User's Floor Assignment

```http
GET /api/v1/users/:userId
```

**Response includes:**
```json
{
  "assignedFloors": [
    {
      "floorId": 1,
      "floorName": "Ground Floor",
      "outletId": 1,
      "isPrimary": true
    }
  ]
}
```

## Frontend Integration

### 1. Check Shift Before Operations

```javascript
// Before starting table session
const checkShift = async (outletId, floorId) => {
  const res = await api.get(`/shifts/${outletId}/floor/${floorId}/status`);
  if (!res.data.isOpen) {
    alert(`Shift not open for ${res.data.floorName}`);
    return false;
  }
  return true;
};
```

### 2. Filter Bill Notifications by Cashier

```javascript
// In cashier dashboard
socket.on('bill:status', (data) => {
  // Only show if bill is for this cashier's floor
  if (data.floorCashierId === currentUser.id) {
    showBillNotification(data);
  }
});
```

### 3. Display Floor Shift Status

```javascript
// Admin/Manager view of all floor shifts
const getFloorShifts = async (outletId) => {
  const res = await api.get(`/shifts/${outletId}/floors`);
  return res.data.floors;
};
```

## Troubleshooting

### "Shift not opened for this floor"

**Cause:** Table's floor has no open shift.

**Solution:**
1. Check which floor the table belongs to
2. Find cashier assigned to that floor
3. Have them open shift first

### "You are not assigned to this floor"

**Cause:** Cashier trying to open shift for a floor they're not assigned to.

**Solution:**
1. Admin assigns cashier to correct floor via user management
2. Or use the correct cashier for that floor

### "No open shift found for this floor"

**Cause:** Trying to close shift that isn't open.

**Solution:**
1. Check floor shift status
2. Open shift first if needed

## Summary

| Feature | Before | After |
|---------|--------|-------|
| Shift scope | Global per outlet | Per floor |
| Cashier assignment | Optional | Required per floor |
| Table session | No shift check | Validates floor shift |
| Bill routing | Any cashier | Floor's assigned cashier |
| Reports | All shifts | Filtered by floor/cashier |
| Independence | None | Full floor isolation |
