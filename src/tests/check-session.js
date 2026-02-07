require('dotenv').config();
const { initializeDatabase, getPool } = require('../database');

async function check() {
  await initializeDatabase();
  const pool = getPool();
  
  // Check active sessions on table 1
  const [sessions] = await pool.query(
    `SELECT ts.*, u.name as captain_name 
     FROM table_sessions ts 
     LEFT JOIN users u ON ts.started_by = u.id 
     WHERE ts.table_id = 1 AND ts.status = 'active'`
  );
  console.log('Active sessions on table 1:', JSON.stringify(sessions, null, 2));
  
  // Check roles for user 1 (admin)
  const [roles] = await pool.query(
    `SELECT ur.*, r.slug, r.name as role_name 
     FROM user_roles ur 
     JOIN roles r ON ur.role_id = r.id 
     WHERE ur.user_id = 1`
  );
  console.log('Roles for user 1 (admin):', JSON.stringify(roles, null, 2));
  
  // End any active session on table 1
  if (sessions.length > 0) {
    await pool.query(
      `UPDATE table_sessions SET status = 'completed', ended_at = NOW() WHERE table_id = 1 AND status = 'active'`
    );
    console.log('Ended active sessions on table 1');
  }
  
  // Reset table status
  await pool.query(`UPDATE tables SET status = 'available' WHERE id = 1`);
  console.log('Reset table 1 to available');
  
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
