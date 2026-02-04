const authService = require('../services/auth.service');
const logger = require('../utils/logger');

/**
 * Extract device info from request
 */
const getDeviceInfo = (req) => ({
  ip: req.ip || req.connection?.remoteAddress,
  userAgent: req.get('User-Agent'),
  deviceId: req.body.deviceId || req.get('X-Device-ID'),
  deviceName: req.body.deviceName || req.get('X-Device-Name'),
  deviceType: req.body.deviceType || req.get('X-Device-Type') || 'other',
});

/**
 * POST /api/v1/auth/login
 * Login with email and password
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const deviceInfo = getDeviceInfo(req);

    const result = await authService.loginWithEmail(email, password, deviceInfo);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    logger.warn('Login failed:', error.message);
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/v1/auth/login/pin
 * Login with employee code and PIN
 */
const loginWithPin = async (req, res, next) => {
  try {
    const { employeeCode, pin, outletId } = req.body;
    const deviceInfo = { ...getDeviceInfo(req), outletId };

    const result = await authService.loginWithPin(employeeCode, pin, outletId, deviceInfo);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  } catch (error) {
    logger.warn('PIN login failed:', error.message);
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const deviceInfo = getDeviceInfo(req);

    const result = await authService.refreshToken(refreshToken, deviceInfo);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: result,
    });
  } catch (error) {
    logger.warn('Token refresh failed:', error.message);
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * POST /api/v1/auth/logout
 * Logout current session
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const deviceInfo = getDeviceInfo(req);

    const result = await authService.logout(req.user.userId, refreshToken, deviceInfo);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.error('Logout failed:', error);
    next(error);
  }
};

/**
 * POST /api/v1/auth/logout/all
 * Logout from all devices
 */
const logoutAll = async (req, res, next) => {
  try {
    const deviceInfo = getDeviceInfo(req);

    const result = await authService.logoutAll(req.user.userId, deviceInfo);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.error('Logout all failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/auth/me
 * Get current user profile with permissions
 */
const getCurrentUser = async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.userId);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error('Get current user failed:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/auth/password
 * Change password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const deviceInfo = getDeviceInfo(req);

    const result = await authService.changePassword(
      req.user.userId,
      currentPassword,
      newPassword,
      deviceInfo
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.warn('Change password failed:', error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * PUT /api/v1/auth/pin
 * Change PIN
 */
const changePin = async (req, res, next) => {
  try {
    const { currentPin, newPin } = req.body;
    const deviceInfo = getDeviceInfo(req);

    const result = await authService.changePin(
      req.user.userId,
      currentPin,
      newPin,
      deviceInfo
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.warn('Change PIN failed:', error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/v1/auth/sessions
 * Get active sessions
 */
const getSessions = async (req, res, next) => {
  try {
    const sessions = await authService.getActiveSessions(req.user.userId);

    res.status(200).json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    logger.error('Get sessions failed:', error);
    next(error);
  }
};

/**
 * DELETE /api/v1/auth/sessions/:sessionId
 * Revoke specific session
 */
const revokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const deviceInfo = getDeviceInfo(req);

    const result = await authService.revokeSession(
      req.user.userId,
      parseInt(sessionId, 10),
      deviceInfo
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.warn('Revoke session failed:', error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  login,
  loginWithPin,
  refreshToken,
  logout,
  logoutAll,
  getCurrentUser,
  changePassword,
  changePin,
  getSessions,
  revokeSession,
};
