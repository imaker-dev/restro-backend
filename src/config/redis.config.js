// Namespace isolates this backend instance's cache + pubsub from other backends
// sharing the same Redis. Set REDIS_NAMESPACE per environment (e.g. 'prod-a', 'prod-b').
// Falls back to a stable per-DB default so dev/prod don't accidentally share channels.
const namespace = (process.env.REDIS_NAMESPACE || process.env.NODE_ENV || 'default').trim();

const mainHost = process.env.REDIS_HOST || 'localhost';
const mainPort = parseInt(process.env.REDIS_PORT, 10) || 6379;
const mainPassword = process.env.REDIS_PASSWORD || undefined;

module.exports = {
  host: mainHost,
  port: mainPort,
  password: mainPassword,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  keyPrefix: `restro:${namespace}:`,
  pubsubNamespace: namespace,
  retryDelayMs: 100,
  maxRetries: 3,
  connectTimeout: 10000,
  lazyConnect: true,
  enableReadyCheck: true,
  enableOfflineQueue: true,

  // Separate Redis for BullMQ queues (should use noeviction to prevent job loss)
  // Falls back to main Redis if queue-specific env vars are not set.
  queueConnection: {
    host: process.env.REDIS_QUEUES_HOST || mainHost,
    port: parseInt(process.env.REDIS_QUEUES_PORT, 10) || mainPort,
    password: process.env.REDIS_QUEUES_PASSWORD || mainPassword,
    db: parseInt(process.env.REDIS_QUEUES_DB, 10) || 0,
  },
};
