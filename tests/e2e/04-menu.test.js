/**
 * E2E Test Suite 04: Menu Setup
 * Tests: Categories, Menu Items with variants and addons
 */

const { TestHelper } = require('./helpers');

const helper = new TestHelper();

describe('PHASE 4: Menu Setup', () => {
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
  
  describe('4.1 Categories', () => {
    
    test('should create Starters category', async () => {
      const res = await helper.post('/menu/categories', {
        name: 'Starters',
        code: 'START',
        description: 'Appetizers and starters',
        outletId: outletId,
        displayOrder: 1,
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Starters');
      
      helper.addCreatedId('categories', res.body.data.id);
      global.CAT_STARTERS = res.body.data.id;
    });
    
    test('should create Main Course category', async () => {
      const res = await helper.post('/menu/categories', {
        name: 'Main Course',
        code: 'MAIN',
        description: 'Main dishes',
        outletId: outletId,
        displayOrder: 2,
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('categories', res.body.data.id);
      global.CAT_MAIN = res.body.data.id;
    });
    
    test('should create Beverages category', async () => {
      const res = await helper.post('/menu/categories', {
        name: 'Beverages',
        code: 'BEV',
        description: 'Drinks and beverages',
        outletId: outletId,
        displayOrder: 3,
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('categories', res.body.data.id);
      global.CAT_BEVERAGES = res.body.data.id;
    });
    
    test('should create Desserts category', async () => {
      const res = await helper.post('/menu/categories', {
        name: 'Desserts',
        code: 'DESSERT',
        description: 'Sweets and desserts',
        outletId: outletId,
        displayOrder: 4,
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('categories', res.body.data.id);
      global.CAT_DESSERTS = res.body.data.id;
    });
    
    test('should get all categories', async () => {
      const res = await helper.get('/menu/categories', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(4);
    });
  });
  
  describe('4.2 Menu Items - Kitchen', () => {
    
    test('should create Paneer Tikka (GST 5%)', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Paneer Tikka',
        code: 'PT001',
        description: 'Grilled cottage cheese with spices',
        categoryId: global.CAT_STARTERS,
        outletId: outletId,
        basePrice: 250,
        taxGroupId: global.TAX_GROUP_5,
        station: 'main_kitchen',
        itemType: 'veg',
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.basePrice).toBe(250);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_PANEER_TIKKA = res.body.data.id;
    });
    
    test('should create Chicken Wings (GST 5%)', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Chicken Wings',
        code: 'CW001',
        description: 'Crispy fried chicken wings',
        categoryId: global.CAT_STARTERS,
        outletId: outletId,
        basePrice: 320,
        taxGroupId: global.TAX_GROUP_5,
        station: 'main_kitchen',
        itemType: 'non_veg',
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_CHICKEN_WINGS = res.body.data.id;
    });
    
    test('should create Butter Chicken (GST 5%)', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Butter Chicken',
        code: 'BC001',
        description: 'Creamy tomato-based chicken curry',
        categoryId: global.CAT_MAIN,
        outletId: outletId,
        basePrice: 380,
        taxGroupId: global.TAX_GROUP_5,
        station: 'main_kitchen',
        itemType: 'non_veg',
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_BUTTER_CHICKEN = res.body.data.id;
    });
    
    test('should create Dal Makhani (GST 5%)', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Dal Makhani',
        code: 'DM001',
        description: 'Creamy black lentils',
        categoryId: global.CAT_MAIN,
        outletId: outletId,
        basePrice: 280,
        taxGroupId: global.TAX_GROUP_5,
        station: 'main_kitchen',
        itemType: 'veg',
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_DAL_MAKHANI = res.body.data.id;
    });
    
    test('should create Gulab Jamun (GST 5%)', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Gulab Jamun',
        code: 'GJ001',
        description: 'Sweet dumplings in sugar syrup',
        categoryId: global.CAT_DESSERTS,
        outletId: outletId,
        basePrice: 120,
        taxGroupId: global.TAX_GROUP_5,
        station: 'main_kitchen',
        itemType: 'veg',
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_GULAB_JAMUN = res.body.data.id;
    });
  });
  
  describe('4.3 Menu Items - Bar (GST 18%)', () => {
    
    test('should create Fresh Lime Soda (GST 18%)', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Fresh Lime Soda',
        code: 'FLS001',
        description: 'Refreshing lime with soda',
        categoryId: global.CAT_BEVERAGES,
        outletId: outletId,
        basePrice: 80,
        taxGroupId: global.TAX_GROUP_18,
        station: 'bar',
        itemType: 'veg',
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_LIME_SODA = res.body.data.id;
    });
    
    test('should create Mojito (GST 18%)', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Virgin Mojito',
        code: 'VM001',
        description: 'Mint and lime mocktail',
        categoryId: global.CAT_BEVERAGES,
        outletId: outletId,
        basePrice: 180,
        taxGroupId: global.TAX_GROUP_18,
        station: 'bar',
        itemType: 'veg',
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_MOJITO = res.body.data.id;
    });
    
    test('should create Cold Coffee (GST 18%)', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Cold Coffee',
        code: 'CC001',
        description: 'Chilled coffee with ice cream',
        categoryId: global.CAT_BEVERAGES,
        outletId: outletId,
        basePrice: 150,
        taxGroupId: global.TAX_GROUP_18,
        station: 'bar',
        itemType: 'veg',
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_COLD_COFFEE = res.body.data.id;
    });
  });
  
  describe('4.4 Menu Item with Variants', () => {
    
    test('should create Biryani with size variants', async () => {
      const res = await helper.post('/menu/items', {
        name: 'Chicken Biryani',
        code: 'CB001',
        description: 'Fragrant rice with chicken',
        categoryId: global.CAT_MAIN,
        outletId: outletId,
        basePrice: 280,
        taxGroupId: global.TAX_GROUP_5,
        station: 'main_kitchen',
        itemType: 'non_veg',
        hasVariants: true,
        variants: [
          { name: 'Half', price: 280 },
          { name: 'Full', price: 450 }
        ],
        isActive: true
      }, adminToken);
      
      expect(res.status).toBe(201);
      expect(res.body.data.hasVariants).toBe(true);
      
      helper.addCreatedId('menuItems', res.body.data.id);
      global.ITEM_BIRYANI = res.body.data.id;
    });
  });
  
  describe('4.5 Verify Menu', () => {
    
    test('should get all menu items', async () => {
      const res = await helper.get('/menu/items', adminToken, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(9);
    });
    
    test('should get menu items by category', async () => {
      const res = await helper.get('/menu/items', adminToken, { 
        outletId, 
        categoryId: global.CAT_STARTERS 
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2); // Paneer Tikka, Chicken Wings
    });
    
    test('should get menu items by station', async () => {
      const res = await helper.get('/menu/items', adminToken, { 
        outletId, 
        station: 'bar' 
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3); // Lime Soda, Mojito, Cold Coffee
    });
  });
});

module.exports = { helper };
