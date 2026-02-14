/**
 * Test: Floor Restriction Enforcement
 * Verifies captain/cashier with floor assignments can ONLY see their assigned floors/tables
 */
require('dotenv').config();
var axios = require('axios');
var { initializeDatabase, getPool } = require('../database');

var BASE = 'http://localhost:3000/api/v1';
var OUTLET_ID = 4;

var passed = 0, failed = 0;
var createdUserIds = [];

function section(t) { console.log('\n' + '='.repeat(60) + '\n  ' + t + '\n' + '='.repeat(60)); }
function test(name, cond, detail) {
  if (cond) { passed++; console.log('   OK ' + name); }
  else { failed++; console.log('   FAIL: ' + name + (detail ? ' -> ' + detail : '')); }
}

(async function() {
  console.log('Floor Restriction Enforcement — Integration Tests');
  await initializeDatabase();
  var pool = getPool();

  // Admin login
  var login = await axios.post(BASE + '/auth/login', { email: 'admin@restropos.com', password: 'admin123' });
  var adminToken = login.data.data.accessToken;
  var adminApi = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + adminToken } });

  // Get floors and roles
  var floorsRes = await adminApi.get('/outlets/' + OUTLET_ID + '/floors');
  var allFloors = floorsRes.data.data;
  console.log('All floors: ' + allFloors.map(function(f) { return f.name + '(id:' + f.id + ')'; }).join(', '));

  var rolesRes = await adminApi.get('/users/roles');
  var roles = rolesRes.data.data;
  var captainRole = roles.find(function(r) { return r.slug === 'captain'; });
  var cashierRole = roles.find(function(r) { return r.slug === 'cashier'; });

  test('At least 2 floors available', allFloors.length >= 2);
  if (allFloors.length < 2) {
    console.log('Need at least 2 floors to test restrictions. Exiting.');
    process.exit(1);
  }

  var floor1 = allFloors[0]; // Ground Floor
  var floor2 = allFloors[1]; // First Floor
  var ts = Date.now();

  // =============================================
  section('1. Create captain assigned to Floor 1 ONLY');
  // =============================================
  var captainData = {
    name: 'Restricted Captain ' + ts,
    email: 'rcapt' + ts + '@test.com',
    employeeCode: 'RC' + String(ts).slice(-4),
    password: 'Captain@123',
    pin: '5555',
    isActive: true,
    roles: [{ roleId: captainRole.id, outletId: OUTLET_ID }],
    floors: [{ floorId: floor1.id, outletId: OUTLET_ID, isPrimary: true }]
  };
  var createRes = await adminApi.post('/users', captainData);
  test('Create restricted captain: success', createRes.data.success);
  var captain = createRes.data.data;
  createdUserIds.push(captain.id);

  // Login as captain
  var captainLogin = await axios.post(BASE + '/auth/login/pin', {
    employeeCode: captainData.employeeCode,
    pin: captainData.pin,
    outletId: OUTLET_ID
  });
  var captainToken = captainLogin.data.data.accessToken;
  var captainApi = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + captainToken } });

  test('Captain login: assignedFloors = 1', captainLogin.data.data.user.assignedFloors.length === 1);
  test('Captain login: assigned to ' + floor1.name, captainLogin.data.data.user.assignedFloors[0].floorId === floor1.id);

  // =============================================
  section('2. Captain: GET floors — should only see assigned floor');
  // =============================================
  var captainFloorsRes = await captainApi.get('/outlets/' + OUTLET_ID + '/floors');
  var captainFloors = captainFloorsRes.data.data;
  test('Captain sees only 1 floor', captainFloors.length === 1, 'sees ' + captainFloors.length);
  test('Captain sees ' + floor1.name, captainFloors[0].id === floor1.id, 'sees ' + captainFloors[0].name);

  // Admin should still see all floors
  var adminFloorsRes = await adminApi.get('/outlets/' + OUTLET_ID + '/floors');
  test('Admin sees all floors', adminFloorsRes.data.data.length === allFloors.length);

  // =============================================
  section('3. Captain: GET tables/floor/:id — only allowed floor');
  // =============================================
  var captainTablesRes = await captainApi.get('/tables/floor/' + floor1.id);
  test('Captain can access floor 1 tables', captainTablesRes.status === 200);

  // Try accessing floor 2 — should be 403
  try {
    var forbiddenRes = await captainApi.get('/tables/floor/' + floor2.id);
    test('Captain blocked from floor 2', forbiddenRes.data.success === false);
  } catch (err) {
    test('Captain blocked from floor 2 (403)', err.response && err.response.status === 403,
      'status=' + (err.response ? err.response.status : 'no response'));
  }

  // Admin can access any floor
  var adminFloor2 = await adminApi.get('/tables/floor/' + floor2.id);
  test('Admin can access any floor', adminFloor2.status === 200);

  // =============================================
  section('4. Captain: GET tables/outlet/:id — auto-filtered');
  // =============================================
  var captainOutletTables = await captainApi.get('/tables/outlet/' + OUTLET_ID);
  var captainTableFloors = {};
  captainOutletTables.data.data.forEach(function(t) {
    captainTableFloors[t.floor_id] = true;
  });
  var floorIdsInResult = Object.keys(captainTableFloors).map(Number);
  test('Captain outlet tables: only from floor 1',
    floorIdsInResult.length === 1 && floorIdsInResult[0] === floor1.id,
    'floor_ids=' + JSON.stringify(floorIdsInResult));

  // Admin should see tables from all floors
  var adminOutletTables = await adminApi.get('/tables/outlet/' + OUTLET_ID);
  var adminTableFloors = {};
  adminOutletTables.data.data.forEach(function(t) { adminTableFloors[t.floor_id] = true; });
  test('Admin outlet tables: from multiple floors', Object.keys(adminTableFloors).length > 1);

  // =============================================
  section('5. Captain: GET tables/realtime/:outletId — auto-filtered');
  // =============================================
  var captainRealtime = await captainApi.get('/tables/realtime/' + OUTLET_ID);
  var realtimeFloors = {};
  captainRealtime.data.data.forEach(function(t) { realtimeFloors[t.floor_id] = true; });
  var realtimeFloorIds = Object.keys(realtimeFloors).map(Number);
  test('Captain realtime: only floor 1 tables',
    realtimeFloorIds.length <= 1 && (realtimeFloorIds.length === 0 || realtimeFloorIds[0] === floor1.id),
    'floor_ids=' + JSON.stringify(realtimeFloorIds));

  // =============================================
  section('6. Create captain with NO floor restriction');
  // =============================================
  var unrestrictedData = {
    name: 'Unrestricted Captain ' + ts,
    email: 'ucapt' + ts + '@test.com',
    employeeCode: 'UC' + String(ts).slice(-4),
    password: 'Captain@123',
    pin: '6666',
    isActive: true,
    roles: [{ roleId: captainRole.id, outletId: OUTLET_ID }]
    // No floors = unrestricted
  };
  var ucRes = await adminApi.post('/users', unrestrictedData);
  createdUserIds.push(ucRes.data.data.id);

  var ucLogin = await axios.post(BASE + '/auth/login/pin', {
    employeeCode: unrestrictedData.employeeCode,
    pin: unrestrictedData.pin,
    outletId: OUTLET_ID
  });
  var ucApi = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + ucLogin.data.data.accessToken } });

  var ucFloors = await ucApi.get('/outlets/' + OUTLET_ID + '/floors');
  test('Unrestricted captain sees all floors', ucFloors.data.data.length === allFloors.length,
    'sees ' + ucFloors.data.data.length + ' expected ' + allFloors.length);

  var ucFloor2 = await ucApi.get('/tables/floor/' + floor2.id);
  test('Unrestricted captain can access any floor', ucFloor2.status === 200);

  // =============================================
  section('7. Create captain with MULTIPLE floor assignments');
  // =============================================
  var multiData = {
    name: 'Multi-Floor Captain ' + ts,
    email: 'mcapt' + ts + '@test.com',
    employeeCode: 'MC' + String(ts).slice(-4),
    password: 'Captain@123',
    pin: '7777',
    isActive: true,
    roles: [{ roleId: captainRole.id, outletId: OUTLET_ID }],
    floors: [
      { floorId: floor1.id, outletId: OUTLET_ID, isPrimary: true },
      { floorId: floor2.id, outletId: OUTLET_ID, isPrimary: false }
    ]
  };
  var mcRes = await adminApi.post('/users', multiData);
  createdUserIds.push(mcRes.data.data.id);

  var mcLogin = await axios.post(BASE + '/auth/login/pin', {
    employeeCode: multiData.employeeCode,
    pin: multiData.pin,
    outletId: OUTLET_ID
  });
  var mcApi = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + mcLogin.data.data.accessToken } });

  var mcFloors = await mcApi.get('/outlets/' + OUTLET_ID + '/floors');
  test('Multi-floor captain sees 2 floors', mcFloors.data.data.length === 2);

  // Can access both assigned floors
  var mcFloor1 = await mcApi.get('/tables/floor/' + floor1.id);
  test('Multi-floor captain: access floor 1', mcFloor1.status === 200);
  var mcFloor2 = await mcApi.get('/tables/floor/' + floor2.id);
  test('Multi-floor captain: access floor 2', mcFloor2.status === 200);

  // Cannot access floor 3 (if exists)
  if (allFloors.length >= 3) {
    var floor3 = allFloors[2];
    try {
      var mcFloor3 = await mcApi.get('/tables/floor/' + floor3.id);
      test('Multi-floor captain blocked from floor 3', mcFloor3.data.success === false);
    } catch (err) {
      test('Multi-floor captain blocked from floor 3 (403)', err.response && err.response.status === 403);
    }
  }

  // =============================================
  section('8. Cashier with floor restriction');
  // =============================================
  if (cashierRole) {
    var cashData = {
      name: 'Restricted Cashier ' + ts,
      email: 'rcash' + ts + '@test.com',
      employeeCode: 'RH' + String(ts).slice(-4),
      password: 'Cashier@123',
      pin: '8888',
      isActive: true,
      roles: [{ roleId: cashierRole.id, outletId: OUTLET_ID }],
      floors: [{ floorId: floor1.id, outletId: OUTLET_ID, isPrimary: true }]
    };
    var cashRes = await adminApi.post('/users', cashData);
    createdUserIds.push(cashRes.data.data.id);

    var cashLogin = await axios.post(BASE + '/auth/login/pin', {
      employeeCode: cashData.employeeCode,
      pin: cashData.pin,
      outletId: OUTLET_ID
    });
    var cashApi = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + cashLogin.data.data.accessToken } });

    var cashFloors = await cashApi.get('/outlets/' + OUTLET_ID + '/floors');
    test('Restricted cashier sees 1 floor', cashFloors.data.data.length === 1);
    test('Restricted cashier sees ' + floor1.name, cashFloors.data.data[0].id === floor1.id);

    try {
      await cashApi.get('/tables/floor/' + floor2.id);
      test('Cashier blocked from floor 2', false);
    } catch (err) {
      test('Cashier blocked from floor 2 (403)', err.response && err.response.status === 403);
    }
  }

  // =============================================
  section('9. /auth/me — captain has assignedFloors');
  // =============================================
  var meRes = await captainApi.get('/auth/me');
  test('Me API: assignedFloors present', Array.isArray(meRes.data.data.assignedFloors));
  test('Me API: 1 assigned floor', meRes.data.data.assignedFloors.length === 1);
  test('Me API: floor = ' + floor1.name, meRes.data.data.assignedFloors[0].floorId === floor1.id);
  test('Me API: has floorName', !!meRes.data.data.assignedFloors[0].floorName);
  test('Me API: has floorNumber', meRes.data.data.assignedFloors[0].floorNumber !== undefined);

  // =============================================
  section('Cleanup');
  // =============================================
  for (var i = 0; i < createdUserIds.length; i++) {
    try {
      await adminApi.delete('/users/' + createdUserIds[i]);
      console.log('   Deleted user ' + createdUserIds[i]);
    } catch (e) {
      console.log('   Failed to delete ' + createdUserIds[i] + ': ' + e.message);
    }
  }

  // RESULTS
  console.log('\n' + '='.repeat(60));
  console.log('  RESULTS: OK ' + passed + ' passed, FAIL ' + failed + ' failed');
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\n' + failed + ' test(s) failed');
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
})().catch(function(err) {
  console.error('Fatal:', err.response ? err.response.data : err.message);
  process.exit(1);
});
