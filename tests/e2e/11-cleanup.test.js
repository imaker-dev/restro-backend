/**
 * E2E Test Suite 11: Cleanup & Verification
 * Tests: Final verification and optional cleanup
 */

const { TestHelper } = require('./helpers');

const helper = new TestHelper();

describe('PHASE 11: Final Verification & Cleanup', () => {
  let adminToken;
  let outletId;
  
  beforeAll(async () => {
    const res = await helper.post('/auth/login', {
      email: 'e2e.admin@testrestro.com',
      password: 'E2EAdmin@123'
    });
    adminToken = res.body.data.accessToken;
    outletId = global.TEST_OUTLET_ID;
  });
  
  describe('11.1 Data Verification', () => {
    
    test('should verify outlet exists', async () => {
      const res = await helper.get(`/outlets/${outletId}`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe('E2ETEST01');
    });
    
    test('should verify all floors created', async () => {
      const res = await helper.get(`/outlets/${outletId}/floors`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3); // Ground, First, Rooftop
    });
    
    test('should verify all sections created', async () => {
      const res = await helper.get(`/outlets/${outletId}/sections`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(4); // AC, Non-AC, Bar, Outdoor
    });
    
    test('should verify all tables created', async () => {
      const res = await helper.get('/tables', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(7); // T1-T4, B1, F1, R1
    });
    
    test('should verify tax groups created', async () => {
      const res = await helper.get('/tax/groups', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4); // GST 5%, 12%, 18%, IGST 5%
    });
    
    test('should verify kitchen stations created', async () => {
      const res = await helper.get(`/outlets/${outletId}/kitchen-stations`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3); // Main, Bar, Dessert
    });
    
    test('should verify menu categories created', async () => {
      const res = await helper.get('/menu/categories', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(4); // Starters, Main, Beverages, Desserts
    });
    
    test('should verify menu items created', async () => {
      const res = await helper.get('/menu/items', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(9);
    });
    
    test('should verify staff users created', async () => {
      const res = await helper.get('/users', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(8);
    });
    
    test('should verify printers created', async () => {
      const res = await helper.get('/printers', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });
  
  describe('11.2 Order Statistics', () => {
    
    test('should get order statistics', async () => {
      const res = await helper.get('/orders', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      
      const orders = res.body.data;
      console.log(`\n📊 ORDER STATISTICS:`);
      console.log(`   Total Orders: ${orders.length}`);
      
      const byStatus = {};
      orders.forEach(o => {
        byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      });
      console.log(`   By Status:`, byStatus);
      
      const byType = {};
      orders.forEach(o => {
        byType[o.orderType] = (byType[o.orderType] || 0) + 1;
      });
      console.log(`   By Type:`, byType);
    });
  });
  
  describe('11.3 Bill Statistics', () => {
    
    test('should get bill statistics', async () => {
      const res = await helper.get('/bills', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      
      const bills = res.body.data;
      console.log(`\n💰 BILL STATISTICS:`);
      console.log(`   Total Bills: ${bills.length}`);
      
      const totalRevenue = bills.reduce((sum, b) => sum + parseFloat(b.grandTotal || 0), 0);
      console.log(`   Total Revenue: ₹${totalRevenue.toFixed(2)}`);
      
      const totalTax = bills.reduce((sum, b) => sum + parseFloat(b.totalTax || 0), 0);
      console.log(`   Total Tax Collected: ₹${totalTax.toFixed(2)}`);
      
      const byPaymentMethod = {};
      bills.forEach(b => {
        if (b.paymentMethod) {
          byPaymentMethod[b.paymentMethod] = (byPaymentMethod[b.paymentMethod] || 0) + 1;
        }
      });
      console.log(`   By Payment Method:`, byPaymentMethod);
    });
  });
  
  describe('11.4 KOT Statistics', () => {
    
    test('should get KOT statistics', async () => {
      const res = await helper.get('/kots', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      
      const kots = res.body.data;
      console.log(`\n🎫 KOT STATISTICS:`);
      console.log(`   Total KOTs: ${kots.length}`);
      
      const byStatus = {};
      kots.forEach(k => {
        byStatus[k.status] = (byStatus[k.status] || 0) + 1;
      });
      console.log(`   By Status:`, byStatus);
      
      const byStation = {};
      kots.forEach(k => {
        byStation[k.station] = (byStation[k.station] || 0) + 1;
      });
      console.log(`   By Station:`, byStation);
    });
  });
  
  describe('11.5 Test Summary', () => {
    
    test('should print test summary', () => {
      console.log('\n' + '='.repeat(60));
      console.log('📋 E2E TEST SUMMARY');
      console.log('='.repeat(60));
      console.log(`\n✅ Test Outlet ID: ${global.TEST_OUTLET_ID}`);
      console.log(`✅ Test Outlet Code: E2ETEST01`);
      console.log('\n📍 Created Entities:');
      console.log(`   - Floors: 3 (Ground, First, Rooftop)`);
      console.log(`   - Sections: 4 (AC, Non-AC, Bar, Outdoor)`);
      console.log(`   - Tables: 7 (T1-T4, B1, F1, R1)`);
      console.log(`   - Kitchen Stations: 3 (Main, Bar, Dessert)`);
      console.log(`   - Tax Groups: 4 (GST 5%, 12%, 18%, IGST 5%)`);
      console.log(`   - Categories: 4 (Starters, Main, Beverages, Desserts)`);
      console.log(`   - Menu Items: 9+`);
      console.log(`   - Staff: 8+ (Manager, Captain, Cashier, Kitchen, Bartender)`);
      console.log(`   - Printers: 3 (Kitchen KOT, Bar KOT, Bill)`);
      console.log('\n👥 Test Credentials:');
      console.log(`   - Admin: e2e.admin@testrestro.com / E2EAdmin@123`);
      console.log(`   - Manager: e2e.manager@testrestro.com / Manager@123`);
      console.log(`   - Captain: E2ECAP01 / PIN: 2222`);
      console.log(`   - Cashier: E2ECSH01 / PIN: 3333`);
      console.log(`   - Kitchen: E2EKIT01 / PIN: 4444`);
      console.log(`   - Bartender: E2EBAR01 / PIN: 5555`);
      console.log('\n' + '='.repeat(60));
      
      expect(true).toBe(true);
    });
  });
  
  describe('11.6 Cleanup (Optional)', () => {
    
    // Cleanup is commented out by default to preserve test data
    // Uncomment if you want to clean up after tests
    
    /*
    test('should deactivate test outlet', async () => {
      const res = await helper.patch(`/outlets/${outletId}`, {
        isActive: false
      }, adminToken);
      
      expect(res.status).toBe(200);
    });
    
    test('should deactivate test admin', async () => {
      const res = await helper.patch(`/users/${global.USER_ADMIN}`, {
        isActive: false
      }, adminToken);
      
      expect(res.status).toBe(200);
    });
    */
    
    test('cleanup skipped - test data preserved for manual inspection', () => {
      console.log('\n⚠️  Test data preserved. To cleanup manually:');
      console.log(`    DELETE FROM outlets WHERE code = 'E2ETEST01';`);
      console.log(`    DELETE FROM users WHERE email LIKE 'e2e.%@testrestro.com';`);
      
      expect(true).toBe(true);
    });
  });
});

module.exports = { helper };
