require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const http = require('http');


const config = require('./config');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./database');
const { initializeRedis } = require('./config/redis');
const { initializeSocket } = require('./config/socket');
const { initializeQueues } = require('./queues');
const { initializeCronJobs } = require('./cron');

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors(config.cors));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (config.app.env !== 'test') {
  app.use(morgan('combined', { stream: logger.stream }));
}

// Serve uploaded files statically (with CORS headers)
const path = require('path');
app.use('/uploads', cors(config.cors), express.static(path.resolve(config.app.uploadPath || './uploads')));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
const routes = require('./routes');
app.use('/api/v1', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Resource not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.statusCode || 500).json({
    success: false,
    message: config.app.env === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(config.app.env !== 'production' && { stack: err.stack }),
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Initialize and start server
const startServer = async () => {
  try {
    // Initialize database connection
    await initializeDatabase();
    logger.info('Database connected successfully');

    // Initialize Redis (optional - app works without it)
    const redisResult = await initializeRedis();
    if (redisResult.available) {
      logger.info('Redis connected successfully');
    } else {
      logger.warn('Redis not available - caching and pub/sub disabled');
    }

    // Initialize WebSocket
    initializeSocket(server);
    logger.info('WebSocket initialized');

    // Initialize Queues
    await initializeQueues();
    logger.info('Queues initialized');

    // Initialize Cron Jobs
    if (config.app.enableCronJobs) {
      initializeCronJobs();
      logger.info('Cron jobs initialized');
    }

    // Start HTTP server
    server.listen(config.app.port, () => {
      logger.info(`Server running on port ${config.app.port} in ${config.app.env} mode`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server };
