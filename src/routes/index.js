const express = require('express');
const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes will be added here as modules are developed
// Example:
// router.use('/auth', require('./auth.routes'));
// router.use('/outlets', require('./outlet.routes'));
// router.use('/floors', require('./floor.routes'));
// router.use('/tables', require('./table.routes'));
// router.use('/categories', require('./category.routes'));
// router.use('/items', require('./item.routes'));
// router.use('/orders', require('./order.routes'));
// router.use('/kot', require('./kot.routes'));
// router.use('/payments', require('./payment.routes'));
// router.use('/inventory', require('./inventory.routes'));
// router.use('/reports', require('./report.routes'));
// router.use('/users', require('./user.routes'));
// router.use('/settings', require('./settings.routes'));

module.exports = router;
