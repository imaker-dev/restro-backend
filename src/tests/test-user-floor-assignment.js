/**
 * Test: User Floor Assignment — Create, Login, Me API, Floor Data
 * Tests captain & cashier with floor assignments
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
  console.log('User Floor Assignment — Comprehensive Tests');
  await initializeDatabase();
  var pool = getPool();

  // Admin login
  var login = await axios.post(BASE + '/auth/login', { email: 'admin@restropos.com', password: 'admin123' });
  var adminToken = login.data.data.accessToken || login.data.data.token;
  var api = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + adminToken } });

  // Get floors and roles
  var floorsRes = await api.get('/outlets/' + OUTLET_ID + '/floors');
  var floors = floorsRes.data.data;
  console.log('Available floors: ' + floors.map(function(f) { return f.name + '(id:' + f.id + ')'; }).join(', '));
  test('Has at least 1 floor', floors.length >= 1);

  var rolesRes = await api.get('/users/roles');
  var roles = rolesRes.data.data;
  var captainRole = roles.find(function(r) { return r.slug === 'captain'; });
  var cashierRole = roles.find(function(r) { return r.slug === 'cashier'; });
  test('Captain role found', !!captainRole, captainRole ? 'id=' + captainRole.id : 'NOT FOUND');
  test('Cashier role found', !!cashierRole, cashierRole ? 'id=' + cashierRole.id : 'NOT FOUND');

  if (!captainRole || floors.length < 1) {
    console.log('Cannot proceed — missing captain role or floors');
    process.exit(1);
  }

  var floor1 = floors[0];
  var floor2 = floors.length > 1 ? floors[1] : null;
  var ts = Date.now();

  // =============================================
  section('1. Create captain with floor assignment');
  // =============================================
  var captainData = {
    name: 'Test Captain Floor ' + ts,
    email: 'testcaptain' + ts + '@test.com',
    employeeCode: 'TC' + String(ts).slice(-4),
    password: 'Captain@123',
    pin: '1111',
    isActive: true,
    roles: [{ roleId: captainRole.id, outletId: OUTLET_ID }],
    floors: [{ floorId: floor1.id, outletId: OUTLET_ID, isPrimary: true }]
  };

  var createRes = await api.post('/users', captainData);
  test('Create captain: success', createRes.data.success, createRes.data.message);

  var captainUser = createRes.data.data;
  if (captainUser) {
    createdUserIds.push(captainUser.id);
    test('Response has assignedFloors', Array.isArray(captainUser.assignedFloors));
    test('assignedFloors length = 1', captainUser.assignedFloors && captainUser.assignedFloors.length === 1,
      'length=' + (captainUser.assignedFloors ? captainUser.assignedFloors.length : 0));
    if (captainUser.assignedFloors && captainUser.assignedFloors.length > 0) {
      var af = captainUser.assignedFloors[0];
      test('Floor ID matches', af.floorId === floor1.id, 'expected=' + floor1.id + ' got=' + af.floorId);
      test('Floor name present', !!af.floorName);
      test('isPrimary = true', af.isPrimary === true);
      test('outletId matches', af.outletId === OUTLET_ID);
    }
  }

  // Verify in DB
  var dbFloors = await pool.query('SELECT * FROM user_floors WHERE user_id = ?', [captainUser.id]);
  test('DB: user_floors row exists', dbFloors[0].length === 1);
  test('DB: floor_id matches', dbFloors[0].length > 0 && dbFloors[0][0].floor_id === floor1.id);
  test('DB: is_primary = 1', dbFloors[0].length > 0 && dbFloors[0][0].is_primary === 1);

  // =============================================
  section('2. Login with PIN — captain should get assignedFloors');
  // =============================================
  var pinLoginRes = await axios.post(BASE + '/auth/login/pin', {
    employeeCode: captainData.employeeCode,
    pin: captainData.pin,
    outletId: OUTLET_ID
  });
  test('PIN login: success', pinLoginRes.data.success);
  var pinUser = pinLoginRes.data.data.user;
  test('PIN login: has assignedFloors', Array.isArray(pinUser.assignedFloors));
  test('PIN login: assignedFloors length = 1', pinUser.assignedFloors && pinUser.assignedFloors.length === 1,
    'length=' + (pinUser.assignedFloors ? pinUser.assignedFloors.length : 0));
  if (pinUser.assignedFloors && pinUser.assignedFloors.length > 0) {
    test('PIN login: floor ID matches', pinUser.assignedFloors[0].floorId === floor1.id);
    test('PIN login: floorName present', !!pinUser.assignedFloors[0].floorName);
    test('PIN login: isPrimary true', pinUser.assignedFloors[0].isPrimary === true);
  }
  var captainToken = pinLoginRes.data.data.accessToken;

  // =============================================
  section('3. Login with email — captain should get assignedFloors');
  // =============================================
  var emailLoginRes = await axios.post(BASE + '/auth/login', {
    email: captainData.email,
    password: captainData.password
  });
  test('Email login: success', emailLoginRes.data.success);
  var emailUser = emailLoginRes.data.data.user;
  test('Email login: has assignedFloors', Array.isArray(emailUser.assignedFloors));
  test('Email login: assignedFloors length = 1', emailUser.assignedFloors && emailUser.assignedFloors.length === 1);

  // =============================================
  section('4. /auth/me — captain should get assignedFloors');
  // =============================================
  var captainApi = axios.create({ baseURL: BASE, headers: { Authorization: 'Bearer ' + captainToken } });
  var meRes = await captainApi.get('/auth/me');
  test('Me API: success', meRes.data.success);
  var meUser = meRes.data.data;
  test('Me API: has assignedFloors', Array.isArray(meUser.assignedFloors));
  test('Me API: assignedFloors length = 1', meUser.assignedFloors && meUser.assignedFloors.length === 1,
    'length=' + (meUser.assignedFloors ? meUser.assignedFloors.length : 0));
  if (meUser.assignedFloors && meUser.assignedFloors.length > 0) {
    test('Me API: floor ID matches', meUser.assignedFloors[0].floorId === floor1.id);
    test('Me API: floorName present', !!meUser.assignedFloors[0].floorName);
    test('Me API: isPrimary true', meUser.assignedFloors[0].isPrimary === true);
  }

  // =============================================
  section('5. Create captain with NO floor assignment');
  // =============================================
  var captainData2 = {
    name: 'Test Captain NoFloor ' + ts,
    email: 'testcaptain2_' + ts + '@test.com',
    employeeCode: 'TN' + String(ts).slice(-4),
    password: 'Captain@123',
    pin: '2222',
    isActive: true,
    roles: [{ roleId: captainRole.id, outletId: OUTLET_ID }]
  };
  var createRes2 = await api.post('/users', captainData2);
  test('Create captain without floors: success', createRes2.data.success);
  var captain2 = createRes2.data.data;
  if (captain2) {
    createdUserIds.push(captain2.id);
    test('No-floor captain: assignedFloors is empty array', 
      Array.isArray(captain2.assignedFloors) && captain2.assignedFloors.length === 0);
  }

  // PIN login for no-floor captain
  var pinLogin2 = await axios.post(BASE + '/auth/login/pin', {
    employeeCode: captainData2.employeeCode,
    pin: captainData2.pin,
    outletId: OUTLET_ID
  });
  test('No-floor captain login: assignedFloors empty', 
    Array.isArray(pinLogin2.data.data.user.assignedFloors) && pinLogin2.data.data.user.assignedFloors.length === 0);

  // =============================================
  section('6. Create captain with MULTIPLE floor assignments');
  // =============================================
  if (floor2) {
    var captainData3 = {
      name: 'Test Captain MultiFloor ' + ts,
      email: 'testcaptain3_' + ts + '@test.com',
      employeeCode: 'TM' + String(ts).slice(-4),
      password: 'Captain@123',
      pin: '3333',
      isActive: true,
      roles: [{ roleId: captainRole.id, outletId: OUTLET_ID }],
      floors: [
        { floorId: floor1.id, outletId: OUTLET_ID, isPrimary: true },
        { floorId: floor2.id, outletId: OUTLET_ID, isPrimary: false }
      ]
    };
    var createRes3 = await api.post('/users', captainData3);
    test('Create multi-floor captain: success', createRes3.data.success);
    var captain3 = createRes3.data.data;
    if (captain3) {
      createdUserIds.push(captain3.id);
      test('Multi-floor: assignedFloors length = 2', captain3.assignedFloors && captain3.assignedFloors.length === 2);
      var primary = captain3.assignedFloors.find(function(f) { return f.isPrimary; });
      test('Multi-floor: primary floor is floor1', primary && primary.floorId === floor1.id);

      // DB verify
      var dbMF = await pool.query('SELECT * FROM user_floors WHERE user_id = ? ORDER BY is_primary DESC', [captain3.id]);
      test('DB: 2 floor rows', dbMF[0].length === 2);
    }

    // Login should show both floors
    var pinLogin3 = await axios.post(BASE + '/auth/login/pin', {
      employeeCode: captainData3.employeeCode,
      pin: captainData3.pin,
      outletId: OUTLET_ID
    });
    test('Multi-floor login: 2 assignedFloors', 
      pinLogin3.data.data.user.assignedFloors && pinLogin3.data.data.user.assignedFloors.length === 2);
  } else {
    console.log('   (Skipping multi-floor test — only 1 floor available)');
  }

  // =============================================
  section('7. Create cashier with floor assignment');
  // =============================================
  if (cashierRole) {
    var cashierData = {
      name: 'Test Cashier Floor ' + ts,
      email: 'testcashier' + ts + '@test.com',
      employeeCode: 'CS' + String(ts).slice(-4),
      password: 'Cashier@123',
      pin: '4444',
      isActive: true,
      roles: [{ roleId: cashierRole.id, outletId: OUTLET_ID }],
      floors: [{ floorId: floor1.id, outletId: OUTLET_ID, isPrimary: true }]
    };
    var cashierCreateRes = await api.post('/users', cashierData);
    test('Create cashier with floor: success', cashierCreateRes.data.success);
    var cashierUser2 = cashierCreateRes.data.data;
    if (cashierUser2) {
      createdUserIds.push(cashierUser2.id);
      test('Cashier: assignedFloors length = 1', cashierUser2.assignedFloors && cashierUser2.assignedFloors.length === 1);

      // Cashier PIN login
      var cashierLogin = await axios.post(BASE + '/auth/login/pin', {
        employeeCode: cashierData.employeeCode,
        pin: cashierData.pin,
        outletId: OUTLET_ID
      });
      test('Cashier login: assignedFloors present', 
        Array.isArray(cashierLogin.data.data.user.assignedFloors) && cashierLogin.data.data.user.assignedFloors.length === 1);
      test('Cashier login: floor matches', 
        cashierLogin.data.data.user.assignedFloors[0].floorId === floor1.id);
    }
  }

  // =============================================
  section('8. Update user — change floor assignments');
  // =============================================
  if (floor2 && captainUser) {
    var updateRes = await api.put('/users/' + captainUser.id, {
      floors: [{ floorId: floor2.id, outletId: OUTLET_ID, isPrimary: true }]
    });
    test('Update floors: success', updateRes.data.success);
    var updatedUser = updateRes.data.data;
    test('Updated: assignedFloors length = 1', updatedUser.assignedFloors && updatedUser.assignedFloors.length === 1);
    test('Updated: floor changed to floor2', 
      updatedUser.assignedFloors && updatedUser.assignedFloors[0].floorId === floor2.id,
      'expected=' + floor2.id + ' got=' + (updatedUser.assignedFloors && updatedUser.assignedFloors[0] ? updatedUser.assignedFloors[0].floorId : 'none'));

    // DB verify
    var dbUpdated = await pool.query('SELECT * FROM user_floors WHERE user_id = ?', [captainUser.id]);
    test('DB: only 1 floor row after update', dbUpdated[0].length === 1);
    test('DB: floor_id = floor2', dbUpdated[0][0].floor_id === floor2.id);
  }

  // =============================================
  section('9. Update user — remove all floor assignments');
  // =============================================
  if (captainUser) {
    var removeRes = await api.put('/users/' + captainUser.id, { floors: [] });
    test('Remove floors: success', removeRes.data.success);
    var removedUser = removeRes.data.data;
    test('Removed: assignedFloors empty', 
      Array.isArray(removedUser.assignedFloors) && removedUser.assignedFloors.length === 0);

    var dbRemoved = await pool.query('SELECT * FROM user_floors WHERE user_id = ?', [captainUser.id]);
    test('DB: 0 floor rows after removal', dbRemoved[0].length === 0);
  }

  // =============================================
  section('10. Admin login — assignedFloors should be empty (admin has all floors)');
  // =============================================
  test('Admin login: has assignedFloors key', login.data.data.user.assignedFloors !== undefined);
  test('Admin login: assignedFloors empty (no restriction)', 
    Array.isArray(login.data.data.user.assignedFloors) && login.data.data.user.assignedFloors.length === 0);

  // =============================================
  section('11. Get user by ID — includes assignedFloors');
  // =============================================
  if (createdUserIds.length > 0) {
    // Use one of the captains with floor assignment (captain3 if available, else re-assign first)
    var testUserId = createdUserIds[0];
    // Re-assign a floor first
    await api.put('/users/' + testUserId, { floors: [{ floorId: floor1.id, outletId: OUTLET_ID, isPrimary: true }] });
    var getUserRes = await api.get('/users/' + testUserId);
    test('getUserById: success', getUserRes.data.success);
    test('getUserById: has assignedFloors', Array.isArray(getUserRes.data.data.assignedFloors));
    test('getUserById: assignedFloors length = 1', getUserRes.data.data.assignedFloors.length === 1);
  }

  // Cleanup — delete test users
  section('Cleanup');
  for (var i = 0; i < createdUserIds.length; i++) {
    try {
      await api.delete('/users/' + createdUserIds[i]);
      console.log('   Deleted user ' + createdUserIds[i]);
    } catch (e) {
      console.log('   Failed to delete user ' + createdUserIds[i] + ': ' + e.message);
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
