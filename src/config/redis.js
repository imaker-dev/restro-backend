const Redis = require('ioredis');
const redisConfig = require('./redis.config');
const logger = require('../utils/logger');

let redisClient = null;
let redisSubscriber = null;
let redisAvailable = false;

const createRedisClient = (options = {}) => {
  const client = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
    keyPrefix: redisConfig.keyPrefix,
    retryStrategy: (times) => {
      if (times > redisConfig.maxRetries) {
        logger.error('Redis max retries reached');
        return null;
      }
      return Math.min(times * redisConfig.retryDelayMs, 3000);
    },
    ...options,
  });

  client.on('error', (err) => {
    logger.error('Redis error:', err);
  });

  client.on('connect', () => {
    logger.info('Redis connected');
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return client;
};

const initializeRedis = async () => {
  try {
    redisClient = createRedisClient();
    redisSubscriber = createRedisClient({ keyPrefix: '' });

    await redisClient.ping();
    redisAvailable = true;
    return { redisClient, redisSubscriber, available: true };
  } catch (error) {
    logger.warn('Redis not available - running without cache/pubsub features');
    logger.warn('To enable Redis, run: docker-compose -f docker-compose.dev.yml up -d redis');
    redisAvailable = false;
    return { redisClient: null, redisSubscriber: null, available: false };
  }
};

const isRedisAvailable = () => redisAvailable;

const getRedisClient = () => {
  if (!redisClient || !redisAvailable) {
    return null;
  }
  return redisClient;
};

const getRedisSubscriber = () => {
  if (!redisSubscriber || !redisAvailable) {
    return null;
  }
  return redisSubscriber;
};

// Cache helpers (gracefully handle when Redis is not available)
const cache = {
  async get(key) {
    if (!redisAvailable || !redisClient) return null;
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.warn('Cache get failed:', error.message);
      return null;
    }
  },

  async set(key, value, ttlSeconds = 3600) {
    if (!redisAvailable || !redisClient) return;
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      logger.warn('Cache set failed:', error.message);
    }
  },

  async del(key) {
    if (!redisAvailable || !redisClient) return;
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.warn('Cache del failed:', error.message);
    }
  },

  async delPattern(pattern) {
    if (!redisAvailable || !redisClient) return;
    try {
      const keys = await redisClient.keys(`${redisConfig.keyPrefix}${pattern}`);
      if (keys.length > 0) {
        const pipeline = redisClient.pipeline();
        keys.forEach((key) => pipeline.del(key.replace(redisConfig.keyPrefix, '')));
        await pipeline.exec();
      }
    } catch (error) {
      logger.warn('Cache delPattern failed:', error.message);
    }
  },

  async flush() {
    if (!redisAvailable || !redisClient) return;
    try {
      await redisClient.flushdb();
    } catch (error) {
      logger.warn('Cache flush failed:', error.message);
    }
  },
};

// Pub/Sub helpers (gracefully handle when Redis is not available)
const pubsub = {
  async publish(channel, message) {
    if (!redisAvailable || !redisClient) return;
    try {
      await redisClient.publish(channel, JSON.stringify(message));
    } catch (error) {
      logger.warn('Pubsub publish failed:', error.message);
    }
  },

  subscribe(channel, callback) {
    if (!redisAvailable || !redisSubscriber) return;
    try {
      redisSubscriber.subscribe(channel);
      redisSubscriber.on('message', (ch, message) => {
        if (ch === channel) {
          callback(JSON.parse(message));
        }
      });
    } catch (error) {
      logger.warn('Pubsub subscribe failed:', error.message);
    }
  },

  unsubscribe(channel) {
    if (!redisAvailable || !redisSubscriber) return;
    try {
      redisSubscriber.unsubscribe(channel);
    } catch (error) {
      logger.warn('Pubsub unsubscribe failed:', error.message);
    }
  },
};

// Local Socket.IO emitter fallback (registered by socket.js after init)
let _localEmitter = null;
const registerLocalEmitter = (emitterFn) => {
  _localEmitter = emitterFn;
};

// Helper alias for services — falls back to local emit when Redis is down
const publishMessage = async (channel, message) => {
  if (redisAvailable && redisClient) {
    return pubsub.publish(channel, message);
  }
  // Redis unavailable — fallback to direct Socket.IO emission (same process only)
  if (_localEmitter) {
    const delivered = _localEmitter(channel, message);
    if (delivered) {
      logger.debug(`publishMessage: delivered '${channel}' via local emitter (Redis unavailable)`);
    }
    return;
  }
  logger.warn(`publishMessage: dropped '${channel}' — Redis unavailable and no local emitter registered`);
};

module.exports = {
  initializeRedis,
  getRedisClient,
  getRedisSubscriber,
  isRedisAvailable,
  cache,
  pubsub,
  publishMessage,
  registerLocalEmitter,
};
