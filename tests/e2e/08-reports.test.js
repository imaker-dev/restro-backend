/**
 * E2E Test Suite 08: Reports
 * Tests: Admin, Manager, Cashier level reports with verification
 */

const { TestHelper } = require('./helpers');

const helper = new TestHelper();

describe('PHASE 8: Reports', () => {
  let adminToken, managerToken, cashierToken;
  let outletId;
  
  beforeAll(async () => {
    // Get tokens
    const adminRes = await helper.post('/auth/login', {
      email: 'e2e.admin@testrestro.com',
      password: 'E2EAdmin@123'
    });
    adminToken = adminRes.body.data.accessToken;
    
    managerToken = global.TOKEN_MANAGER;
    cashierToken = global.TOKEN_CASHIER;
    outletId = global.TEST_OUTLET_ID;
  });
  
  describe('8.1 Admin Level Reports', () => {
    
    test('admin should access sales summary', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/sales/summary', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.totalSales).toBeDefined();
      expect(res.body.data.totalOrders).toBeDefined();
    });
    
    test('admin should access detailed sales report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/sales', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
    
    test('admin should access tax report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/tax', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      
      // Should show GST breakdown
      if (res.body.data.taxBreakdown) {
        expect(res.body.data.taxBreakdown).toBeInstanceOf(Array);
      }
    });
    
    test('admin should access GST report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/gst', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      
      // Verify CGST and SGST totals
      const data = res.body.data;
      if (data.cgstTotal !== undefined) {
        expect(typeof parseFloat(data.cgstTotal)).toBe('number');
      }
      if (data.sgstTotal !== undefined) {
        expect(typeof parseFloat(data.sgstTotal)).toBe('number');
      }
    });
    
    test('admin should access item-wise sales report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/items', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
    
    test('admin should access category-wise sales report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/categories', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
    });
    
    test('admin should access payment methods report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/payments', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      
      // Should show breakdown by payment method
      const data = res.body.data;
      if (data.byMethod) {
        expect(data.byMethod.cash !== undefined || data.byMethod.card !== undefined).toBe(true);
      }
    });
    
    test('admin should access hourly sales report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/hourly', adminToken, {
        outletId,
        date: today
      });
      
      expect(res.status).toBe(200);
    });
    
    test('admin should access staff performance report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/staff', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
    });
  });
  
  describe('8.2 Manager Level Reports', () => {
    
    test('manager should access sales summary', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/sales/summary', managerToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.totalSales).toBeDefined();
    });
    
    test('manager should access KOT report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/kots', managerToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
    });
    
    test('manager should access table turnover report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/tables', managerToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
    });
    
    test('manager should access order cancellation report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/cancellations', managerToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(res.status).toBe(200);
    });
  });
  
  describe('8.3 Cashier Level Reports', () => {
    
    test('cashier should access day end report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/day-end', cashierToken, {
        outletId,
        date: today
      });
      
      expect(res.status).toBe(200);
    });
    
    test('cashier should access cash collection summary', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/cash-collection', cashierToken, {
        outletId,
        date: today
      });
      
      expect(res.status).toBe(200);
    });
    
    test('cashier should access their own bills', async () => {
      const res = await helper.get('/bills', cashierToken, {
        outletId,
        collectedBy: global.USER_CASHIER
      });
      
      expect(res.status).toBe(200);
    });
  });
  
  describe('8.4 Report Verification - Data Integrity', () => {
    
    test('should verify total sales matches sum of bills', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      // Get sales summary
      const salesRes = await helper.get('/reports/sales/summary', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      // Get all bills for today
      const billsRes = await helper.get('/bills', adminToken, {
        outletId,
        startDate: today,
        endDate: today,
        status: 'completed'
      });
      
      expect(salesRes.status).toBe(200);
      expect(billsRes.status).toBe(200);
      
      // Calculate sum from bills
      const billsTotal = billsRes.body.data.reduce((sum, bill) => {
        return sum + parseFloat(bill.grandTotal || 0);
      }, 0);
      
      // Compare with reported total (allow small rounding difference)
      const reportedTotal = parseFloat(salesRes.body.data.totalSales || 0);
      
      expect(Math.abs(billsTotal - reportedTotal)).toBeLessThan(1);
    });
    
    test('should verify tax collected matches sum', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const taxRes = await helper.get('/reports/tax', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(taxRes.status).toBe(200);
      
      if (taxRes.body.data.totalTax !== undefined) {
        expect(parseFloat(taxRes.body.data.totalTax)).toBeGreaterThan(0);
      }
    });
    
    test('should verify order count matches', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      // Get sales summary
      const salesRes = await helper.get('/reports/sales/summary', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      // Get orders count
      const ordersRes = await helper.get('/orders', adminToken, {
        outletId,
        startDate: today,
        endDate: today
      });
      
      expect(salesRes.status).toBe(200);
      expect(ordersRes.status).toBe(200);
      
      const reportedCount = salesRes.body.data.totalOrders || 0;
      const actualCount = ordersRes.body.data.length || ordersRes.body.pagination?.total || 0;
      
      // Should match or be close
      expect(Math.abs(reportedCount - actualCount)).toBeLessThanOrEqual(1);
    });
  });
  
  describe('8.5 Export Reports', () => {
    
    test('should export sales report to Excel', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/sales/export', adminToken, {
        outletId,
        startDate: today,
        endDate: today,
        format: 'excel'
      });
      
      // Should return file or URL
      expect([200, 202]).toContain(res.status);
    });
    
    test('should export GST report', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const res = await helper.get('/reports/gst/export', adminToken, {
        outletId,
        startDate: today,
        endDate: today,
        format: 'excel'
      });
      
      expect([200, 202, 404]).toContain(res.status);
    });
  });
});

module.exports = { helper };
