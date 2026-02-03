const { Server } = require('socket.io');
const corsConfig = require('./cors.config');
const logger = require('../utils/logger');
const { pubsub } = require('./redis');

let io = null;

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: corsConfig,
    pingInterval: parseInt(process.env.WS_PING_INTERVAL, 10) || 25000,
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT, 10) || 60000,
    transports: ['websocket', 'polling'],
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Join outlet room
    socket.on('join:outlet', (outletId) => {
      socket.join(`outlet:${outletId}`);
      logger.debug(`Socket ${socket.id} joined outlet:${outletId}`);
    });

    // Join floor room
    socket.on('join:floor', ({ outletId, floorId }) => {
      socket.join(`floor:${outletId}:${floorId}`);
      logger.debug(`Socket ${socket.id} joined floor:${outletId}:${floorId}`);
    });

    // Join kitchen room
    socket.on('join:kitchen', (outletId) => {
      socket.join(`kitchen:${outletId}`);
      logger.debug(`Socket ${socket.id} joined kitchen:${outletId}`);
    });

    // Leave rooms
    socket.on('leave:outlet', (outletId) => {
      socket.leave(`outlet:${outletId}`);
    });

    socket.on('leave:floor', ({ outletId, floorId }) => {
      socket.leave(`floor:${outletId}:${floorId}`);
    });

    socket.on('leave:kitchen', (outletId) => {
      socket.leave(`kitchen:${outletId}`);
    });

    // Disconnect handler
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error(`Socket error: ${socket.id}`, error);
    });
  });

  // Subscribe to Redis channels for cross-worker communication
  setupRedisPubSub();

  return io;
};

const setupRedisPubSub = () => {
  // Table updates
  pubsub.subscribe('table:update', (data) => {
    io.to(`floor:${data.outletId}:${data.floorId}`).emit('table:updated', data);
  });

  // Order updates
  pubsub.subscribe('order:update', (data) => {
    io.to(`outlet:${data.outletId}`).emit('order:updated', data);
  });

  // KOT updates
  pubsub.subscribe('kot:update', (data) => {
    io.to(`kitchen:${data.outletId}`).emit('kot:updated', data);
  });

  // Payment updates
  pubsub.subscribe('payment:update', (data) => {
    io.to(`outlet:${data.outletId}`).emit('payment:updated', data);
  });

  // Notification
  pubsub.subscribe('notification', (data) => {
    io.to(`outlet:${data.outletId}`).emit('notification', data);
  });
};

const getSocketIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

// Emit helpers
const emit = {
  toOutlet(outletId, event, data) {
    pubsub.publish(event.split(':')[0] + ':update', { outletId, ...data });
  },

  toFloor(outletId, floorId, event, data) {
    pubsub.publish('table:update', { outletId, floorId, ...data });
  },

  toKitchen(outletId, event, data) {
    pubsub.publish('kot:update', { outletId, ...data });
  },

  notification(outletId, message, type = 'info') {
    pubsub.publish('notification', { outletId, message, type, timestamp: new Date() });
  },
};

module.exports = {
  initializeSocket,
  getSocketIO,
  emit,
};
