/**
 * E2E Test Suite 03: Staff Setup
 * Tests: Manager, Captain, Cashier with all access and floor-specific access
 */

const { TestHelper, verifyPermissions } = require('./helpers');
const { STAFF, ROLE_IDS } = require('./config');

const helper = new TestHelper();

describe('PHASE 3: Staff Setup', () => {
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
  
  describe('3.1 Manager - All Access', () => {
    
    test('should create manager with all access', async () => {
      const res = await helper.post('/users', {
        name: STAFF.manager.name,
        email: STAFF.manager.email,
        employeeCode: STAFF.manager.employeeCode,
        password: STAFF.manager.password,
        pin: STAFF.manager.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.manager, outletId: outletId }]
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.roles[0].slug).toBe('manager');
      expect(res.body.data.roles[0].outletId).toBe(outletId);
      
      helper.addCreatedId('users', res.body.data.id);
      global.USER_MANAGER = res.body.data.id;
    });
    
    test('should login as manager with email', async () => {
      const res = await helper.post('/auth/login', {
        email: STAFF.manager.email,
        password: STAFF.manager.password
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.roles).toContain('manager');
      
      helper.setToken('manager', res.body.data.accessToken);
      global.TOKEN_MANAGER = res.body.data.accessToken;
    });
    
    test('should verify manager permissions', async () => {
      const res = await helper.get('/auth/me', helper.getToken('manager'));
      
      expect(res.status).toBe(200);
      
      const permissions = res.body.data.permissions;
      verifyPermissions(permissions, [
        'TABLE_VIEW', 'TABLE_CREATE', 'TABLE_UPDATE',
        'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_UPDATE',
        'KOT_SEND', 'KOT_VIEW',
        'BILL_VIEW', 'BILL_GENERATE',
        'REPORT_VIEW'
      ]);
    });
    
    test('manager should access all floors', async () => {
      const res = await helper.get('/tables', helper.getToken('manager'), { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(7); // All tables
    });
  });
  
  describe('3.2 Manager - Floor Specific', () => {
    
    test('should create manager with floor access only', async () => {
      const res = await helper.post('/users', {
        name: STAFF.managerFloorOnly.name,
        email: STAFF.managerFloorOnly.email,
        employeeCode: STAFF.managerFloorOnly.employeeCode,
        password: STAFF.managerFloorOnly.password,
        pin: STAFF.managerFloorOnly.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.manager, outletId: outletId }],
        floors: [
          { floorId: global.FLOOR_GROUND, outletId: outletId, isPrimary: true }
        ]
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.assignedFloors).toBeDefined();
      expect(res.body.data.assignedFloors.length).toBe(1);
      
      helper.addCreatedId('users', res.body.data.id);
      global.USER_MANAGER_FLOOR = res.body.data.id;
    });
    
    test('should login as floor manager', async () => {
      const res = await helper.post('/auth/login', {
        email: STAFF.managerFloorOnly.email,
        password: STAFF.managerFloorOnly.password
      });
      
      expect(res.status).toBe(200);
      helper.setToken('managerFloor', res.body.data.accessToken);
    });
  });
  
  describe('3.3 Captain - All Access', () => {
    
    test('should create captain with all access', async () => {
      const res = await helper.post('/users', {
        name: STAFF.captain.name,
        employeeCode: STAFF.captain.employeeCode,
        pin: STAFF.captain.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.captain, outletId: outletId }]
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.roles[0].slug).toBe('captain');
      
      helper.addCreatedId('users', res.body.data.id);
      global.USER_CAPTAIN = res.body.data.id;
    });
    
    test('should login as captain with PIN', async () => {
      const res = await helper.post('/auth/login/pin', {
        employeeCode: STAFF.captain.employeeCode,
        pin: STAFF.captain.pin
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.roles).toContain('captain');
      
      helper.setToken('captain', res.body.data.accessToken);
      global.TOKEN_CAPTAIN = res.body.data.accessToken;
    });
    
    test('should verify captain permissions', async () => {
      const res = await helper.get('/auth/me', helper.getToken('captain'));
      
      expect(res.status).toBe(200);
      
      const permissions = res.body.data.permissions;
      verifyPermissions(permissions, [
        'TABLE_VIEW',
        'ORDER_VIEW', 'ORDER_CREATE',
        'KOT_SEND', 'KOT_VIEW'
      ]);
    });
    
    test('captain should access all tables', async () => {
      const res = await helper.get('/tables', helper.getToken('captain'), { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(7);
    });
  });
  
  describe('3.4 Captain - Floor Specific', () => {
    
    test('should create captain with ground floor only', async () => {
      const res = await helper.post('/users', {
        name: STAFF.captainFloorOnly.name,
        employeeCode: STAFF.captainFloorOnly.employeeCode,
        pin: STAFF.captainFloorOnly.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.captain, outletId: outletId }],
        floors: [
          { floorId: global.FLOOR_GROUND, outletId: outletId, isPrimary: true }
        ]
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.assignedFloors.length).toBe(1);
      
      helper.addCreatedId('users', res.body.data.id);
      global.USER_CAPTAIN_FLOOR = res.body.data.id;
    });
    
    test('should login as floor captain', async () => {
      const res = await helper.post('/auth/login/pin', {
        employeeCode: STAFF.captainFloorOnly.employeeCode,
        pin: STAFF.captainFloorOnly.pin
      });
      
      expect(res.status).toBe(200);
      helper.setToken('captainFloor', res.body.data.accessToken);
      global.TOKEN_CAPTAIN_FLOOR = res.body.data.accessToken;
    });
  });
  
  describe('3.5 Cashier - All Access', () => {
    
    test('should create cashier with all access', async () => {
      const res = await helper.post('/users', {
        name: STAFF.cashier.name,
        employeeCode: STAFF.cashier.employeeCode,
        pin: STAFF.cashier.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.cashier, outletId: outletId }]
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.roles[0].slug).toBe('cashier');
      
      helper.addCreatedId('users', res.body.data.id);
      global.USER_CASHIER = res.body.data.id;
    });
    
    test('should login as cashier with PIN', async () => {
      const res = await helper.post('/auth/login/pin', {
        employeeCode: STAFF.cashier.employeeCode,
        pin: STAFF.cashier.pin
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.roles).toContain('cashier');
      
      helper.setToken('cashier', res.body.data.accessToken);
      global.TOKEN_CASHIER = res.body.data.accessToken;
    });
    
    test('should verify cashier permissions', async () => {
      const res = await helper.get('/auth/me', helper.getToken('cashier'));
      
      expect(res.status).toBe(200);
      
      const permissions = res.body.data.permissions;
      verifyPermissions(permissions, [
        'TABLE_VIEW',
        'ORDER_VIEW',
        'BILL_VIEW', 'BILL_GENERATE', 'BILL_PRINT',
        'PAYMENT_VIEW', 'PAYMENT_COLLECT'
      ]);
    });
  });
  
  describe('3.6 Cashier - Floor Specific', () => {
    
    test('should create cashier with floor access', async () => {
      const res = await helper.post('/users', {
        name: STAFF.cashierFloorOnly.name,
        employeeCode: STAFF.cashierFloorOnly.employeeCode,
        pin: STAFF.cashierFloorOnly.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.cashier, outletId: outletId }],
        floors: [
          { floorId: global.FLOOR_GROUND, outletId: outletId, isPrimary: true }
        ]
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('users', res.body.data.id);
      global.USER_CASHIER_FLOOR = res.body.data.id;
    });
    
    test('should login as floor cashier', async () => {
      const res = await helper.post('/auth/login/pin', {
        employeeCode: STAFF.cashierFloorOnly.employeeCode,
        pin: STAFF.cashierFloorOnly.pin
      });
      
      expect(res.status).toBe(200);
      helper.setToken('cashierFloor', res.body.data.accessToken);
    });
  });
  
  describe('3.7 Kitchen Staff', () => {
    
    test('should create kitchen staff', async () => {
      const res = await helper.post('/users', {
        name: STAFF.kitchen.name,
        employeeCode: STAFF.kitchen.employeeCode,
        pin: STAFF.kitchen.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.kitchen, outletId: outletId }]
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('users', res.body.data.id);
      global.USER_KITCHEN = res.body.data.id;
    });
    
    test('should assign kitchen to main station', async () => {
      const res = await helper.post(`/users/${global.USER_KITCHEN}/stations`, {
        stationId: global.STATION_MAIN,
        outletId: outletId,
        isPrimary: true
      }, adminToken);
      
      expect(res.status).toBe(200);
    });
    
    test('should login as kitchen', async () => {
      const res = await helper.post('/auth/login/pin', {
        employeeCode: STAFF.kitchen.employeeCode,
        pin: STAFF.kitchen.pin
      });
      
      expect(res.status).toBe(200);
      helper.setToken('kitchen', res.body.data.accessToken);
      global.TOKEN_KITCHEN = res.body.data.accessToken;
    });
    
    test('should verify kitchen permissions', async () => {
      const res = await helper.get('/auth/me', helper.getToken('kitchen'));
      
      expect(res.status).toBe(200);
      
      const permissions = res.body.data.permissions;
      verifyPermissions(permissions, [
        'KOT_VIEW', 'KOT_ACCEPT', 'KOT_READY'
      ]);
    });
  });
  
  describe('3.8 Bartender', () => {
    
    test('should create bartender', async () => {
      const res = await helper.post('/users', {
        name: STAFF.bartender.name,
        employeeCode: STAFF.bartender.employeeCode,
        pin: STAFF.bartender.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.bartender, outletId: outletId }]
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('users', res.body.data.id);
      global.USER_BARTENDER = res.body.data.id;
    });
    
    test('should assign bartender to bar station', async () => {
      const res = await helper.post(`/users/${global.USER_BARTENDER}/stations`, {
        stationId: global.STATION_BAR,
        outletId: outletId,
        isPrimary: true
      }, adminToken);
      
      expect(res.status).toBe(200);
    });
    
    test('should login as bartender', async () => {
      const res = await helper.post('/auth/login/pin', {
        employeeCode: STAFF.bartender.employeeCode,
        pin: STAFF.bartender.pin
      });
      
      expect(res.status).toBe(200);
      helper.setToken('bartender', res.body.data.accessToken);
      global.TOKEN_BARTENDER = res.body.data.accessToken;
    });
  });
  
  describe('3.9 Get All Staff', () => {
    
    test('should get all users for outlet', async () => {
      const res = await helper.get('/users', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(8);
      
      const roles = res.body.data.map(u => u.roles).flat();
      expect(roles).toContain('manager');
      expect(roles).toContain('captain');
      expect(roles).toContain('cashier');
      expect(roles).toContain('kitchen');
      expect(roles).toContain('bartender');
    });
  });
});

module.exports = { helper };
