const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  env: process.env.NODE_ENV || 'development',
  name: process.env.APP_NAME || 'RestroPOS',
  url: isProduction
    ? (process.env.PROD_APP_URL || 'https://restro-backend.imaker.in')
    : (process.env.APP_URL || 'http://localhost:3000'),
  port: isProduction
    ? (parseInt(process.env.PROD_PORT, 10) || 3532)
    : (parseInt(process.env.PORT, 10) || 3000),
  wsPort: parseInt(process.env.WS_PORT, 10) || 3001,
  enableCronJobs: process.env.ENABLE_CRON_JOBS === 'true',
  reportAggregationInterval: process.env.REPORT_AGGREGATION_INTERVAL || '*/5 * * * *',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760,
  uploadPath: process.env.UPLOAD_PATH || './uploads',
  logLevel: process.env.LOG_LEVEL || 'debug',
  logFilePath: process.env.LOG_FILE_PATH || './logs',
  printServiceUrl: process.env.PRINT_SERVICE_URL || 'http://localhost:9100',
};
