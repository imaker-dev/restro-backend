/**
 * E2E Test Suite 01: Initial Setup
 * Tests: Admin login, new admin creation, outlet creation, tax setup
 */

const { TestHelper } = require('./helpers');
const { SUPER_ADMIN, NEW_ADMIN, NEW_OUTLET, ROLE_IDS } = require('./config');

const helper = new TestHelper();

describe('PHASE 1: Initial Setup', () => {
  
  describe('1.1 Super Admin Login', () => {
    
    test('should login with super admin credentials', async () => {
      const res = await helper.post('/auth/login', {
        email: SUPER_ADMIN.email,
        password: SUPER_ADMIN.password
      });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.roles).toContain('super_admin');
      
      helper.setToken('super_admin', res.body.data.accessToken);
    });
    
    test('should verify super admin has all permissions', async () => {
      const token = helper.getToken('super_admin');
      const res = await helper.get('/auth/me', token);
      
      expect(res.status).toBe(200);
      expect(res.body.data.roles[0].slug).toBe('super_admin');
    });
    
    test('should get all available roles', async () => {
      const token = helper.getToken('super_admin');
      const res = await helper.get('/users/roles', token);
      
      expect(res.status).toBe(200);
      expect(res.body.data.roles.length).toBeGreaterThanOrEqual(8);
      
      const roleSlugs = res.body.data.roles.map(r => r.slug);
      expect(roleSlugs).toContain('super_admin');
      expect(roleSlugs).toContain('admin');
      expect(roleSlugs).toContain('manager');
      expect(roleSlugs).toContain('captain');
      expect(roleSlugs).toContain('cashier');
      expect(roleSlugs).toContain('kitchen');
    });
  });
  
  describe('1.2 Create New Admin', () => {
    
    test('should create new admin user', async () => {
      const token = helper.getToken('super_admin');
      
      const res = await helper.post('/users', {
        name: NEW_ADMIN.name,
        email: NEW_ADMIN.email,
        phone: NEW_ADMIN.phone,
        employeeCode: NEW_ADMIN.employeeCode,
        password: NEW_ADMIN.password,
        pin: NEW_ADMIN.pin,
        isVerified: true,
        roles: [{ roleId: ROLE_IDS.admin, outletId: null }]
      }, token);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(NEW_ADMIN.email);
      expect(res.body.data.roles[0].slug).toBe('admin');
      
      helper.addCreatedId('users', res.body.data.id);
    });
    
    test('should login as new admin', async () => {
      const res = await helper.post('/auth/login', {
        email: NEW_ADMIN.email,
        password: NEW_ADMIN.password
      });
      
      expect(res.status).toBe(200);
      expect(res.body.data.user.roles).toContain('admin');
      
      helper.setToken('admin', res.body.data.accessToken);
    });
    
    test('should verify new admin permissions', async () => {
      const token = helper.getToken('admin');
      const res = await helper.get('/auth/me', token);
      
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(NEW_ADMIN.email);
    });
  });
  
  describe('1.3 Create New Outlet', () => {
    
    test('should create new outlet', async () => {
      const token = helper.getToken('admin');
      
      const res = await helper.post('/outlets', NEW_OUTLET, token);
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(NEW_OUTLET.code);
      expect(res.body.data.name).toBe(NEW_OUTLET.name);
      expect(res.body.data.invoice_sequence).toBe(1);
      expect(res.body.data.kot_sequence).toBe(1);
      
      helper.addCreatedId('outlet', res.body.data.id);
      
      // Export outlet ID for other tests
      global.TEST_OUTLET_ID = res.body.data.id;
    });
    
    test('should get outlet details', async () => {
      const token = helper.getToken('admin');
      const outletId = helper.getCreatedId('outlet');
      
      const res = await helper.get(`/outlets/${outletId}`, token);
      
      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe(NEW_OUTLET.code);
      expect(res.body.data.gstin).toBe(NEW_OUTLET.gstin);
    });
  });
  
  describe('1.4 Tax Configuration', () => {
    
    test('should get pre-seeded tax types', async () => {
      const token = helper.getToken('admin');
      
      const res = await helper.get('/tax/types', token);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      
      const gst = res.body.data.find(t => t.code === 'GST');
      expect(gst).toBeDefined();
    });
    
    test('should get pre-seeded tax components', async () => {
      const token = helper.getToken('admin');
      
      const res = await helper.get('/tax/components', token);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(6);
      
      // Verify CGST and SGST components exist
      const cgst25 = res.body.data.find(c => c.code === 'CGST_2.5');
      const sgst25 = res.body.data.find(c => c.code === 'SGST_2.5');
      expect(cgst25).toBeDefined();
      expect(sgst25).toBeDefined();
    });
    
    test('should create GST 5% tax group', async () => {
      const token = helper.getToken('admin');
      const outletId = helper.getCreatedId('outlet');
      
      const res = await helper.post('/tax/groups', {
        name: 'GST 5%',
        code: 'GST_5',
        description: 'GST 5% (CGST 2.5% + SGST 2.5%)',
        outletId: outletId,
        componentIds: [1, 2] // CGST 2.5%, SGST 2.5%
      }, token);
      
      expect(res.status).toBe(201);
      expect(parseFloat(res.body.data.total_rate)).toBe(5);
      
      helper.addCreatedId('taxGroups', res.body.data.id);
      global.TAX_GROUP_5 = res.body.data.id;
    });
    
    test('should create GST 12% tax group', async () => {
      const token = helper.getToken('admin');
      const outletId = helper.getCreatedId('outlet');
      
      const res = await helper.post('/tax/groups', {
        name: 'GST 12%',
        code: 'GST_12',
        description: 'GST 12% (CGST 6% + SGST 6%)',
        outletId: outletId,
        componentIds: [3, 4] // CGST 6%, SGST 6%
      }, token);
      
      expect(res.status).toBe(201);
      expect(parseFloat(res.body.data.total_rate)).toBe(12);
      
      helper.addCreatedId('taxGroups', res.body.data.id);
      global.TAX_GROUP_12 = res.body.data.id;
    });
    
    test('should create GST 18% tax group (default)', async () => {
      const token = helper.getToken('admin');
      const outletId = helper.getCreatedId('outlet');
      
      const res = await helper.post('/tax/groups', {
        name: 'GST 18%',
        code: 'GST_18',
        description: 'GST 18% (CGST 9% + SGST 9%)',
        outletId: outletId,
        componentIds: [5, 6], // CGST 9%, SGST 9%
        isDefault: true
      }, token);
      
      expect(res.status).toBe(201);
      expect(parseFloat(res.body.data.total_rate)).toBe(18);
      expect(res.body.data.is_default).toBe(1);
      
      helper.addCreatedId('taxGroups', res.body.data.id);
      global.TAX_GROUP_18 = res.body.data.id;
    });
    
    test('should create IGST 5% for interstate', async () => {
      const token = helper.getToken('admin');
      const outletId = helper.getCreatedId('outlet');
      
      const res = await helper.post('/tax/groups', {
        name: 'IGST 5%',
        code: 'IGST_5',
        description: 'IGST 5% for interstate supply',
        outletId: outletId,
        componentIds: [7] // IGST 5%
      }, token);
      
      expect(res.status).toBe(201);
      expect(parseFloat(res.body.data.total_rate)).toBe(5);
      
      helper.addCreatedId('taxGroups', res.body.data.id);
      global.TAX_GROUP_IGST_5 = res.body.data.id;
    });
    
    test('should verify all tax groups for outlet', async () => {
      const token = helper.getToken('admin');
      const outletId = helper.getCreatedId('outlet');
      
      const res = await helper.get('/tax/groups', token, { outletId });
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    });
  });
});

// Export helper for use in other test files
module.exports = { helper };
