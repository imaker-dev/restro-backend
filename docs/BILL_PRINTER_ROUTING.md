# Bill Printer Routing by Cashier Station

## Overview

Bills and invoices are printed to the **cashier's assigned bill station printer** based on the **floor** where the order was placed.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    BILL GENERATION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Captain/Cashier generates bill for an order                │
│                          ↓                                      │
│  2. System gets order's floor_id                               │
│                          ↓                                      │
│  3. Find cashier with permission for this floor                │
│     (via user_floors table)                                    │
│                          ↓                                      │
│  4. Get cashier's bill station                                 │
│     (via user_stations where station_type = 'bill')            │
│                          ↓                                      │
│  5. Get station's printer                                      │
│     (via kitchen_stations.printer_id)                          │
│                          ↓                                      │
│  6. Print bill to that printer                                 │
│                                                                 │
│  FALLBACK: If no floor-specific printer found:                 │
│     → Use outlet-level bill printer (printers.station = 'bill')│
│     → Or any active network printer                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Required Tables

```sql
-- 1. kitchen_stations: Bill stations with printer assignment
CREATE TABLE kitchen_stations (
    id BIGINT PRIMARY KEY,
    outlet_id BIGINT,
    name VARCHAR(100),
    code VARCHAR(20),
    station_type VARCHAR(50),    -- Must be 'bill' for bill stations
    printer_id BIGINT,           -- Links to printers table
    is_active TINYINT DEFAULT 1
);

-- 2. user_stations: Cashier assigned to bill station
CREATE TABLE user_stations (
    id BIGINT PRIMARY KEY,
    user_id BIGINT,              -- Cashier user ID
    station_id BIGINT,           -- Bill station ID
    outlet_id BIGINT,
    is_primary TINYINT DEFAULT 0,
    is_active TINYINT DEFAULT 1
);

-- 3. user_floors: Cashier's floor permissions
CREATE TABLE user_floors (
    id BIGINT PRIMARY KEY,
    user_id BIGINT,              -- Cashier user ID
    floor_id BIGINT,             -- Floor ID
    outlet_id BIGINT,
    is_primary TINYINT DEFAULT 0,
    is_active TINYINT DEFAULT 1
);

-- 4. printers: Physical printers
CREATE TABLE printers (
    id BIGINT PRIMARY KEY,
    outlet_id BIGINT,
    name VARCHAR(100),
    ip_address VARCHAR(45),
    port INT DEFAULT 9100,
    station VARCHAR(50),         -- 'bill', 'kot_kitchen', 'kot_bar', etc.
    is_active TINYINT DEFAULT 1
);
```

## Setup Steps

### Step 1: Create a Printer

```sql
INSERT INTO printers (outlet_id, name, ip_address, port, station, is_active)
VALUES (42, 'First Floor Bill Printer', '192.168.1.100', 9100, 'bill', 1);
-- Returns: printer_id = 10 (example)
```

### Step 2: Create a Bill Station

```sql
INSERT INTO kitchen_stations (outlet_id, name, code, station_type, printer_id, is_active)
VALUES (42, 'First Floor Cashier Station', 'CASH_F1', 'bill', 10, 1);
-- Returns: station_id = 54 (example)
```

**Important:** `station_type` MUST be `'bill'` for bill routing to work.

### Step 3: Assign Station to Cashier

```sql
INSERT INTO user_stations (user_id, station_id, outlet_id, is_primary, is_active)
VALUES (123, 54, 42, 1, 1);
-- user_id 123 = cashier
-- station_id 54 = First Floor Cashier Station
```

### Step 4: Assign Floor Permission to Cashier

```sql
INSERT INTO user_floors (user_id, floor_id, outlet_id, is_primary, is_active)
VALUES (123, 29, 42, 1, 1);
-- user_id 123 = cashier
-- floor_id 29 = First Floor
```

## Routing Logic

The `getBillPrinter` function in `billing.service.js` follows this priority:

### Priority 1: Floor-Specific Cashier Station Printer

```sql
SELECT DISTINCT p.*
FROM user_floors uf
JOIN user_roles ur ON uf.user_id = ur.user_id 
  AND ur.outlet_id = uf.outlet_id AND ur.is_active = 1
JOIN roles r ON ur.role_id = r.id AND r.slug = 'cashier'
JOIN user_stations us ON uf.user_id = us.user_id 
  AND us.outlet_id = uf.outlet_id AND us.is_active = 1
JOIN kitchen_stations ks ON us.station_id = ks.id 
  AND ks.is_active = 1 AND ks.station_type = 'bill'
JOIN printers p ON ks.printer_id = p.id AND p.is_active = 1
WHERE uf.floor_id = ? AND uf.outlet_id = ? AND uf.is_active = 1
ORDER BY us.is_primary DESC, uf.is_primary DESC
LIMIT 1
```

### Priority 2: Outlet-Level Bill Printer

```sql
SELECT * FROM printers 
WHERE outlet_id = ? AND station = 'bill' AND is_active = 1
ORDER BY is_default DESC LIMIT 1
```

### Priority 3: Any Active Network Printer

```sql
SELECT * FROM printers 
WHERE outlet_id = ? AND is_active = 1 AND ip_address IS NOT NULL
ORDER BY is_default DESC LIMIT 1
```

## Example Scenario

### Setup

| Entity | Values |
|--------|--------|
| Outlet | Monday (id: 42) |
| Floor | First Floor (id: 29) |
| Cashier | Monday Cashier 1 (id: 123) |
| Bill Station | First Floor Cashier Station (id: 54, station_type: 'bill') |
| Printer | First Floor Bill Printer (id: 10, ip: 192.168.1.100) |

### What Happens

1. **Captain creates order** on Table 5 (First Floor, floor_id: 29)
2. **Captain generates bill** for the order
3. **System checks**: Order floor_id = 29
4. **System finds**: Cashier 123 has permission for floor 29
5. **System finds**: Cashier 123 is assigned to station 54 (station_type: 'bill')
6. **System finds**: Station 54 has printer 10 (192.168.1.100)
7. **Bill prints** to 192.168.1.100:9100

## Multiple Floors / Multiple Cashiers

You can set up different cashiers for different floors:

```
Floor 1 (Ground Floor)
  └── Cashier A → Bill Station A → Printer A (192.168.1.100)

Floor 2 (First Floor)
  └── Cashier B → Bill Station B → Printer B (192.168.1.101)

Floor 3 (Rooftop)
  └── Cashier C → Bill Station C → Printer C (192.168.1.102)
```

Orders from each floor will print to their respective cashier's printer.

## API Endpoints

### Create Kitchen Station (Bill Station)

```
POST /api/v1/outlets/:outletId/kitchen-stations
{
  "name": "First Floor Cashier Station",
  "code": "CASH_F1",
  "stationType": "bill",
  "printerId": 10
}
```

### Assign Station to User

```
POST /api/v1/users/:userId/stations
{
  "stationId": 54,
  "outletId": 42,
  "isPrimary": true
}
```

### Assign Floor to User

```
POST /api/v1/users/:userId/floors
{
  "floorId": 29,
  "outletId": 42,
  "isPrimary": true
}
```

## Verification

To verify your setup is correct:

```sql
-- Check if a floor has a bill printer configured
SELECT 
  f.name as floor_name,
  u.name as cashier_name,
  ks.name as station_name,
  ks.station_type,
  p.name as printer_name,
  p.ip_address
FROM floors f
JOIN user_floors uf ON f.id = uf.floor_id AND uf.is_active = 1
JOIN users u ON uf.user_id = u.id
JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
JOIN roles r ON ur.role_id = r.id AND r.slug = 'cashier'
JOIN user_stations us ON u.id = us.user_id AND us.outlet_id = uf.outlet_id AND us.is_active = 1
JOIN kitchen_stations ks ON us.station_id = ks.id AND ks.station_type = 'bill'
JOIN printers p ON ks.printer_id = p.id AND p.is_active = 1
WHERE f.outlet_id = 42;
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bill not printing to cashier's printer | Check `station_type = 'bill'` in kitchen_stations |
| Fallback to outlet printer | Verify cashier has floor permission (user_floors) |
| No printer found | Check printer is active and has IP address |
| Wrong floor's printer | Check user_floors.floor_id matches order's floor |
