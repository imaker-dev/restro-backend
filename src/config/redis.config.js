module.exports = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  keyPrefix: 'restro:',
  retryDelayMs: 100,
  maxRetries: 3,
  connectTimeout: 10000,
  lazyConnect: true,
  enableReadyCheck: true,
  enableOfflineQueue: true,
};
