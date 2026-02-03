const cron = require('node-cron');
const logger = require('../utils/logger');
const config = require('../config');
const { addJob } = require('../queues');
const { QUEUE_NAMES, REPORT_TYPE } = require('../constants');

const jobs = [];

const initializeCronJobs = () => {
  // Report aggregation - every 5 minutes
  const reportAggregation = cron.schedule(
    config.app.reportAggregationInterval,
    async () => {
      logger.info('Running report aggregation cron job');
      try {
        await addJob(QUEUE_NAMES.REPORT, 'aggregate-reports', {
          type: REPORT_TYPE.DAILY_SALES,
          dateRange: { start: new Date().toISOString().split('T')[0] },
        });
      } catch (error) {
        logger.error('Report aggregation cron failed:', error);
      }
    },
    { scheduled: false }
  );
  jobs.push(reportAggregation);

  // Daily cleanup - every day at 3 AM
  const dailyCleanup = cron.schedule(
    '0 3 * * *',
    async () => {
      logger.info('Running daily cleanup cron job');
      try {
        // Cleanup old sessions, logs, etc.
        await cleanupOldSessions();
        await cleanupOldLogs();
      } catch (error) {
        logger.error('Daily cleanup cron failed:', error);
      }
    },
    { scheduled: false }
  );
  jobs.push(dailyCleanup);

  // Hourly inventory check
  const inventoryCheck = cron.schedule(
    '0 * * * *',
    async () => {
      logger.info('Running inventory check cron job');
      try {
        await addJob(QUEUE_NAMES.INVENTORY, 'check-low-stock', {});
      } catch (error) {
        logger.error('Inventory check cron failed:', error);
      }
    },
    { scheduled: false }
  );
  jobs.push(inventoryCheck);

  // Start all jobs
  jobs.forEach((job) => job.start());
  logger.info(`Started ${jobs.length} cron jobs`);
};

const cleanupOldSessions = async () => {
  logger.debug('Cleaning up old sessions');
  // Implementation will delete expired sessions from database/redis
};

const cleanupOldLogs = async () => {
  logger.debug('Cleaning up old logs');
  // Implementation will archive/delete old log entries
};

const stopCronJobs = () => {
  jobs.forEach((job) => job.stop());
  logger.info('All cron jobs stopped');
};

module.exports = {
  initializeCronJobs,
  stopCronJobs,
};
