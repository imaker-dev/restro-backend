/**
 * E2E Test Suite 02: Layout Setup
 * Tests: Floors, Sections, Tables, Kitchen Stations
 */

const { TestHelper } = require('./helpers');
const { SUPER_ADMIN } = require('./config');

const helper = new TestHelper();

describe('PHASE 2: Layout Setup', () => {
  let adminToken;
  let outletId;
  
  beforeAll(async () => {
    // Login as super admin
    const res = await helper.post('/auth/login', {
      email: SUPER_ADMIN.email,
      password: SUPER_ADMIN.password
    });
    adminToken = res.body.data.accessToken;
    
    // Get outlet ID from shared state or global
    outletId = helper.getCreatedId('outlet') || global.TEST_OUTLET_ID;
    
    // If no outlet exists, we need to create one or skip
    if (!outletId) {
      console.log('Warning: No outlet ID found. Run 01-setup.test.js first.');
    }
  });
  
  describe('2.1 Floors', () => {
    
    test('should create Ground Floor', async () => {
      const res = await helper.post(`/outlets/${outletId}/floors`, {
        name: 'Ground Floor',
        code: 'GF',
        floorNumber: 0,
        displayOrder: 1
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Ground Floor');
      expect(res.body.data.floorNumber).toBe(0);
      
      helper.addCreatedId('floors', res.body.data.id);
      global.FLOOR_GROUND = res.body.data.id;
    });
    
    test('should create First Floor', async () => {
      const res = await helper.post(`/outlets/${outletId}/floors`, {
        name: 'First Floor',
        code: 'FF',
        floorNumber: 1,
        displayOrder: 2
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.floorNumber).toBe(1);
      
      helper.addCreatedId('floors', res.body.data.id);
      global.FLOOR_FIRST = res.body.data.id;
    });
    
    test('should create Rooftop', async () => {
      const res = await helper.post(`/outlets/${outletId}/floors`, {
        name: 'Rooftop',
        code: 'RT',
        floorNumber: 2,
        displayOrder: 3
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('floors', res.body.data.id);
      global.FLOOR_ROOFTOP = res.body.data.id;
    });
    
    test('should get all floors for outlet', async () => {
      const res = await helper.get(`/outlets/${outletId}/floors`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
    });
  });
  
  describe('2.2 Sections', () => {
    
    test('should create AC Section', async () => {
      const res = await helper.post(`/outlets/${outletId}/sections`, {
        name: 'AC Section',
        code: 'AC',
        sectionType: 'ac',
        colorCode: '#2196F3',
        displayOrder: 1
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.sectionType).toBe('ac');
      
      helper.addCreatedId('sections', res.body.data.id);
      global.SECTION_AC = res.body.data.id;
    });
    
    test('should create Non-AC Section', async () => {
      const res = await helper.post(`/outlets/${outletId}/sections`, {
        name: 'Non-AC Section',
        code: 'NAC',
        sectionType: 'non_ac',
        colorCode: '#4CAF50',
        displayOrder: 2
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('sections', res.body.data.id);
      global.SECTION_NON_AC = res.body.data.id;
    });
    
    test('should create Bar Section', async () => {
      const res = await helper.post(`/outlets/${outletId}/sections`, {
        name: 'Bar',
        code: 'BAR',
        sectionType: 'bar',
        colorCode: '#9C27B0',
        displayOrder: 3
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('sections', res.body.data.id);
      global.SECTION_BAR = res.body.data.id;
    });
    
    test('should create Outdoor Section', async () => {
      const res = await helper.post(`/outlets/${outletId}/sections`, {
        name: 'Outdoor',
        code: 'OUT',
        sectionType: 'outdoor',
        colorCode: '#FF9800',
        displayOrder: 4
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('sections', res.body.data.id);
      global.SECTION_OUTDOOR = res.body.data.id;
    });
    
    test('should get all sections for outlet', async () => {
      const res = await helper.get(`/outlets/${outletId}/sections`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(4);
    });
  });
  
  describe('2.3 Tables', () => {
    
    test('should create T1 (Ground Floor, AC, 2 seats)', async () => {
      const res = await helper.post('/tables', {
        outletId: outletId,
        floorId: global.FLOOR_GROUND,
        sectionId: global.SECTION_AC,
        tableNumber: 'T1',
        capacity: 2,
        shape: 'round',
        positionX: 100,
        positionY: 100
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.tableNumber).toBe('T1');
      expect(res.body.data.status).toBe('available');
      
      helper.addCreatedId('tables', res.body.data.id);
      global.TABLE_T1 = res.body.data.id;
    });
    
    test('should create T2 (Ground Floor, AC, 4 seats)', async () => {
      const res = await helper.post('/tables', {
        outletId: outletId,
        floorId: global.FLOOR_GROUND,
        sectionId: global.SECTION_AC,
        tableNumber: 'T2',
        capacity: 4,
        shape: 'square'
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('tables', res.body.data.id);
      global.TABLE_T2 = res.body.data.id;
    });
    
    test('should create T3 (Ground Floor, Non-AC, 4 seats)', async () => {
      const res = await helper.post('/tables', {
        outletId: outletId,
        floorId: global.FLOOR_GROUND,
        sectionId: global.SECTION_NON_AC,
        tableNumber: 'T3',
        capacity: 4,
        shape: 'rectangle'
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('tables', res.body.data.id);
      global.TABLE_T3 = res.body.data.id;
    });
    
    test('should create T4 (Ground Floor, Non-AC, 6 seats)', async () => {
      const res = await helper.post('/tables', {
        outletId: outletId,
        floorId: global.FLOOR_GROUND,
        sectionId: global.SECTION_NON_AC,
        tableNumber: 'T4',
        capacity: 6,
        shape: 'rectangle'
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('tables', res.body.data.id);
      global.TABLE_T4 = res.body.data.id;
    });
    
    test('should create B1 (Ground Floor, Bar, 4 seats)', async () => {
      const res = await helper.post('/tables', {
        outletId: outletId,
        floorId: global.FLOOR_GROUND,
        sectionId: global.SECTION_BAR,
        tableNumber: 'B1',
        capacity: 4,
        shape: 'rectangle'
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('tables', res.body.data.id);
      global.TABLE_B1 = res.body.data.id;
    });
    
    test('should create F1 (First Floor, AC, 4 seats)', async () => {
      const res = await helper.post('/tables', {
        outletId: outletId,
        floorId: global.FLOOR_FIRST,
        sectionId: global.SECTION_AC,
        tableNumber: 'F1',
        capacity: 4,
        shape: 'square'
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('tables', res.body.data.id);
      global.TABLE_F1 = res.body.data.id;
    });
    
    test('should create R1 (Rooftop, Outdoor, 8 seats)', async () => {
      const res = await helper.post('/tables', {
        outletId: outletId,
        floorId: global.FLOOR_ROOFTOP,
        sectionId: global.SECTION_OUTDOOR,
        tableNumber: 'R1',
        capacity: 8,
        shape: 'rectangle'
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('tables', res.body.data.id);
      global.TABLE_R1 = res.body.data.id;
    });
    
    test('should get all tables for outlet', async () => {
      const res = await helper.get('/tables', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(7);
      
      // All tables should be available
      res.body.data.forEach(table => {
        expect(table.status).toBe('available');
      });
    });
    
    test('should get tables by floor', async () => {
      const res = await helper.get('/tables', adminToken, { 
        outletId, 
        floorId: global.FLOOR_GROUND 
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(5); // T1, T2, T3, T4, B1
    });
  });
  
  describe('2.4 Kitchen Stations', () => {
    
    test('should create Main Kitchen station', async () => {
      const res = await helper.post(`/outlets/${outletId}/kitchen-stations`, {
        name: 'Main Kitchen',
        code: 'MAIN',
        stationType: 'main_kitchen',
        displayOrder: 1
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.stationType).toBe('main_kitchen');
      
      helper.addCreatedId('kitchenStations', res.body.data.id);
      global.STATION_MAIN = res.body.data.id;
    });
    
    test('should create Bar station', async () => {
      const res = await helper.post(`/outlets/${outletId}/kitchen-stations`, {
        name: 'Bar',
        code: 'BAR',
        stationType: 'bar',
        displayOrder: 2
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('kitchenStations', res.body.data.id);
      global.STATION_BAR = res.body.data.id;
    });
    
    test('should create Dessert station', async () => {
      const res = await helper.post(`/outlets/${outletId}/kitchen-stations`, {
        name: 'Dessert',
        code: 'DESSERT',
        stationType: 'dessert',
        displayOrder: 3
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('kitchenStations', res.body.data.id);
      global.STATION_DESSERT = res.body.data.id;
    });
    
    test('should get all kitchen stations', async () => {
      const res = await helper.get(`/outlets/${outletId}/kitchen-stations`, adminToken);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
    });
  });
});

module.exports = { helper };
