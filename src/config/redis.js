const Redis = require('ioredis');
const redisConfig = require('./redis.config');
const logger = require('../utils/logger');

let redisClient = null;
let redisSubscriber = null;

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
  redisClient = createRedisClient();
  redisSubscriber = createRedisClient({ keyPrefix: '' });

  await redisClient.ping();
  return { redisClient, redisSubscriber };
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

const getRedisSubscriber = () => {
  if (!redisSubscriber) {
    throw new Error('Redis subscriber not initialized');
  }
  return redisSubscriber;
};

// Cache helpers
const cache = {
  async get(key) {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  },

  async set(key, value, ttlSeconds = 3600) {
    await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
  },

  async del(key) {
    await redisClient.del(key);
  },

  async delPattern(pattern) {
    const keys = await redisClient.keys(`${redisConfig.keyPrefix}${pattern}`);
    if (keys.length > 0) {
      const pipeline = redisClient.pipeline();
      keys.forEach((key) => pipeline.del(key.replace(redisConfig.keyPrefix, '')));
      await pipeline.exec();
    }
  },

  async flush() {
    await redisClient.flushdb();
  },
};

// Pub/Sub helpers
const pubsub = {
  async publish(channel, message) {
    await redisClient.publish(channel, JSON.stringify(message));
  },

  subscribe(channel, callback) {
    redisSubscriber.subscribe(channel);
    redisSubscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(JSON.parse(message));
      }
    });
  },

  unsubscribe(channel) {
    redisSubscriber.unsubscribe(channel);
  },
};

module.exports = {
  initializeRedis,
  getRedisClient,
  getRedisSubscriber,
  cache,
  pubsub,
};
