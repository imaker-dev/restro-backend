const logger = require('../../utils/logger');
const { REPORT_TYPE } = require('../../constants');

const reportProcessor = async (job) => {
  const { type, data, outletId, dateRange } = job.data;

  logger.info(`Processing report job: ${job.id}, type: ${type}`);

  try {
    let result;

    switch (type) {
      case REPORT_TYPE.DAILY_SALES:
        result = await aggregateDailySales(outletId, dateRange);
        break;
      case REPORT_TYPE.ITEM_SALES:
        result = await aggregateItemSales(outletId, dateRange);
        break;
      case REPORT_TYPE.CASH_SUMMARY:
        result = await aggregateCashSummary(outletId, dateRange);
        break;
      case REPORT_TYPE.TAX_SUMMARY:
        result = await aggregateTaxSummary(outletId, dateRange);
        break;
      case REPORT_TYPE.CATEGORY_WISE:
        result = await aggregateCategoryWise(outletId, dateRange);
        break;
      case REPORT_TYPE.WAITER_WISE:
        result = await aggregateWaiterWise(outletId, dateRange);
        break;
      case REPORT_TYPE.PAYMENT_MODE:
        result = await aggregatePaymentMode(outletId, dateRange);
        break;
      default:
        logger.warn(`Unknown report type: ${type}`);
    }

    return { success: true, type, result };
  } catch (error) {
    logger.error(`Report job ${job.id} failed:`, error);
    throw error;
  }
};

const aggregateDailySales = async (outletId, dateRange) => {
  logger.debug('Aggregating daily sales', { outletId, dateRange });
  // Aggregation logic - insert into daily_sales table
  return { aggregated: true };
};

const aggregateItemSales = async (outletId, dateRange) => {
  logger.debug('Aggregating item sales', { outletId, dateRange });
  return { aggregated: true };
};

const aggregateCashSummary = async (outletId, dateRange) => {
  logger.debug('Aggregating cash summary', { outletId, dateRange });
  return { aggregated: true };
};

const aggregateTaxSummary = async (outletId, dateRange) => {
  logger.debug('Aggregating tax summary', { outletId, dateRange });
  return { aggregated: true };
};

const aggregateCategoryWise = async (outletId, dateRange) => {
  logger.debug('Aggregating category wise', { outletId, dateRange });
  return { aggregated: true };
};

const aggregateWaiterWise = async (outletId, dateRange) => {
  logger.debug('Aggregating waiter wise', { outletId, dateRange });
  return { aggregated: true };
};

const aggregatePaymentMode = async (outletId, dateRange) => {
  logger.debug('Aggregating payment mode', { outletId, dateRange });
  return { aggregated: true };
};

module.exports = reportProcessor;
