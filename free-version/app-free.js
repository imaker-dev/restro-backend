/**
 * Restro POS — Free Offline Version Entry Point
 * 
 * Differences from cloud version:
 * - No Redis (Socket.IO uses in-memory adapter)
 * - No Sentry (error monitoring disabled)
 * - No BullMQ (queues run inline/synchronous)
 * - Auto-runs migrations on startup
 * - Binds to 0.0.0.0 for LAN access
 * - Connects to local portable MariaDB on port 3307
 * - Requires activation token before first use
 * - DB name is always 'restro' (clean install)
 */

const path = require('path');
const fs = require('fs');

// Load free version env config
// In packaged mode, __dirname points to the snapshot filesystem
// We need to find the .env file relative to the executable
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'config', 'free.env'),
  path.join(__dirname, '..', 'config', 'free.env'),
  path.join(__dirname, 'config', 'free.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    envLoaded = true;
    break;
  }
}
if (!envLoaded) {
  // Set defaults if no .env found
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.PORT = process.env.PORT || '3000';
  process.env.HOST = process.env.HOST || '0.0.0.0';
  process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
  process.env.DB_PORT = process.env.DB_PORT || '3307';
  process.env.DB_NAME = process.env.DB_NAME || 'restro';
  process.env.DB_USER = process.env.DB_USER || 'restro';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'restro_pos_2024';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'restro-free-offline-jwt-secret-key-2024';
  process.env.JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '24h';
  process.env.JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';
}

// Force free-version flags
process.env.IS_FREE_VERSION = 'true';
process.env.REDIS_ENABLED = 'false';
process.env.SENTRY_ENABLED = 'false';
process.env.QUEUE_MODE = 'inline';
process.env.ACTIVATION_REQUIRED = 'true';

// DATA_ROOT: writable directory for runtime data (set by Flutter BackendManager)
// Defaults to process.cwd() when not set (dev mode / non-Windows)
const DATA_ROOT = process.env.DATA_ROOT || process.cwd();
process.env.UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(DATA_ROOT, 'uploads');
process.env.LOG_FILE_PATH = process.env.LOG_FILE_PATH || path.join(DATA_ROOT, 'logs');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const http = require('http');

// Use the existing src modules (they'll be bundled in the binary)
const config = require('../src/config');
const logger = require('../src/utils/logger');
const { initializeDatabase } = require('../src/database');
const { initializeSocket, emitLocal } = require('../src/config/socket');
const { initializeCronJobs } = require('../src/cron');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Security middleware
// NOTE: This backend serves plain HTTP only (no TLS).
// - hsts: false              → never send Strict-Transport-Security (would break LAN HTTP access)
// - contentSecurityPolicy    → custom directives without 'upgrade-insecure-requests'
//                              (that directive would force browsers to HTTPS, breaking local access)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'http:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'ws:', 'wss:', 'http:', 'https:'],
      // upgrade-insecure-requests intentionally omitted — HTTP-only local backend
    },
  },
}));

// CORS — allow all origins for LAN access
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.options('*', cors({ origin: true, credentials: true }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Response time header
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const origEnd = res.end;
  res.end = function (...args) {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${ms.toFixed(2)}ms`);
    }
    return origEnd.apply(this, args);
  };
  next();
});

// Logging
app.use(morgan('short', { stream: logger.stream }));

// Static files
const uploadPath = process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
app.use('/uploads', express.static(uploadPath));

// Health check with version info
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    version: 'free-offline-v1',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    isFreeVersion: true,
  });
});

// Network info endpoint — helps Flutter app discover backend IP
app.get('/api/v1/network-info', (req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ interface: name, address: iface.address });
      }
    }
  }
  res.json({
    success: true,
    data: {
      port: process.env.PORT || 3000,
      addresses,
      localUrl: `http://localhost:${process.env.PORT || 3000}`,
      lanUrls: addresses.map(a => `http://${a.address}:${process.env.PORT || 3000}`),
    }
  });
});

// Activation routes - available BEFORE system is activated (no auth required)
const activationRoutes = require('./license/activation.routes');
app.use('/api/v1/activation', activationRoutes);

// Token bridge: Flutter InAppWebView opens this first to set localStorage before
// React initialises. Vanilla JS sets the auth token then redirects to /admin/.
// This avoids the Rollup bundle module-ordering race (authSlice reads isLoggedIn()
// at module scope before preloadToken.js can write the token).
app.get('/admin-login', (req, res) => {
  const raw = (req.query.token || req.query.access_token || '').toString();
  // Sanitise: JWT is Base64URL so only [A-Za-z0-9._-] is valid. Strip anything else.
  const token = raw.replace(/[^A-Za-z0-9._\-]/g, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading…</title></head><body>
<script>
(function(){
  try{
    localStorage.setItem("_k_e7c1fa92","${token}");
    localStorage.setItem("_k_ls_72ac91","mobile");
  }catch(e){}
  window.location.replace("/admin/");
})();
</script></body></html>`);
});

// Admin Panel - serve the pre-built React admin UI at /admin (BEFORE activation middleware)
// Admin panel has its own authentication, so it's accessible without system activation
const adminCandidates = [
  path.join(process.cwd(), 'admin'),
  path.join(path.dirname(process.execPath), 'admin'),
  path.join(path.dirname(process.execPath), 'backend', 'admin'),
];
let adminDistPath = null;
for (const candidate of adminCandidates) {
  const indexPath = path.join(candidate, 'index.html');
  if (fs.existsSync(indexPath)) {
    adminDistPath = candidate;
    break;
  }
}
if (adminDistPath) {
  app.use('/admin', express.static(adminDistPath));
  // The compiled React bundle references these public folders WITHOUT the /admin prefix.
  // Serve them at root so browser requests like /Images/Logo.svg resolve correctly
  // whether the page is opened via localhost or LAN IP.
  app.use('/Images', express.static(path.join(adminDistPath, 'Images')));
  app.use('/Sound', express.static(path.join(adminDistPath, 'Sound')));
  app.use('/Icons', express.static(path.join(adminDistPath, 'Icons')));
  // SPA fallback: any /admin/* route that isn't a file - serve index.html
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(adminDistPath, 'index.html'));
  });
  logger.info(`[FREE] Admin panel available at /admin (from ${adminDistPath})`);
} else {
  logger.warn(`[FREE] Admin panel NOT found. Checked: ${adminCandidates.join(', ')}`);
}

// Activation middleware - blocks all other API routes until system is activated
const { requireActivation } = require('./license/activation.middleware');
app.use(requireActivation);

// License routes (plan status, upgrade) - requires activation + auth
const licenseRoutes = require('./license/license.routes');
app.use('/api/v1/license', licenseRoutes);

// Module guard — blocks Pro-only API routes on Free plan
const { requireModule } = require('./license/module.middleware');
const { authenticate } = require('../src/middlewares/auth.middleware');

// Inventory module routes require Pro plan
app.use('/api/v1/inventory', authenticate, requireModule('inventory'));
app.use('/api/v1/recipes', authenticate, requireModule('inventory'));
app.use('/api/v1/production', authenticate, requireModule('inventory'));
app.use('/api/v1/wastage', authenticate, requireModule('inventory'));
app.use('/api/v1/inventory-reports', authenticate, requireModule('inventory'));

// Plan limit enforcement — block user/outlet creation beyond plan limits
const { checkUserLimit, checkOutletLimit } = require('./license/limit.middleware');
app.post('/api/v1/users', authenticate, checkUserLimit);         // intercepts user creation
app.post('/api/v1/outlets', authenticate, checkOutletLimit);      // intercepts outlet creation

// API Routes (reuse existing - only accessible after activation)
const routes = require('../src/routes');
app.use('/api/v1', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Resource not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: 'Internal server error',
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down...`);
  const forceTimer = setTimeout(() => process.exit(1), 10000);
  forceTimer.unref();
  try {
    server.close();
    const { closePool } = require('../src/database');
    await closePool();
    process.exit(0);
  } catch (err) {
    logger.error('Shutdown error:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Pre-migration database backup.
 * Creates a mysqldump before any migration runs so data can be restored on failure.
 * Keeps the last 3 backups and rotates older ones.
 * Silently skips if dump tool is not available (e.g. dev mode without portable MariaDB).
 */
const backupDatabase = async () => {
  try {
    const { execSync } = require('child_process');
    const dbHost = process.env.DB_HOST || '127.0.0.1';
    const dbPort = process.env.DB_PORT || '3307';
    const dbName = process.env.DB_NAME || 'restro';
    const dbUser = process.env.DB_USER || 'restro';
    const dbPass = process.env.DB_PASSWORD || 'restro_pos_2024';

    // Find mysqldump/mariadb-dump binary
    const backupDir = path.join(DATA_ROOT, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    // Locate dump tool — check sibling mariadb\bin first, then system PATH
    const candidates = [];
    const exeDir = path.dirname(process.execPath);
    for (const bin of ['mariadb-dump', 'mysqldump']) {
      candidates.push(path.join(exeDir, 'mariadb', 'bin', `${bin}.exe`));
      candidates.push(path.join(exeDir, 'mariadb', 'bin', bin));
      candidates.push(bin); // fallback to PATH
    }
    let dumpTool = null;
    for (const c of candidates) {
      try {
        execSync(`"${c}" --version`, { stdio: 'pipe' });
        dumpTool = c;
        break;
      } catch (_) {}
    }
    if (!dumpTool) {
      logger.info('[FREE] Backup skipped — dump tool not found (OK for dev mode)');
      return;
    }

    // Generate timestamped backup filename
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    const backupFile = path.join(backupDir, `pre_migration_${ts}.sql`);

    execSync(
      `"${dumpTool}" -h ${dbHost} -P ${dbPort} -u ${dbUser} -p${dbPass} --single-transaction --routines --triggers ${dbName} > "${backupFile}"`,
      { stdio: 'pipe', timeout: 120000 }
    );

    logger.info(`[FREE] Pre-migration backup: ${backupFile}`);

    // Rotate — keep last 3 backups only
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('pre_migration_') && f.endsWith('.sql'))
      .sort()
      .reverse();
    for (let i = 3; i < backups.length; i++) {
      fs.unlinkSync(path.join(backupDir, backups[i]));
      logger.info(`[FREE] Rotated old backup: ${backups[i]}`);
    }
  } catch (err) {
    // Backup failure should NOT block startup — log and continue
    logger.warn(`[FREE] Pre-migration backup failed (non-fatal): ${err.message}`);
  }
};

// Auto-run migrations then start
const startServer = async () => {
  try {
    // 1. Initialize database
    await initializeDatabase();
    logger.info('[FREE] Database connected');

    // 2. Pre-migration backup (best-effort, non-fatal)
    await backupDatabase();

    // 3. Auto-run migrations (safe — uses IF NOT EXISTS)
    try {
      const { runMigrations } = require('../src/database/migrate');
      await runMigrations();
      logger.info('[FREE] Migrations completed');
    } catch (migErr) {
      logger.error('[FREE] Migration failed:', migErr.message);
      throw migErr;
    }

    // 4. Check activation status
    const licenseService = require('./license/license.service');
    const activationStatus = await licenseService.getActivationStatus();
    if (activationStatus.activated) {
      logger.info(`[FREE] System activated: ${activationStatus.restaurant} (${activationStatus.plan})`);
    } else {
      logger.info('[FREE] System NOT activated — waiting for activation token');
      logger.info('[FREE] Flutter app should call POST /api/v1/activation/activate with the token');
    }

    // 5. Initialize Socket.IO (in-memory mode, no Redis adapter)
    initializeSocket(server);
    logger.info('[FREE] WebSocket initialized (in-memory mode)');

    // 6. Register local emitter
    const { registerLocalEmitter } = require('../src/config/redis');
    if (typeof registerLocalEmitter === 'function') {
      registerLocalEmitter(emitLocal);
    }

    // 7. Initialize Cron Jobs
    if (process.env.ENABLE_CRON_JOBS === 'true') {
      initializeCronJobs();
      logger.info('[FREE] Cron jobs initialized');
    }

    // 8. Start listening
    const port = parseInt(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';
    server.listen(port, host, () => {
      logger.info(`[FREE] Restro POS running on http://${host}:${port}`);
      
      // Print LAN addresses for easy Flutter connection
      const os = require('os');
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            logger.info(`[FREE] LAN access: http://${iface.address}:${port}`);
          }
        }
      }
    });

  } catch (error) {
    logger.error('[FREE] Failed to start:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server };
