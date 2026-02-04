const { Queue } = require('bullmq');
const redisConfig = require('../config/redis.config');
const { QUEUE_NAMES } = require('../constants');
const logger = require('../utils/logger');
const { isRedisAvailable } = require('../config/redis');

const queues = {};
let queuesInitialized = false;

const redisConnection = {
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password || undefined,
};

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600,
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600,
  },
};

const initializeQueues = async () => {
  // Skip queue initialization if Redis is not available
  if (!isRedisAvailable()) {
    logger.warn('Queues disabled - Redis not available');
    logger.warn('Background jobs (printing, notifications, reports) will not work');
    return queues;
  }

  try {
    const queueNames = Object.values(QUEUE_NAMES);

    for (const name of queueNames) {
      queues[name] = new Queue(name, {
        connection: redisConnection,
        prefix: process.env.QUEUE_PREFIX || 'restro-pos',
        defaultJobOptions,
      });

      queues[name].on('error', (error) => {
        logger.error(`Queue ${name} error:`, error);
      });
    }

    queuesInitialized = true;
    logger.info(`Initialized ${queueNames.length} queues`);
    return queues;
  } catch (error) {
    logger.warn('Failed to initialize queues:', error.message);
    return queues;
  }
};

const getQueue = (name) => {
  if (!queuesInitialized || !queues[name]) {
    return null;
  }
  return queues[name];
};

const addJob = async (queueName, jobName, data, options = {}) => {
  const queue = getQueue(queueName);
  if (!queue) {
    logger.warn(`Cannot add job ${jobName} - queue ${queueName} not available`);
    return null;
  }
  const job = await queue.add(jobName, data, {
    ...defaultJobOptions,
    ...options,
  });
  logger.debug(`Added job ${jobName} to queue ${queueName}, jobId: ${job.id}`);
  return job;
};

const addBulkJobs = async (queueName, jobs) => {
  const queue = getQueue(queueName);
  if (!queue) {
    logger.warn(`Cannot add bulk jobs - queue ${queueName} not available`);
    return [];
  }
  const result = await queue.addBulk(
    jobs.map((job) => ({
      name: job.name,
      data: job.data,
      opts: { ...defaultJobOptions, ...job.options },
    }))
  );
  logger.debug(`Added ${result.length} jobs to queue ${queueName}`);
  return result;
};

const closeQueues = async () => {
  for (const [name, queue] of Object.entries(queues)) {
    await queue.close();
    logger.info(`Queue ${name} closed`);
  }
};

module.exports = {
  initializeQueues,
  getQueue,
  addJob,
  addBulkJobs,
  closeQueues,
  queues,
};
