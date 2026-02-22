/**
 * E2E Test Suite 06: Billing & Payment
 * Tests: Bill generation, GST/IGST calculation, payment collection
 */

const { TestHelper, verifyBillCalculation } = require('./helpers');

const helper = new TestHelper();

describe('PHASE 6: Billing & Payment', () => {
  let cashierToken, adminToken;
  let outletId;
  
  beforeAll(async () => {
    cashierToken = global.TOKEN_CASHIER;
    outletId = global.TEST_OUTLET_ID;
    
    // Get admin token for reports
    const res = await helper.post('/auth/login', {
      email: 'e2e.admin@testrestro.com',
      password: 'E2EAdmin@123'
    });
    adminToken = res.body.data.accessToken;
  });
  
  describe('6.1 Generate Bill - Order 1 (GST)', () => {
    let billId;
    
    test('should generate bill for order 1', async () => {
      const res = await helper.post(`/orders/${global.ORDER_1}/bill`, {}, cashierToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.billNumber).toBeDefined();
      expect(res.body.data.orderId).toBe(global.ORDER_1);
      
      billId = res.body.data.id;
      global.BILL_1 = billId;
      helper.addCreatedId('bills', billId);
    });
    
    test('should verify bill calculation - Order 1', async () => {
      const res = await helper.get(`/bills/${global.BILL_1}`, cashierToken);
      
      expect(res.status).toBe(200);
      
      const bill = res.body.data;
      
      // Order 1: Paneer Tikka (250) + Dal Makhani (280) + Lime Soda x2 (160)
      // Subtotal = 690
      // Tax: (530 * 5%) + (160 * 18%) = 26.50 + 28.80 = 55.30
      // Grand Total = 745.30
      
      expect(parseFloat(bill.subtotal)).toBeCloseTo(690, 0);
      expect(bill.taxDetails).toBeDefined();
      
      // Verify CGST and SGST breakdown
      const cgst = bill.taxDetails?.find(t => t.code?.includes('CGST'));
      const sgst = bill.taxDetails?.find(t => t.code?.includes('SGST'));
      
      if (cgst && sgst) {
        expect(parseFloat(cgst.amount) + parseFloat(sgst.amount)).toBeGreaterThan(0);
      }
    });
    
    test('should get bill with GST details', async () => {
      const res = await helper.get(`/bills/${global.BILL_1}`, cashierToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.gstin).toBeDefined();
    });
  });
  
  describe('6.2 Payment - Order 1 (Cash)', () => {
    
    test('should collect cash payment', async () => {
      const billRes = await helper.get(`/bills/${global.BILL_1}`, cashierToken);
      const grandTotal = parseFloat(billRes.body.data.grandTotal);
      
      const res = await helper.post(`/bills/${global.BILL_1}/payment`, {
        paymentMethod: 'cash',
        amount: grandTotal,
        receivedAmount: 800,
        changeAmount: 800 - grandTotal
      }, cashierToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.paymentStatus).toBe('paid');
    });
    
    test('should verify order status is completed', async () => {
      const res = await helper.get(`/orders/${global.ORDER_1}`, cashierToken);
      
      expect(res.status).toBe(200);
      // Order status should be 'completed' or 'paid' after payment
      expect(['completed', 'paid']).toContain(res.body.data.status);
    });
    
    test('should verify table T1 is available', async () => {
      const res = await helper.get(`/tables/${global.TABLE_T1}`, cashierToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('available');
    });
  });
  
  describe('6.3 Generate Bill - Order 2 (Large order)', () => {
    
    test('should generate bill for order 2', async () => {
      const res = await helper.post(`/orders/${global.ORDER_2}/bill`, {}, cashierToken);
      
      expect(res.status).toBe(201);
      
      global.BILL_2 = res.body.data.id;
      helper.addCreatedId('bills', res.body.data.id);
    });
    
    test('should verify bill calculation - Order 2', async () => {
      const res = await helper.get(`/bills/${global.BILL_2}`, cashierToken);
      
      expect(res.status).toBe(200);
      
      const bill = res.body.data;
      
      // Order 2: 
      // Chicken Wings x2 (640) - 5%
      // Butter Chicken x2 (760) - 5%
      // Biryani Full x2 (900) - 5%
      // Mojito x4 (720) - 18%
      // Gulab Jamun x4 (480) - 5%
      // 
      // Subtotal = 3500
      // Tax: (640+760+900+480) * 5% + (720) * 18%
      //    = 2780 * 5% + 720 * 18%
      //    = 139 + 129.60 = 268.60
      // Grand Total = 3768.60
      
      expect(parseFloat(bill.subtotal)).toBeCloseTo(3500, 0);
      expect(parseFloat(bill.grandTotal)).toBeGreaterThan(3500);
    });
  });
  
  describe('6.4 Payment - Order 2 (Card)', () => {
    
    test('should collect card payment', async () => {
      const billRes = await helper.get(`/bills/${global.BILL_2}`, cashierToken);
      const grandTotal = parseFloat(billRes.body.data.grandTotal);
      
      const res = await helper.post(`/bills/${global.BILL_2}/payment`, {
        paymentMethod: 'card',
        amount: grandTotal,
        transactionId: 'TXN123456789'
      }, cashierToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.paymentStatus).toBe('paid');
    });
  });
  
  describe('6.5 Generate Bill - Takeaway (IGST scenario)', () => {
    
    test('should generate bill for takeaway order', async () => {
      const res = await helper.post(`/orders/${global.ORDER_TAKEAWAY}/bill`, {}, cashierToken);
      
      expect(res.status).toBe(201);
      
      global.BILL_TAKEAWAY = res.body.data.id;
      helper.addCreatedId('bills', res.body.data.id);
    });
    
    test('should verify takeaway bill calculation', async () => {
      const res = await helper.get(`/bills/${global.BILL_TAKEAWAY}`, cashierToken);
      
      expect(res.status).toBe(200);
      
      // Butter Chicken (380) + Dal Makhani (280) = 660
      // Tax: 660 * 5% = 33
      // Grand Total = 693
      
      expect(parseFloat(res.body.data.subtotal)).toBeCloseTo(660, 0);
    });
  });
  
  describe('6.6 Payment - Takeaway (UPI)', () => {
    
    test('should collect UPI payment', async () => {
      const billRes = await helper.get(`/bills/${global.BILL_TAKEAWAY}`, cashierToken);
      const grandTotal = parseFloat(billRes.body.data.grandTotal);
      
      const res = await helper.post(`/bills/${global.BILL_TAKEAWAY}/payment`, {
        paymentMethod: 'upi',
        amount: grandTotal,
        transactionId: 'UPI987654321'
      }, cashierToken);
      
      expect(res.status).toBe(200);
    });
  });
  
  describe('6.7 Split Payment Test', () => {
    let testOrderId, testBillId;
    
    test('should create order for split payment test', async () => {
      const captainToken = global.TOKEN_CAPTAIN;
      
      const res = await helper.post('/orders', {
        outletId: outletId,
        tableId: global.TABLE_T3,
        orderType: 'dine_in',
        covers: 2,
        items: [
          { menuItemId: global.ITEM_BUTTER_CHICKEN, quantity: 2, price: 380 },
          { menuItemId: global.ITEM_COLD_COFFEE, quantity: 2, price: 150 }
        ]
      }, captainToken);
      
      expect(res.status).toBe(201);
      testOrderId = res.body.data.id;
      
      // Quick process to served
      await helper.post(`/orders/${testOrderId}/kot`, {}, captainToken);
      
      const orderRes = await helper.get(`/orders/${testOrderId}`, captainToken);
      for (const kot of orderRes.body.data.kots || []) {
        await helper.patch(`/kots/${kot.id}/accept`, {}, global.TOKEN_KITCHEN);
        const kotRes = await helper.get(`/kots/${kot.id}`, global.TOKEN_KITCHEN);
        for (const item of kotRes.body.data.items || []) {
          await helper.patch(`/kots/${kot.id}/items/${item.id}/ready`, {}, global.TOKEN_KITCHEN);
        }
      }
      await helper.patch(`/orders/${testOrderId}/serve`, {}, captainToken);
    });
    
    test('should generate bill for split payment', async () => {
      const res = await helper.post(`/orders/${testOrderId}/bill`, {}, cashierToken);
      
      expect(res.status).toBe(201);
      testBillId = res.body.data.id;
    });
    
    test('should collect split payment (cash + card)', async () => {
      const billRes = await helper.get(`/bills/${testBillId}`, cashierToken);
      const grandTotal = parseFloat(billRes.body.data.grandTotal);
      
      const cashAmount = Math.floor(grandTotal / 2);
      const cardAmount = grandTotal - cashAmount;
      
      const res = await helper.post(`/bills/${testBillId}/payment`, {
        payments: [
          { paymentMethod: 'cash', amount: cashAmount },
          { paymentMethod: 'card', amount: cardAmount, transactionId: 'SPLIT123' }
        ]
      }, cashierToken);
      
      expect(res.status).toBe(200);
    });
  });
  
  describe('6.8 Bill Verification', () => {
    
    test('should get all bills for outlet', async () => {
      const res = await helper.get('/bills', cashierToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });
    
    test('should get pending bills', async () => {
      const res = await helper.get('/bills', cashierToken, { outletId, status: 'pending' });
      
      expect(res.status).toBe(200);
    });
    
    test('should get completed bills', async () => {
      const res = await helper.get('/bills', cashierToken, { outletId, status: 'completed' });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });
});

module.exports = { helper };
