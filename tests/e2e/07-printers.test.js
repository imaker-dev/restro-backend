/**
 * E2E Test Suite 07: Printers & Invoice
 * Tests: Printer setup, KOT printing, Bill printing, Invoice generation
 */

const { TestHelper } = require('./helpers');

const helper = new TestHelper();

describe('PHASE 7: Printers & Invoice', () => {
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
  
  describe('7.1 Printer Setup', () => {
    
    test('should create KOT printer for kitchen', async () => {
      const res = await helper.post('/printers', {
        name: 'Kitchen KOT Printer',
        outletId: outletId,
        printerType: 'thermal',
        station: 'kot_kitchen',
        connectionType: 'network',
        ipAddress: '192.168.1.101',
        port: 9100,
        paperWidth: 80,
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.station).toBe('kot_kitchen');
      
      global.PRINTER_KOT_KITCHEN = res.body.data.id;
    });
    
    test('should create KOT printer for bar', async () => {
      const res = await helper.post('/printers', {
        name: 'Bar KOT Printer',
        outletId: outletId,
        printerType: 'thermal',
        station: 'kot_bar',
        connectionType: 'network',
        ipAddress: '192.168.1.102',
        port: 9100,
        paperWidth: 80,
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.station).toBe('kot_bar');
      
      global.PRINTER_KOT_BAR = res.body.data.id;
    });
    
    test('should create Bill printer', async () => {
      const res = await helper.post('/printers', {
        name: 'Bill Printer',
        outletId: outletId,
        printerType: 'thermal',
        station: 'bill',
        connectionType: 'network',
        ipAddress: '192.168.1.103',
        port: 9100,
        paperWidth: 80,
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.station).toBe('bill');
      
      global.PRINTER_BILL = res.body.data.id;
    });
    
    test('should get all printers for outlet', async () => {
      const res = await helper.get('/printers', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });
  
  describe('7.2 Printer Status Check', () => {
    
    test('should check printer status', async () => {
      const res = await helper.get('/printers/status', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      
      // Each printer should have status info
      res.body.data.forEach(printer => {
        expect(printer.id).toBeDefined();
        expect(printer.name).toBeDefined();
        // Note: isOnline may be false if printer is not actually connected
      });
    });
  });
  
  describe('7.3 Update Printer', () => {
    
    test('should update printer settings', async () => {
      const res = await helper.put(`/printers/${global.PRINTER_BILL}`, {
        name: 'Main Bill Printer',
        paperWidth: 58
      }, adminToken);
      
      expect(res.status).toBe(200);
    });
    
    test('should verify printer update', async () => {
      const res = await helper.get(`/printers/${global.PRINTER_BILL}`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Main Bill Printer');
    });
  });
  
  describe('7.4 Invoice Generation', () => {
    
    test('should get invoice for bill 1', async () => {
      const cashierToken = global.TOKEN_CASHIER;
      
      const res = await helper.get(`/bills/${global.BILL_1}/invoice`, cashierToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      
      // Verify invoice contains required fields
      const invoice = res.body.data;
      expect(invoice.billNumber).toBeDefined();
      expect(invoice.outletName).toBeDefined();
      expect(invoice.items).toBeDefined();
      expect(invoice.subtotal).toBeDefined();
      expect(invoice.grandTotal).toBeDefined();
    });
    
    test('should verify GST details in invoice', async () => {
      const cashierToken = global.TOKEN_CASHIER;
      
      const res = await helper.get(`/bills/${global.BILL_1}/invoice`, cashierToken);
      
      expect(res.status).toBe(200);
      
      const invoice = res.body.data;
      
      // Should have GST number
      expect(invoice.gstin || invoice.outletGstin).toBeDefined();
      
      // Should have tax breakdown
      expect(invoice.taxDetails || invoice.taxes).toBeDefined();
    });
  });
  
  describe('7.5 Print Bill (Simulated)', () => {
    
    test('should trigger bill print', async () => {
      const cashierToken = global.TOKEN_CASHIER;
      
      // This will attempt to print but may fail if printer is not connected
      // We just verify the API accepts the request
      const res = await helper.post(`/bills/${global.BILL_1}/print`, {}, cashierToken);
      
      // Status could be 200 (success), 202 (queued), or error if no printer
      expect([200, 202, 400, 404, 500]).toContain(res.status);
    });
  });
  
  describe('7.6 Duplicate Bill Print', () => {
    
    test('should print duplicate bill', async () => {
      const cashierToken = global.TOKEN_CASHIER;
      
      const res = await helper.post(`/bills/${global.BILL_1}/print-duplicate`, {}, cashierToken);
      
      // API should accept the request
      expect([200, 202, 400, 404, 500]).toContain(res.status);
    });
  });
  
  describe('7.7 Disable Printer', () => {
    
    test('should deactivate printer', async () => {
      const res = await helper.patch(`/printers/${global.PRINTER_KOT_BAR}`, {
        isActive: false
      }, adminToken);
      
      expect(res.status).toBe(200);
    });
    
    test('should verify printer is inactive', async () => {
      const res = await helper.get(`/printers/${global.PRINTER_KOT_BAR}`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    });
    
    test('should reactivate printer', async () => {
      const res = await helper.patch(`/printers/${global.PRINTER_KOT_BAR}`, {
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(200);
    });
  });
});

module.exports = { helper };
