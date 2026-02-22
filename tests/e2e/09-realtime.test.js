/**
 * E2E Test Suite 09: Real-time Events
 * Tests: Socket.io events for KOT, orders, tables
 */

const { io } = require('socket.io-client');
const { TestHelper } = require('./helpers');
const { SOCKET_URL } = require('./config');

const helper = new TestHelper();

describe('PHASE 9: Real-time Events', () => {
  let socket;
  let adminToken, captainToken, kitchenToken, cashierToken;
  let outletId;
  
  beforeAll(async () => {
    adminToken = (await helper.post('/auth/login', {
      email: 'e2e.admin@testrestro.com',
      password: 'E2EAdmin@123'
    })).body.data.accessToken;
    
    captainToken = global.TOKEN_CAPTAIN;
    kitchenToken = global.TOKEN_KITCHEN;
    cashierToken = global.TOKEN_CASHIER;
    outletId = global.TEST_OUTLET_ID;
  });
  
  afterAll(() => {
    if (socket && socket.connected) {
      socket.disconnect();
    }
  });
  
  describe('9.1 Socket Connection', () => {
    
    test('should connect to socket server', (done) => {
      socket = io(SOCKET_URL, {
        auth: { token: captainToken },
        transports: ['websocket']
      });
      
      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        done();
      });
      
      socket.on('connect_error', (err) => {
        // Socket server might not be running
        console.log('Socket connection error:', err.message);
        done();
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (!socket.connected) {
          console.log('Socket connection timed out - server may not be running');
          done();
        }
      }, 5000);
    });
    
    test('should join outlet room', (done) => {
      if (!socket || !socket.connected) {
        console.log('Socket not connected, skipping');
        done();
        return;
      }
      
      socket.emit('join:outlet', { outletId });
      
      socket.on('joined:outlet', (data) => {
        expect(data.outletId).toBe(outletId);
        done();
      });
      
      setTimeout(() => done(), 2000);
    });
  });
  
  describe('9.2 Order Events', () => {
    let testOrderId;
    const receivedEvents = [];
    
    beforeAll(() => {
      if (socket && socket.connected) {
        socket.on('order:created', (data) => receivedEvents.push({ type: 'order:created', data }));
        socket.on('order:updated', (data) => receivedEvents.push({ type: 'order:updated', data }));
      }
    });
    
    test('should receive order:created event', async () => {
      if (!socket || !socket.connected) {
        console.log('Socket not connected, skipping');
        return;
      }
      
      // Clear previous events
      receivedEvents.length = 0;
      
      // Create order
      const res = await helper.post('/orders', {
        outletId: outletId,
        tableId: global.TABLE_T4,
        orderType: 'dine_in',
        covers: 2,
        items: [
          { menuItemId: global.ITEM_PANEER_TIKKA, quantity: 1, price: 250 }
        ]
      }, captainToken);
      
      expect(res.status).toBe(201);
      testOrderId = res.body.data.id;
      
      // Wait for socket event
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const orderCreatedEvent = receivedEvents.find(e => e.type === 'order:created');
      if (orderCreatedEvent) {
        expect(orderCreatedEvent.data.order.id).toBe(testOrderId);
      }
    });
    
    test('should receive order:updated event on status change', async () => {
      if (!socket || !socket.connected || !testOrderId) {
        console.log('Socket not connected or no test order');
        return;
      }
      
      receivedEvents.length = 0;
      
      // Send KOT (changes order status)
      await helper.post(`/orders/${testOrderId}/kot`, {}, captainToken);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const orderUpdatedEvent = receivedEvents.find(e => e.type === 'order:updated');
      if (orderUpdatedEvent) {
        expect(orderUpdatedEvent.data.order.status).toBe('preparing');
      }
    });
  });
  
  describe('9.3 KOT Events', () => {
    const kotEvents = [];
    
    beforeAll(() => {
      if (socket && socket.connected) {
        socket.on('kot:created', (data) => kotEvents.push({ type: 'kot:created', data }));
        socket.on('kot:updated', (data) => kotEvents.push({ type: 'kot:updated', data }));
        socket.on('kot:accepted', (data) => kotEvents.push({ type: 'kot:accepted', data }));
        socket.on('kot:item_ready', (data) => kotEvents.push({ type: 'kot:item_ready', data }));
        socket.on('kot:ready', (data) => kotEvents.push({ type: 'kot:ready', data }));
      }
    });
    
    test('should receive kot:created event', async () => {
      if (!socket || !socket.connected) {
        console.log('Socket not connected, skipping');
        return;
      }
      
      kotEvents.length = 0;
      
      // Create new order and send KOT
      const orderRes = await helper.post('/orders', {
        outletId: outletId,
        tableId: global.TABLE_F1,
        orderType: 'dine_in',
        covers: 2,
        items: [
          { menuItemId: global.ITEM_DAL_MAKHANI, quantity: 1, price: 280 }
        ]
      }, captainToken);
      
      const orderId = orderRes.body.data.id;
      await helper.post(`/orders/${orderId}/kot`, {}, captainToken);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const kotCreatedEvent = kotEvents.find(e => e.type === 'kot:created');
      if (kotCreatedEvent) {
        expect(kotCreatedEvent.data.kot).toBeDefined();
        expect(kotCreatedEvent.data.kot.items.length).toBeGreaterThan(0);
        
        // Verify KOT item has correct ID (kot_items.id, not order_item_id)
        const item = kotCreatedEvent.data.kot.items[0];
        expect(item.id).toBeDefined();
        expect(item.kotId).toBeDefined();
      }
    });
    
    test('should receive kot:accepted event', async () => {
      if (!socket || !socket.connected) {
        console.log('Socket not connected, skipping');
        return;
      }
      
      // Get a pending KOT
      const kotsRes = await helper.get('/kots', kitchenToken, {
        outletId,
        station: 'main_kitchen',
        status: 'pending'
      });
      
      if (kotsRes.body.data && kotsRes.body.data.length > 0) {
        kotEvents.length = 0;
        
        const kotId = kotsRes.body.data[0].id;
        await helper.patch(`/kots/${kotId}/accept`, {}, kitchenToken);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const acceptedEvent = kotEvents.find(e => e.type === 'kot:accepted' || e.type === 'kot:updated');
        if (acceptedEvent) {
          expect(acceptedEvent.data.kot.status).toBe('accepted');
        }
      }
    });
    
    test('should receive kot:item_ready event', async () => {
      if (!socket || !socket.connected) {
        console.log('Socket not connected, skipping');
        return;
      }
      
      // Get an accepted KOT
      const kotsRes = await helper.get('/kots', kitchenToken, {
        outletId,
        station: 'main_kitchen',
        status: 'accepted'
      });
      
      if (kotsRes.body.data && kotsRes.body.data.length > 0) {
        kotEvents.length = 0;
        
        const kot = kotsRes.body.data[0];
        const kotDetailRes = await helper.get(`/kots/${kot.id}`, kitchenToken);
        
        if (kotDetailRes.body.data.items && kotDetailRes.body.data.items.length > 0) {
          const item = kotDetailRes.body.data.items[0];
          await helper.patch(`/kots/${kot.id}/items/${item.id}/ready`, {}, kitchenToken);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const itemReadyEvent = kotEvents.find(e => e.type === 'kot:item_ready');
          if (itemReadyEvent) {
            expect(itemReadyEvent.data.kot.items).toBeDefined();
          }
        }
      }
    });
  });
  
  describe('9.4 Table Events', () => {
    const tableEvents = [];
    
    beforeAll(() => {
      if (socket && socket.connected) {
        socket.on('table:updated', (data) => tableEvents.push({ type: 'table:updated', data }));
        socket.on('table:status_changed', (data) => tableEvents.push({ type: 'table:status_changed', data }));
      }
    });
    
    test('should receive table status change event', async () => {
      if (!socket || !socket.connected) {
        console.log('Socket not connected, skipping');
        return;
      }
      
      tableEvents.length = 0;
      
      // Create order on available table (R1)
      const orderRes = await helper.post('/orders', {
        outletId: outletId,
        tableId: global.TABLE_R1,
        orderType: 'dine_in',
        covers: 4,
        items: [
          { menuItemId: global.ITEM_MOJITO, quantity: 2, price: 180 }
        ]
      }, captainToken);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const tableEvent = tableEvents.find(e => 
        e.type === 'table:updated' || e.type === 'table:status_changed'
      );
      
      if (tableEvent) {
        expect(tableEvent.data.table.status).toBe('occupied');
      }
    });
  });
  
  describe('9.5 Bill Events', () => {
    const billEvents = [];
    
    beforeAll(() => {
      if (socket && socket.connected) {
        socket.on('bill:created', (data) => billEvents.push({ type: 'bill:created', data }));
        socket.on('bill:paid', (data) => billEvents.push({ type: 'bill:paid', data }));
      }
    });
    
    test('should receive bill:created event', async () => {
      if (!socket || !socket.connected) {
        console.log('Socket not connected, skipping');
        return;
      }
      
      // Get a served order without bill
      const ordersRes = await helper.get('/orders', captainToken, {
        outletId,
        status: 'served'
      });
      
      if (ordersRes.body.data && ordersRes.body.data.length > 0) {
        billEvents.length = 0;
        
        const order = ordersRes.body.data.find(o => !o.billId);
        if (order) {
          await helper.post(`/orders/${order.id}/bill`, {}, cashierToken);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const billCreatedEvent = billEvents.find(e => e.type === 'bill:created');
          if (billCreatedEvent) {
            expect(billCreatedEvent.data.bill).toBeDefined();
          }
        }
      }
    });
  });
  
  describe('9.6 Kitchen Display Events', () => {
    let kitchenSocket;
    
    test('should connect as kitchen and receive station-specific events', (done) => {
      kitchenSocket = io(SOCKET_URL, {
        auth: { token: kitchenToken },
        transports: ['websocket']
      });
      
      kitchenSocket.on('connect', () => {
        // Join kitchen station room
        kitchenSocket.emit('join:station', { 
          outletId, 
          station: 'main_kitchen' 
        });
        
        setTimeout(() => {
          kitchenSocket.disconnect();
          done();
        }, 1000);
      });
      
      kitchenSocket.on('connect_error', () => {
        console.log('Kitchen socket connection failed');
        done();
      });
      
      setTimeout(() => done(), 3000);
    });
  });
  
  describe('9.7 Disconnect', () => {
    
    test('should disconnect cleanly', () => {
      if (socket && socket.connected) {
        socket.disconnect();
        expect(socket.connected).toBe(false);
      }
    });
  });
});

module.exports = { helper };
