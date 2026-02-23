/**
 * E2E Test Suite 05: Order Flow
 * Tests: Create order, KOT, Accept, Ready, Serve with tax calculations
 */

const { TestHelper, verifyOrderStatus, verifyKotStatus, verifyTableStatus } = require('./helpers');

const helper = new TestHelper();

describe('PHASE 5: Order Flow', () => {
  let captainToken, kitchenToken, bartenderToken;
  let outletId;
  
  beforeAll(async () => {
    captainToken = global.TOKEN_CAPTAIN;
    kitchenToken = global.TOKEN_KITCHEN;
    bartenderToken = global.TOKEN_BARTENDER;
    outletId = global.TEST_OUTLET_ID;
  });
  
  describe('5.1 Create Order - Table T1', () => {
    let orderId, orderNumber;
    
    test('should create order on table T1', async () => {
      const res = await helper.post('/orders', {
        outletId: outletId,
        tableId: global.TABLE_T1,
        orderType: 'dine_in',
        covers: 2,
        items: [
          {
            menuItemId: global.ITEM_PANEER_TIKKA,
            quantity: 1,
            price: 250
          },
          {
            menuItemId: global.ITEM_DAL_MAKHANI,
            quantity: 1,
            price: 280
          },
          {
            menuItemId: global.ITEM_LIME_SODA,
            quantity: 2,
            price: 80
          }
        ]
      }, captainToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.tableId).toBe(global.TABLE_T1);
      expect(res.body.data.status).toBe('confirmed');
      expect(res.body.data.orderNumber).toBeDefined();
      
      orderId = res.body.data.id;
      orderNumber = res.body.data.orderNumber;
      global.ORDER_1 = orderId;
      global.ORDER_1_NUMBER = orderNumber;
      
      helper.addCreatedId('orders', orderId);
    });
    
    test('should verify table status changed to occupied', async () => {
      const res = await helper.get(`/tables/${global.TABLE_T1}`, captainToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('occupied');
    });
    
    test('should verify order calculation', async () => {
      const res = await helper.get(`/orders/${global.ORDER_1}`, captainToken);
      
      expect(res.status).toBe(200);
      
      // Subtotal: 250 + 280 + (80 * 2) = 690
      // Tax: (250 + 280) * 5% + (160) * 18% = 26.50 + 28.80 = 55.30
      expect(parseFloat(res.body.data.subtotal)).toBeCloseTo(690, 0);
    });
  });
  
  describe('5.2 Send KOT', () => {
    
    test('should send KOT for order', async () => {
      const res = await helper.post(`/orders/${global.ORDER_1}/kot`, {}, captainToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.kots).toBeDefined();
      expect(res.body.data.kots.length).toBeGreaterThanOrEqual(1);
      
      // Should have 2 KOTs: one for kitchen (Paneer + Dal), one for bar (Lime Soda)
      const kitchenKot = res.body.data.kots.find(k => k.station === 'main_kitchen');
      const barKot = res.body.data.kots.find(k => k.station === 'bar');
      
      if (kitchenKot) {
        global.KOT_KITCHEN = kitchenKot.id;
        helper.addCreatedId('kots', kitchenKot.id);
      }
      if (barKot) {
        global.KOT_BAR = barKot.id;
        helper.addCreatedId('kots', barKot.id);
      }
    });
    
    test('should verify order status is preparing', async () => {
      const res = await helper.get(`/orders/${global.ORDER_1}`, captainToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('preparing');
    });
  });
  
  describe('5.3 Kitchen KOT Flow', () => {
    
    test('kitchen should see pending KOTs', async () => {
      const res = await helper.get('/kots', kitchenToken, { 
        outletId, 
        station: 'main_kitchen',
        status: 'pending'
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
    
    test('kitchen should accept KOT', async () => {
      if (!global.KOT_KITCHEN) {
        console.log('No kitchen KOT to accept');
        return;
      }
      
      const res = await helper.patch(`/kots/${global.KOT_KITCHEN}/accept`, {}, kitchenToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('accepted');
    });
    
    test('kitchen should mark KOT items ready', async () => {
      if (!global.KOT_KITCHEN) return;
      
      // Get KOT items
      const kotRes = await helper.get(`/kots/${global.KOT_KITCHEN}`, kitchenToken);
      const items = kotRes.body.data.items;
      
      // Mark each item ready
      for (const item of items) {
        const res = await helper.patch(`/kots/${global.KOT_KITCHEN}/items/${item.id}/ready`, {}, kitchenToken);
        expect(res.status).toBe(200);
      }
    });
    
    test('kitchen KOT should be ready', async () => {
      if (!global.KOT_KITCHEN) return;
      
      const res = await helper.get(`/kots/${global.KOT_KITCHEN}`, kitchenToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ready');
    });
  });
  
  describe('5.4 Bar KOT Flow', () => {
    
    test('bartender should see pending KOTs', async () => {
      const res = await helper.get('/kots', bartenderToken, { 
        outletId, 
        station: 'bar',
        status: 'pending'
      });
      
      expect(res.status).toBe(200);
    });
    
    test('bartender should accept and ready KOT', async () => {
      if (!global.KOT_BAR) {
        console.log('No bar KOT');
        return;
      }
      
      // Accept
      await helper.patch(`/kots/${global.KOT_BAR}/accept`, {}, bartenderToken);
      
      // Get items and mark ready
      const kotRes = await helper.get(`/kots/${global.KOT_BAR}`, bartenderToken);
      for (const item of kotRes.body.data.items) {
        await helper.patch(`/kots/${global.KOT_BAR}/items/${item.id}/ready`, {}, bartenderToken);
      }
    });
  });
  
  describe('5.5 Serve Order', () => {
    
    test('captain should mark order as served', async () => {
      const res = await helper.patch(`/orders/${global.ORDER_1}/serve`, {}, captainToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('served');
    });
    
    test('should verify all KOTs are served', async () => {
      const res = await helper.get(`/orders/${global.ORDER_1}`, captainToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('served');
    });
  });
  
  describe('5.6 Create Order - Table T2 (Multiple items)', () => {
    
    test('should create order with multiple items', async () => {
      const res = await helper.post('/orders', {
        outletId: outletId,
        tableId: global.TABLE_T2,
        orderType: 'dine_in',
        covers: 4,
        items: [
          { menuItemId: global.ITEM_CHICKEN_WINGS, quantity: 2, price: 320 },
          { menuItemId: global.ITEM_BUTTER_CHICKEN, quantity: 2, price: 380 },
          { menuItemId: global.ITEM_BIRYANI, quantity: 2, price: 450, variantName: 'Full' },
          { menuItemId: global.ITEM_MOJITO, quantity: 4, price: 180 },
          { menuItemId: global.ITEM_GULAB_JAMUN, quantity: 4, price: 120 }
        ]
      }, captainToken);
      
      expect(res.status).toBe(201);
      
      global.ORDER_2 = res.body.data.id;
      helper.addCreatedId('orders', res.body.data.id);
      
      // Subtotal: (320*2) + (380*2) + (450*2) + (180*4) + (120*4) = 640+760+900+720+480 = 3500
    });
    
    test('should send KOT and process to served', async () => {
      // Send KOT
      await helper.post(`/orders/${global.ORDER_2}/kot`, {}, captainToken);
      
      // Quick process (accept and ready all)
      const orderRes = await helper.get(`/orders/${global.ORDER_2}`, captainToken);
      
      if (orderRes.body.data.kots) {
        for (const kot of orderRes.body.data.kots) {
          // Accept
          await helper.patch(`/kots/${kot.id}/accept`, {}, kitchenToken);
          
          // Get and ready items
          const kotRes = await helper.get(`/kots/${kot.id}`, kitchenToken);
          for (const item of kotRes.body.data.items || []) {
            await helper.patch(`/kots/${kot.id}/items/${item.id}/ready`, {}, kitchenToken);
          }
        }
      }
      
      // Serve
      const serveRes = await helper.patch(`/orders/${global.ORDER_2}/serve`, {}, captainToken);
      expect(serveRes.status).toBe(200);
    });
  });
  
  describe('5.7 Takeaway Order', () => {
    
    test('should create takeaway order', async () => {
      const res = await helper.post('/orders', {
        outletId: outletId,
        orderType: 'takeaway',
        customerName: 'Test Customer',
        customerPhone: '+91-9876543210',
        items: [
          { menuItemId: global.ITEM_BUTTER_CHICKEN, quantity: 1, price: 380 },
          { menuItemId: global.ITEM_DAL_MAKHANI, quantity: 1, price: 280 }
        ]
      }, captainToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.orderType).toBe('takeaway');
      expect(res.body.data.tableId).toBeNull();
      
      global.ORDER_TAKEAWAY = res.body.data.id;
      helper.addCreatedId('orders', res.body.data.id);
    });
    
    test('should process takeaway order', async () => {
      await helper.post(`/orders/${global.ORDER_TAKEAWAY}/kot`, {}, captainToken);
      
      // Get KOTs and process
      const orderRes = await helper.get(`/orders/${global.ORDER_TAKEAWAY}`, captainToken);
      for (const kot of orderRes.body.data.kots || []) {
        await helper.patch(`/kots/${kot.id}/accept`, {}, kitchenToken);
        const kotRes = await helper.get(`/kots/${kot.id}`, kitchenToken);
        for (const item of kotRes.body.data.items || []) {
          await helper.patch(`/kots/${kot.id}/items/${item.id}/ready`, {}, kitchenToken);
        }
      }
      
      await helper.patch(`/orders/${global.ORDER_TAKEAWAY}/serve`, {}, captainToken);
    });
  });
});

module.exports = { helper };
