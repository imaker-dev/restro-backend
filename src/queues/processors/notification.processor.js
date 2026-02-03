const logger = require('../../utils/logger');
const { NOTIFICATION_TYPE } = require('../../constants');

const notificationProcessor = async (job) => {
  const { type, data, recipients } = job.data;

  logger.info(`Processing notification job: ${job.id}, type: ${type}`);

  try {
    switch (type) {
      case NOTIFICATION_TYPE.ORDER:
        await sendOrderNotification(data, recipients);
        break;
      case NOTIFICATION_TYPE.KOT:
        await sendKOTNotification(data, recipients);
        break;
      case NOTIFICATION_TYPE.PAYMENT:
        await sendPaymentNotification(data, recipients);
        break;
      case NOTIFICATION_TYPE.TABLE:
        await sendTableNotification(data, recipients);
        break;
      case NOTIFICATION_TYPE.INVENTORY:
        await sendInventoryNotification(data, recipients);
        break;
      case NOTIFICATION_TYPE.ALERT:
        await sendAlertNotification(data, recipients);
        break;
      case NOTIFICATION_TYPE.SYSTEM:
        await sendSystemNotification(data, recipients);
        break;
      default:
        logger.warn(`Unknown notification type: ${type}`);
    }

    return { success: true, type, recipientCount: recipients?.length || 0 };
  } catch (error) {
    logger.error(`Notification job ${job.id} failed:`, error);
    throw error;
  }
};

const sendOrderNotification = async (data, recipients) => {
  logger.debug('Sending order notification', { data, recipients });
  // Push notification / WebSocket emit logic
};

const sendKOTNotification = async (data, recipients) => {
  logger.debug('Sending KOT notification', { data, recipients });
};

const sendPaymentNotification = async (data, recipients) => {
  logger.debug('Sending payment notification', { data, recipients });
};

const sendTableNotification = async (data, recipients) => {
  logger.debug('Sending table notification', { data, recipients });
};

const sendInventoryNotification = async (data, recipients) => {
  logger.debug('Sending inventory notification', { data, recipients });
};

const sendAlertNotification = async (data, recipients) => {
  logger.debug('Sending alert notification', { data, recipients });
};

const sendSystemNotification = async (data, recipients) => {
  logger.debug('Sending system notification', { data, recipients });
};

module.exports = notificationProcessor;
