const app = require('./app.config');
const database = require('./database.config');
const redis = require('./redis.config');
const jwt = require('./jwt.config');
const cors = require('./cors.config');
const rateLimit = require('./rateLimit.config');

module.exports = {
  app,
  database,
  redis,
  jwt,
  cors,
  rateLimit,
};
