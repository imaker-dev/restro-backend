const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares');
const authValidation = require('../validations/auth.validation');

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login with email and password
 * @access  Public
 */
router.post('/login', validate(authValidation.loginEmail), authController.login);

/**
 * @route   POST /api/v1/auth/login/pin
 * @desc    Login with employee code and PIN (for staff quick access)
 * @access  Public
 */
router.post('/login/pin', validate(authValidation.loginPin), authController.loginWithPin);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', validate(authValidation.refreshToken), authController.refreshToken);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current session
 * @access  Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route   POST /api/v1/auth/logout/all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout/all', authenticate, authController.logoutAll);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile with permissions
 * @access  Private
 */
router.get('/me', authenticate, authController.getCurrentUser);

/**
 * @route   PUT /api/v1/auth/password
 * @desc    Change password
 * @access  Private
 */
router.put('/password', authenticate, validate(authValidation.changePassword), authController.changePassword);

/**
 * @route   PUT /api/v1/auth/pin
 * @desc    Change PIN
 * @access  Private
 */
router.put('/pin', authenticate, validate(authValidation.changePin), authController.changePin);

/**
 * @route   GET /api/v1/auth/sessions
 * @desc    Get active sessions for current user
 * @access  Private
 */
router.get('/sessions', authenticate, authController.getSessions);

/**
 * @route   DELETE /api/v1/auth/sessions/:sessionId
 * @desc    Revoke specific session
 * @access  Private
 */
router.delete('/sessions/:sessionId', authenticate, authController.revokeSession);

module.exports = router;
