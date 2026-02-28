# KOT Lifecycle and Payment Completion

## KOT Status Flow

```
pending → accepted → preparing → ready → served
                                    ↓
                               cancelled
```

## When Payment is Completed

When a cashier completes payment for an order, the following happens:

### 1. Database Updates (payment.service.js)

```javascript
// Mark all KOTs as served
UPDATE kot_tickets SET status = 'served', served_at = NOW(), served_by = ?
WHERE order_id = ? AND status NOT IN ('served', 'cancelled')

// Mark all KOT items as served
UPDATE kot_items SET status = 'served'
WHERE kot_id IN (SELECT id FROM kot_tickets WHERE order_id = ?)
  AND status != 'cancelled'

// Mark all order items as served
UPDATE order_items SET status = 'served'
WHERE order_id = ? AND status NOT IN ('served', 'cancelled')
```

### 2. Socket Events Emitted

For each KOT in the order, a `kot:served` event is emitted:

```javascript
Channel: 'kot:update'
Payload: {
  type: 'kot:served',
  outletId: 42,
  station: 'main_kitchen',
  stationId: 33,                    // For multi-station routing
  kot: {
    id: 123,
    kotNumber: 'KOT001',
    station: 'main_kitchen',
    stationId: 33,
    status: 'served',
    // ... full KOT data
  },
  timestamp: '2024-02-26T15:30:00.000Z'
}
```

### 3. Frontend Handling

The KDS (Kitchen Display System) frontend should:

1. **Listen** for `kot:update` events on the socket
2. **Filter** by `stationId` (or `station` for backward compatibility)
3. **When** `type === 'kot:served'`:
   - Remove the KOT from the active list
   - Update stats/counts

```javascript
// Example frontend handler
socket.on('kot:update', (data) => {
  if (data.type === 'kot:served') {
    // Remove KOT from station's active list
    const myStationId = getCurrentStationId();
    if (data.stationId === myStationId || data.station === myStation) {
      removeKotFromDisplay(data.kot.id);
    }
  }
});
```

## Multi-Station Orders

When an order has items from multiple stations (e.g., kitchen + bar):

1. **Separate KOTs** are created for each station
2. **Each KOT** has its own `station` and `station_id`
3. **On payment**, ALL KOTs for the order are marked served
4. **Socket events** are sent to EACH station

```
Order #123:
├── KOT-001 (station: main_kitchen, station_id: 33) → socket to kitchen
├── KOT-002 (station: bar, station_id: 30)          → socket to bar
└── KOT-003 (station: dessert, station_id: 31)      → socket to dessert
```

## Station Dashboard

The `getStationDashboard` and `getActiveKots` functions automatically filter out served KOTs:

```sql
WHERE kt.status NOT IN ('served', 'cancelled')
```

So when the frontend refreshes or polls for KOTs, served ones won't appear.

## API Endpoints

### Mark KOT as Served (Manual)

```
PUT /api/v1/kots/:id/served
Authorization: Bearer <token>
```

### Get Station Dashboard

```
GET /api/v1/outlets/:outletId/stations/:station/dashboard
Authorization: Bearer <token>
```

Returns only active (non-served, non-cancelled) KOTs.

## Troubleshooting

### KOTs not being removed from station

1. **Check socket connection** - Is the frontend connected to the socket?
2. **Check socket room** - Is the frontend subscribed to the correct outlet room?
3. **Check stationId** - Does the frontend filter match the KOT's stationId?
4. **Check logs** - Look for `[Payment] Emitting kot:served` in server logs

### KOTs still showing after payment

1. **Refresh the dashboard** - Manual refresh should clear them (server filters out served)
2. **Check payment status** - Ensure payment was actually completed
3. **Check database** - Verify KOT status is 'served' in `kot_tickets` table

```sql
SELECT id, kot_number, station, station_id, status, served_at
FROM kot_tickets
WHERE order_id = <order_id>;
```
