const userService = require('../services/user.service');
const logger = require('../utils/logger');

/**
 * GET /api/v1/users
 * Get all users with pagination and filters
 */
const getUsers = async (req, res, next) => {
  try {
    const result = await userService.getUsers(req.query);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Get users failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/users/:id
 * Get single user by ID
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(parseInt(req.params.id, 10));

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    logger.error('Get user failed:', error);
    next(error);
  }
};

/**
 * POST /api/v1/users
 * Create new user
 */
const createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body, req.user.userId);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user,
    });
  } catch (error) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    logger.error('Create user failed:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/users/:id
 * Update user
 */
const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(
      parseInt(req.params.id, 10),
      req.body,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    logger.error('Update user failed:', error);
    next(error);
  }
};

/**
 * DELETE /api/v1/users/:id
 * Delete user (soft delete)
 */
const deleteUser = async (req, res, next) => {
  try {
    const result = await userService.deleteUser(
      parseInt(req.params.id, 10),
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    if (error.message.includes('Cannot delete')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    logger.error('Delete user failed:', error);
    next(error);
  }
};

/**
 * POST /api/v1/users/:id/roles
 * Assign role to user
 */
const assignRole = async (req, res, next) => {
  try {
    const { roleId, outletId } = req.body;
    const user = await userService.assignRole(
      parseInt(req.params.id, 10),
      roleId,
      outletId || null,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'Role assigned successfully',
      data: user,
    });
  } catch (error) {
    if (error.message === 'Role already assigned') {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    logger.error('Assign role failed:', error);
    next(error);
  }
};

/**
 * DELETE /api/v1/users/:id/roles
 * Remove role from user
 */
const removeRole = async (req, res, next) => {
  try {
    const { roleId, outletId } = req.body;
    const user = await userService.removeRole(
      parseInt(req.params.id, 10),
      roleId,
      outletId || null,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'Role removed successfully',
      data: user,
    });
  } catch (error) {
    if (error.message === 'Role assignment not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    logger.error('Remove role failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/users/roles
 * Get all available roles
 */
const getRoles = async (req, res, next) => {
  try {
    const roles = await userService.getRoles();

    res.status(200).json({
      success: true,
      data: roles,
    });
  } catch (error) {
    logger.error('Get roles failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/users/roles/:id
 * Get role with permissions
 */
const getRoleById = async (req, res, next) => {
  try {
    const role = await userService.getRoleById(parseInt(req.params.id, 10));

    res.status(200).json({
      success: true,
      data: role,
    });
  } catch (error) {
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }
    logger.error('Get role failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/users/permissions
 * Get all permissions grouped by module
 */
const getPermissions = async (req, res, next) => {
  try {
    const permissions = await userService.getPermissions();

    res.status(200).json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    logger.error('Get permissions failed:', error);
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  assignRole,
  removeRole,
  getRoles,
  getRoleById,
  getPermissions,
};
