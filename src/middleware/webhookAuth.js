/**
 * Webhook Authentication Middleware
 * Verifies Dyno API webhook signatures and prevents replay attacks
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const dynoService = require('../services/dyno.service');

/**
 * Verify Dyno webhook signature
 * Checks HMAC-SHA256 signature and timestamp freshness
 */
const verifyDynoWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-dyno-signature'];
    const timestamp = req.headers['x-dyno-timestamp'];
    const channelId = req.headers['x-dyno-channel-id'] || req.body?.channel_id;

    // Check required headers
    if (!signature || !timestamp) {
      logger.warn('Webhook missing signature or timestamp', {
        hasSignature: !!signature,
        hasTimestamp: !!timestamp,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        error: 'Missing webhook signature or timestamp'
      });
    }

    // Check timestamp freshness (5 minute window)
    const now = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);
    
    if (isNaN(webhookTime) || Math.abs(now - webhookTime) > 300) {
      logger.warn('Webhook timestamp expired or invalid', {
        now,
        webhookTime,
        diff: now - webhookTime,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        error: 'Webhook timestamp expired'
      });
    }

    // Get channel webhook secret
    let webhookSecret;
    
    if (channelId) {
      const channel = await dynoService.getChannelById(channelId);
      if (channel) {
        webhookSecret = channel.webhook_secret;
      }
    }

    // Fallback to environment variable
    if (!webhookSecret) {
      webhookSecret = process.env.DYNO_WEBHOOK_SECRET;
    }

    if (!webhookSecret) {
      logger.error('No webhook secret configured', { channelId });
      return res.status(500).json({
        success: false,
        error: 'Webhook verification not configured'
      });
    }

    // Verify signature
    const payload = JSON.stringify(req.body);
    const signatureData = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signatureData)
      .digest('hex');

    // Constant-time comparison
    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      // Buffer length mismatch
      isValid = false;
    }

    if (!isValid) {
      logger.warn('Invalid webhook signature', {
        channelId,
        ip: req.ip,
        received: signature?.substring(0, 10) + '...',
        expected: expectedSignature.substring(0, 10) + '...'
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    // Attach verified info to request
    req.webhookVerified = true;
    req.webhookTimestamp = webhookTime;
    req.webhookChannelId = channelId;

    logger.info('Webhook signature verified', { channelId, ip: req.ip });
    next();

  } catch (error) {
    logger.error('Webhook verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Webhook verification failed'
    });
  }
};

/**
 * Optional IP allowlist check
 * Can be enabled for additional security
 */
const ipAllowlist = (allowedIps = []) => {
  return (req, res, next) => {
    if (!allowedIps || allowedIps.length === 0) {
      return next();
    }

    const clientIp = req.ip || 
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection.remoteAddress;

    if (!allowedIps.includes(clientIp)) {
      logger.warn('Webhook IP not in allowlist', { clientIp, allowedIps });
      return res.status(403).json({
        success: false,
        error: 'IP not allowed'
      });
    }

    next();
  };
};

/**
 * Rate limiting for webhooks
 * Prevents abuse and DoS
 */
const webhookRateLimit = (() => {
  const requests = new Map();
  const WINDOW_MS = 60000; // 1 minute
  const MAX_REQUESTS = 100; // per window

  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();

    // Clean old entries
    for (const [ip, data] of requests.entries()) {
      if (now - data.windowStart > WINDOW_MS) {
        requests.delete(ip);
      }
    }

    // Check rate
    const current = requests.get(key);
    if (current) {
      if (now - current.windowStart < WINDOW_MS) {
        current.count++;
        if (current.count > MAX_REQUESTS) {
          logger.warn('Webhook rate limit exceeded', { ip: key, count: current.count });
          return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded'
          });
        }
      } else {
        requests.set(key, { windowStart: now, count: 1 });
      }
    } else {
      requests.set(key, { windowStart: now, count: 1 });
    }

    next();
  };
})();

/**
 * Simplified webhook verification for Dyno endpoints
 * Uses resId from URL params to find channel and verify
 * Falls back to global webhook secret if no channel found
 */
const verifyDynoWebhookSimple = async (req, res, next) => {
  try {
    // For development/testing, allow bypass if no signature provided
    const isDevMode = process.env.NODE_ENV !== 'production';
    const signature = req.headers['x-dyno-signature'];
    const timestamp = req.headers['x-dyno-timestamp'];
    
    // In development mode without signature headers, allow through with warning
    if (isDevMode && !signature && !timestamp) {
      logger.warn('Dyno webhook: Development mode - allowing request without signature', {
        path: req.path,
        ip: req.ip
      });
      req.webhookVerified = false;
      return next();
    }

    // Get resId from URL params or request body
    const resId = req.params.resId || req.body?.res_id || req.body?.restaurant_id || req.body?.property_id;

    // If no signature headers, check for access token auth
    if (!signature && !timestamp) {
      const accessToken = req.headers['authorization']?.replace('Bearer ', '') || 
                          req.headers['x-access-token'];
      
      if (accessToken) {
        // Verify access token against channel
        const { getPool } = require('../database');
        const pool = getPool();
        const [channels] = await pool.query(
          `SELECT * FROM integration_channels 
           WHERE (dyno_access_token = ? OR property_id = ?) AND is_active = 1`,
          [accessToken, resId]
        );
        
        if (channels.length > 0) {
          req.webhookVerified = true;
          req.webhookChannel = channels[0];
          return next();
        }
      }

      // Log request for debugging but allow through in development
      logger.warn('Dyno webhook: No authentication provided', {
        path: req.path,
        resId,
        ip: req.ip
      });

      // In production, require auth
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // In development, allow through with warning
      req.webhookVerified = false;
      return next();
    }

    // Check timestamp freshness (5 minute window)
    const now = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);
    
    if (isNaN(webhookTime) || Math.abs(now - webhookTime) > 300) {
      return res.status(401).json({
        success: false,
        error: 'Webhook timestamp expired'
      });
    }

    // Get webhook secret from channel or environment
    let webhookSecret = process.env.DYNO_WEBHOOK_SECRET;
    
    if (resId) {
      const { getPool } = require('../database');
      const pool = getPool();
      const [channels] = await pool.query(
        `SELECT * FROM integration_channels WHERE property_id = ? AND is_active = 1`,
        [resId]
      );
      if (channels.length > 0 && channels[0].webhook_secret) {
        webhookSecret = channels[0].webhook_secret;
        req.webhookChannel = channels[0];
      }
    }

    if (!webhookSecret) {
      logger.error('No webhook secret configured');
      return res.status(500).json({
        success: false,
        error: 'Webhook verification not configured'
      });
    }

    // Verify signature
    const payload = JSON.stringify(req.body);
    const signatureData = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signatureData)
      .digest('hex');

    let isValid = false;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (err) {
      isValid = false;
    }

    if (!isValid) {
      logger.warn('Invalid Dyno webhook signature', { resId, ip: req.ip });
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    req.webhookVerified = true;
    req.webhookTimestamp = webhookTime;
    next();

  } catch (error) {
    logger.error('Dyno webhook verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Webhook verification failed'
    });
  }
};

module.exports = {
  verifyDynoWebhook,
  verifyDynoWebhookSimple,
  ipAllowlist,
  webhookRateLimit
};
