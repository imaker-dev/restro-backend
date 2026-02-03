module.exports = {
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  algorithm: 'HS256',
  issuer: 'restro-pos',
};
