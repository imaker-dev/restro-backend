# Database Design Document

## Entity Relationship Overview

### Auth Domain
```
users ─────────────┬───── user_roles ───── roles
                   │           │
                   │           └───── outlets (optional)
                   │
                   └───── user_sessions
                   
roles ───── role_permissions ───── permissions
```

### Layout Domain
```
outlets
    │
    ├───── floors
    │         │
    │         └───── floor_sections ───── sections
    │                      │
    │                      └───── tax_override_group
    │
    ├───── tables
    │         │
    │         ├───── table_layouts
    │         ├───── table_sessions ───── orders
    │         ├───── table_merges
    │         └───── table_reservations
    │
    ├───── time_slots (breakfast, lunch, dinner, happy_hour, bar_time)
    │
    ├───── counters (main_bar, mocktail, whisky, wine, beer, coffee)
    │
    └───── kitchen_stations (main_kitchen, tandoor, chinese, grill)
```

### Table Status Flow
```
available → occupied → running → billing → cleaning → available
                ↓           ↓
            reserved     blocked
```

### Menu Domain (Dynamic Menu Engine)
```
outlets ───── categories
                  │
                  ├───── category_rules (floor/section/time)
                  ├───── category_outlets (multi-outlet visibility)
                  ├───── category_floors (floor-based visibility)
                  ├───── category_sections (section-based visibility)
                  ├───── category_time_slots (time-based visibility)
                  │
                  └───── items
                           │
                           ├───── item_rules
                           ├───── item_floors (floor-based visibility + price override)
                           ├───── item_sections (section-based visibility + price override)
                           ├───── item_time_slots (time-based visibility + price override)
                           ├───── item_kitchen_stations (KOT routing)
                           ├───── item_counters (bar item routing)
                           ├───── variants ───── tax_groups
                           ├───── item_addon_groups ───── addon_groups ───── addons
                           ├───── quantity_rules (min/max/step qty, bulk pricing)
                           ├───── recipes ───── ingredients
                           └───── combo_items
```

### Tax & Pricing Domain
```
tax_types ───── tax_components
                     │
                     └───── tax_group_components ───── tax_groups
                                                          │
                                                          └───── tax_rules (floor/section override)

price_rules ───── items/variants/categories (floor/section/time based)

discounts ───── categories/items (conditions)
```

### Orders & KOT Domain
```
orders ─────────────────────────────────────────────────────────┐
    │                                                           │
    ├───── order_items ───── order_item_addons                 │
    │           │                                               │
    │           └───── kot_items                               │
    │                     │                                     │
    │                     └───── kot_tickets                   │
    │                                                           │
    ├───── order_discounts                                     │
    ├───── order_cancel_logs ───── cancel_reasons              │
    ├───── order_transfer_logs                                 │
    │                                                           │
    └───── invoices ───── payments ───── split_payments        │
                              │                                 │
                              └───── refunds                   ─┘
```

### Inventory Domain
```
ingredients ───── recipes ───── items/variants
      │
      ├───── stock (current levels)
      ├───── stock_logs (movements)
      ├───── opening_stock (daily)
      ├───── closing_stock (daily)
      ├───── wastage_logs
      │
      └───── purchase_order_items ───── purchase_orders ───── suppliers
```

### Reports Domain (Aggregated - Never Calculate from Orders)
```
orders ──[AGGREGATION JOBS]──┬── daily_sales
                             ├── item_sales
                             ├── category_sales
                             ├── hourly_sales
                             ├── staff_sales
                             ├── floor_section_sales
                             └── top_selling_items

payments ──[AGGREGATION]──┬── cash_summary
                          └── payment_mode_summary

invoices ──[AGGREGATION]──── tax_summary

discounts ──[AGGREGATION]──── discount_summary

cancellations ──[AGGREGATION]──── cancellation_summary

stock_logs ──[AGGREGATION]──── inventory_consumption_summary
```

## Key Design Decisions

### 1. Flexible Role System
- Roles are not hardcoded - new roles can be added
- Permissions are granular (module.action format)
- User-role assignments can be outlet-specific
- Role priority determines hierarchy

### 2. Dynamic Menu Engine
- Categories and items have visibility rules
- Rules can be based on: floor, section, time slot, day of week, date range
- Multiple rules can apply with priority resolution
- **Visibility Tables**: Dedicated mapping tables for granular control:
  - `category_outlets`, `category_floors`, `category_sections`, `category_time_slots`
  - `item_floors`, `item_sections`, `item_time_slots`
- **Price Overrides**: Item visibility tables support `price_override` for location/time-based pricing
- **KOT Routing**: Items map to `kitchen_stations` for proper KOT distribution
- **Counter Routing**: Bar items map to `counters` (mocktail, whisky, wine, beer, etc.)

### 3. Dynamic Pricing
- Price rules support: floor, section, time, happy hour
- Adjustment types: fixed, percentage, override
- Priority-based rule resolution

### 4. Tax Engine
- Supports GST (CGST+SGST/IGST) and VAT simultaneously
- Tax rules can override based on floor/section
- Tax details stored in order_items for audit

### 5. Order Items Store Final Values
- `order_items` stores resolved price, tax, discounts
- No need to recalculate from rules later
- `tax_details` and `price_rule_applied` JSON fields for audit

### 6. Report Aggregation Strategy
- **NEVER** calculate reports from orders table directly
- Background jobs aggregate every 5 minutes
- Pre-aggregated tables for fast dashboard queries
- Reduces load on transactional tables

### 7. Soft Deletes
- Critical tables use `deleted_at` for soft deletes
- Maintains referential integrity
- Supports data recovery

### 8. Audit Trail
- `activity_logs` tracks all changes
- `auth_audit_logs` for authentication events
- `order_cancel_logs` for cancellations
- `duplicate_bill_logs` for reprints

## Indexing Strategy

### Primary Indexes
- All primary keys are `BIGINT UNSIGNED AUTO_INCREMENT`
- UUIDs for public-facing identifiers

### Foreign Key Indexes
- All foreign keys are indexed
- Cascade deletes where appropriate

### Query Optimization Indexes
- `outlet_id` on all outlet-specific tables
- `status` fields for filtered queries
- `created_at` for time-based queries
- `is_active` for soft-filter queries
- Composite indexes for common query patterns

## Partitioning Strategy (For Scale)

For high-volume tables, consider monthly partitioning:

```sql
-- Example for orders table
ALTER TABLE orders
PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
    PARTITION p202601 VALUES LESS THAN (202602),
    PARTITION p202602 VALUES LESS THAN (202603),
    -- Add more partitions as needed
    PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

## Data Archival Strategy

1. Orders older than 1 year → Archive database
2. Logs older than 90 days → Compressed storage
3. Sessions older than 30 days → Delete
4. Aggregated reports → Keep indefinitely

## Character Set & Collation

All tables use:
- `CHARACTER SET utf8mb4` - Full Unicode support
- `COLLATE utf8mb4_unicode_ci` - Case-insensitive Unicode collation
