const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const corsConfig = require('./cors.config');
const redisConfig = require('./redis.config');
const logger = require('../utils/logger');
const { pubsub, isRedisAvailable } = require('./redis');

let io = null;

const initializeSocket = (server) => {
  // Build Socket.IO CORS: allow mobile apps (no Origin header) + web origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const socketCors = {
    ...corsConfig,
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server, curl)
      if (!origin) return callback(null, true);
      // In development, allow all
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      // In production, check against allowed origins
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logger.warn(`Socket.IO CORS rejected origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
  };

  io = new Server(server, {
    cors: socketCors,
    pingInterval: parseInt(process.env.WS_PING_INTERVAL, 10) || 25000,
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT, 10) || 60000,
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    path: process.env.SOCKET_PATH || '/socket.io/',
  });

  // Attach Redis adapter for PM2 cluster mode session sharing
  if (isRedisAvailable()) {
    try {
      const pubClient = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
      });
      const subClient = pubClient.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis adapter attached (cluster-safe)');
    } catch (err) {
      logger.warn('Socket.IO Redis adapter setup failed, cluster sync disabled:', err.message);
    }
  }

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

    // Join bar room
    socket.on('join:bar', (outletId) => {
      socket.join(`bar:${outletId}`);
      logger.debug(`Socket ${socket.id} joined bar:${outletId}`);
    });

    // Join station room (kitchen, bar, mocktail, dessert)
    socket.on('join:station', ({ outletId, station }) => {
      socket.join(`station:${outletId}:${station}`);
      logger.debug(`Socket ${socket.id} joined station:${outletId}:${station}`);
    });

    // Join cashier room
    socket.on('join:cashier', (outletId) => {
      socket.join(`cashier:${outletId}`);
      logger.debug(`Socket ${socket.id} joined cashier:${outletId}`);
    });

    // Join captain room (for order updates)
    socket.on('join:captain', (outletId) => {
      socket.join(`captain:${outletId}`);
      logger.debug(`Socket ${socket.id} joined captain:${outletId}`);
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

  // Subscribe to Redis channels for cross-worker communication (if Redis available)
  if (isRedisAvailable()) {
    setupRedisPubSub();
  } else {
    logger.warn('Socket.IO running without Redis pub/sub - multi-instance sync disabled');
  }

  return io;
};

const setupRedisPubSub = () => {
  if (!isRedisAvailable()) return;
  // Table updates
  pubsub.subscribe('table:update', (data) => {
    io.to(`floor:${data.outletId}:${data.floorId}`).emit('table:updated', data);
    io.to(`outlet:${data.outletId}`).emit('table:updated', data);
  });

  // Order updates - broadcast to outlet, captain, and cashier
  pubsub.subscribe('order:update', (data) => {
    io.to(`outlet:${data.outletId}`).emit('order:updated', data);
    io.to(`captain:${data.outletId}`).emit('order:updated', data);
    io.to(`cashier:${data.outletId}`).emit('order:updated', data);
  });

  // KOT updates - route to kitchen, captain, and cashier
  pubsub.subscribe('kot:update', (data) => {
    // Send to general kitchen room
    io.to(`kitchen:${data.outletId}`).emit('kot:updated', data);
    
    // Send to specific station room
    if (data.station) {
      io.to(`station:${data.outletId}:${data.station}`).emit('kot:updated', data);
      
      // Also send to bar room if bar station
      if (data.station === 'bar') {
        io.to(`bar:${data.outletId}`).emit('kot:updated', data);
      }
    }
    
    // Send ALL KOT status updates to captain and cashier for real-time tracking
    io.to(`captain:${data.outletId}`).emit('kot:updated', data);
    io.to(`cashier:${data.outletId}`).emit('kot:updated', data);

    // Keep backward-compatible item:ready event for captain
    if (data.type === 'kot:item_ready' || data.type === 'kot:ready') {
      io.to(`captain:${data.outletId}`).emit('item:ready', data);
    }
  });

  // Bill status updates - send to captain and cashier
  pubsub.subscribe('bill:status', (data) => {
    io.to(`captain:${data.outletId}`).emit('bill:status', data);
    io.to(`cashier:${data.outletId}`).emit('bill:status', data);
    io.to(`outlet:${data.outletId}`).emit('bill:status', data);
  });

  // Payment updates - send to cashier and outlet
  pubsub.subscribe('payment:update', (data) => {
    io.to(`cashier:${data.outletId}`).emit('payment:updated', data);
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
