# RestroPOS E2E Test Suite

Comprehensive end-to-end testing for the RestroPOS application.

## Working Test Files

| Test File | Tests | Description |
|-----------|-------|-------------|
| `01-setup.test.js` | 15 | Admin login, create admin, outlet, tax groups |
| `simple-e2e.test.js` | 21 | Complete flow: auth, outlet, layout, menu, orders, billing, reports |

**Total: 36 passing tests**

## Additional Test Files (Need Fixing)

| Phase | Test File | Description |
|-------|-----------|-------------|
| 2 | `02-layout.test.js` | Floors, sections, tables, kitchen stations |
| 3 | `03-staff.test.js` | Staff creation with all access and floor-specific access |
| 4 | `04-menu.test.js` | Categories, menu items with variants |
| 5 | `05-orders.test.js` | Order creation, KOT flow, accept, ready, serve |
| 6 | `06-billing.test.js` | Bill generation, GST/IGST calculation, payments |
| 7 | `07-printers.test.js` | Printer setup, print jobs, invoice generation |
| 8 | `08-reports.test.js` | Admin, manager, cashier level reports |
| 9 | `09-realtime.test.js` | Socket.io events verification |
| 10 | `10-access-control.test.js` | Permission and role-based access testing |
| 11 | `11-cleanup.test.js` | Final verification and statistics |

## Prerequisites

1. **MySQL** running with database created
2. **Redis** running (for socket events)
3. **Migrations** applied: `npm run migrate`
4. **Seed data** loaded: `npm run seed`
5. **Server** running: `npm run dev`

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with verbose output
npm run test:e2e:verbose

# Run specific test file
npx jest tests/e2e/01-setup.test.js --runInBand
```

## Test Data Created

### Outlet
- **Code:** E2ETEST01
- **Name:** E2E Test Restaurant

### Staff Credentials

| Role | Login | Password/PIN |
|------|-------|--------------|
| Admin | e2e.admin@testrestro.com | E2EAdmin@123 |
| Manager | e2e.manager@testrestro.com | Manager@123 |
| Manager (Floor) | e2e.manager.floor@testrestro.com | Manager@123 |
| Captain | E2ECAP01 | PIN: 2222 |
| Captain (Floor) | E2ECAP02 | PIN: 2223 |
| Cashier | E2ECSH01 | PIN: 3333 |
| Cashier (Floor) | E2ECSH02 | PIN: 3334 |
| Kitchen | E2EKIT01 | PIN: 4444 |
| Bartender | E2EBAR01 | PIN: 5555 |

### Layout Created
- **Floors:** Ground Floor, First Floor, Rooftop
- **Sections:** AC, Non-AC, Bar, Outdoor
- **Tables:** T1, T2, T3, T4, B1, F1, R1
- **Kitchen Stations:** Main Kitchen, Bar, Dessert

### Tax Groups
- GST 5% (CGST 2.5% + SGST 2.5%)
- GST 12% (CGST 6% + SGST 6%)
- GST 18% (CGST 9% + SGST 9%)
- IGST 5%

### Menu Items
- **Starters:** Paneer Tikka, Chicken Wings
- **Main Course:** Butter Chicken, Dal Makhani, Chicken Biryani
- **Beverages:** Fresh Lime Soda, Virgin Mojito, Cold Coffee
- **Desserts:** Gulab Jamun

## Verification Scenarios

### Tax Calculations
- GST 5%: Items from kitchen (food)
- GST 18%: Items from bar (beverages)
- IGST 5%: Interstate supply (takeaway)

### Payment Methods
- Cash payment with change calculation
- Card payment with transaction ID
- UPI payment
- Split payment (cash + card)

### Access Control Tests
- Admin can create users, modify outlet, access all reports
- Manager can create staff (not admin), access reports
- Captain can create orders, send KOT, cannot bill
- Cashier can generate bills, collect payments
- Kitchen can view/accept/ready KOTs only
- Floor-specific access restrictions

### Real-time Events
- `order:created` - New order placed
- `order:updated` - Order status changed
- `kot:created` - KOT sent to kitchen
- `kot:accepted` - Kitchen accepted KOT
- `kot:item_ready` - Item marked ready
- `table:updated` - Table status changed
- `bill:created` - Bill generated

## Cleanup

Test data is preserved after tests. To manually cleanup:

```sql
DELETE FROM outlets WHERE code = 'E2ETEST01';
DELETE FROM users WHERE email LIKE 'e2e.%@testrestro.com';
DELETE FROM users WHERE employee_code LIKE 'E2E%';
```

## Troubleshooting

### Server not running
```
Error: Server not running
```
Start the server first: `npm run dev`

### Socket tests failing
Ensure Redis is running and socket server is enabled.

### Database connection errors
Check `.env` file has correct database credentials.

## Adding New Tests

1. Create new test file: `tests/e2e/XX-name.test.js`
2. Add to sequencer order in `sequencer.js`
3. Import helper: `const { TestHelper } = require('./helpers');`
4. Use shared tokens from `global.TOKEN_*`
