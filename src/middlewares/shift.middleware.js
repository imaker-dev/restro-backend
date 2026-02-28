/**
 * Shift Validation Middleware
 * Validates that floor shift is open before allowing floor operations
 */

const { getPool } = require('../database');
const logger = require('../utils/logger');

/**
 * Get user's assigned floor IDs
 */
async function getUserFloorIds(userId, outletId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT floor_id FROM user_floors WHERE user_id = ? AND outlet_id = ? AND is_active = 1',
    [userId, outletId]
  );
  return rows.map(r => r.floor_id);
}

/**
 * Check if shift is open for a specific floor
 */
async function isShiftOpenForFloor(outletId, floorId) {
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);

  const [session] = await pool.query(
    `SELECT id, status, cashier_id FROM day_sessions 
     WHERE outlet_id = ? AND floor_id = ? AND session_date = ? AND status = 'open'`,
    [outletId, floorId, today]
  );

  return {
    isOpen: !!session[0],
    shiftId: session[0]?.id || null,
    cashierId: session[0]?.cashier_id || null
  };
}

/**
 * Get floor ID from table ID
 */
async function getFloorIdFromTable(tableId) {
  const pool = getPool();
  const [tables] = await pool.query(
    'SELECT floor_id FROM tables WHERE id = ?',
    [tableId]
  );
  return tables[0]?.floor_id || null;
}

/**
 * Middleware: Validate shift is open for table's floor
 * Use this for: table session start, order creation, KOT generation
 */
const validateTableFloorShift = async (req, res, next) => {
  try {
    const tableId = req.body.tableId || req.params.tableId;
    const outletId = req.body.outletId || req.params.outletId;

    if (!tableId) {
      return next(); // Skip validation for non-table orders (takeaway)
    }

    const floorId = await getFloorIdFromTable(tableId);
    if (!floorId) {
      return next(); // Skip if table has no floor assigned
    }

    const shiftStatus = await isShiftOpenForFloor(outletId, floorId);
    
    if (!shiftStatus.isOpen) {
      const pool = getPool();
      const [floor] = await pool.query('SELECT name FROM floors WHERE id = ?', [floorId]);
      const floorName = floor[0]?.name || `Floor ${floorId}`;
      
      return res.status(403).json({
        success: false,
        message: `Shift not opened for ${floorName}. Please ask the assigned cashier to open the shift first.`,
        code: 'SHIFT_NOT_OPEN',
        floorId,
        floorName
      });
    }

    // Attach shift info to request for downstream use
    req.floorShift = {
      floorId,
      shiftId: shiftStatus.shiftId,
      cashierId: shiftStatus.cashierId
    };

    next();
  } catch (error) {
    logger.error('Shift validation error:', error);
    next(error);
  }
};

/**
 * Middleware: Validate shift is open for user's assigned floor
 * Use this for: cashier operations that need shift to be open
 */
const validateUserFloorShift = async (req, res, next) => {
  try {
    const outletId = req.body.outletId || req.params.outletId;
    const userId = req.user.userId;

    const userFloorIds = await getUserFloorIds(userId, outletId);
    
    if (userFloorIds.length === 0) {
      return next(); // User has no floor assignment, skip validation
    }

    // Check if any of user's assigned floors have open shift
    let hasOpenShift = false;
    let openFloorId = null;

    for (const floorId of userFloorIds) {
      const shiftStatus = await isShiftOpenForFloor(outletId, floorId);
      if (shiftStatus.isOpen) {
        hasOpenShift = true;
        openFloorId = floorId;
        req.floorShift = {
          floorId,
          shiftId: shiftStatus.shiftId,
          cashierId: shiftStatus.cashierId
        };
        break;
      }
    }

    if (!hasOpenShift) {
      return res.status(403).json({
        success: false,
        message: 'Shift not opened for your assigned floor. Please open shift first.',
        code: 'SHIFT_NOT_OPEN',
        userFloorIds
      });
    }

    next();
  } catch (error) {
    logger.error('User floor shift validation error:', error);
    next(error);
  }
};

/**
 * Middleware: Validate shift for billing operations
 * Bills should go to the floor's assigned cashier
 */
const validateBillingFloorShift = async (req, res, next) => {
  try {
    const orderId = req.body.orderId || req.params.orderId;
    const outletId = req.body.outletId || req.params.outletId;

    if (!orderId) {
      return next();
    }

    const pool = getPool();
    
    // Get order's table and floor
    const [orders] = await pool.query(
      `SELECT o.id, o.table_id, t.floor_id, f.name as floor_name
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN floors f ON t.floor_id = f.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!orders[0] || !orders[0].floor_id) {
      return next(); // Skip for non-table orders
    }

    const floorId = orders[0].floor_id;
    const floorName = orders[0].floor_name;

    const shiftStatus = await isShiftOpenForFloor(outletId, floorId);
    
    if (!shiftStatus.isOpen) {
      return res.status(403).json({
        success: false,
        message: `Shift not opened for ${floorName}. Cannot process billing.`,
        code: 'SHIFT_NOT_OPEN',
        floorId,
        floorName
      });
    }

    // Attach floor shift info for billing routing
    req.floorShift = {
      floorId,
      floorName,
      shiftId: shiftStatus.shiftId,
      cashierId: shiftStatus.cashierId
    };

    next();
  } catch (error) {
    logger.error('Billing floor shift validation error:', error);
    next(error);
  }
};

/**
 * Get floor cashier for bill routing
 */
async function getFloorCashierForBilling(outletId, floorId) {
  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);

  // First try to get cashier from active shift
  const [session] = await pool.query(
    `SELECT ds.cashier_id, u.name as cashier_name
     FROM day_sessions ds
     LEFT JOIN users u ON ds.cashier_id = u.id
     WHERE ds.outlet_id = ? AND ds.floor_id = ? AND ds.session_date = ? AND ds.status = 'open'`,
    [outletId, floorId, today]
  );

  if (session[0]?.cashier_id) {
    return {
      cashierId: session[0].cashier_id,
      cashierName: session[0].cashier_name
    };
  }

  // Fallback: get primary cashier assigned to this floor
  const [cashiers] = await pool.query(
    `SELECT u.id, u.name
     FROM users u
     JOIN user_floors uf ON u.id = uf.user_id
     JOIN user_roles ur ON u.id = ur.user_id AND ur.outlet_id = uf.outlet_id
     JOIN roles r ON ur.role_id = r.id
     WHERE uf.floor_id = ? AND uf.outlet_id = ? AND uf.is_active = 1
     AND r.slug = 'cashier' AND ur.is_active = 1
     ORDER BY uf.is_primary DESC LIMIT 1`,
    [floorId, outletId]
  );

  return cashiers[0] ? {
    cashierId: cashiers[0].id,
    cashierName: cashiers[0].name
  } : null;
}

module.exports = {
  validateTableFloorShift,
  validateUserFloorShift,
  validateBillingFloorShift,
  isShiftOpenForFloor,
  getFloorIdFromTable,
  getUserFloorIds,
  getFloorCashierForBilling
};
