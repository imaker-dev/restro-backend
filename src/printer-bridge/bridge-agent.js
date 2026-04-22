/**
 * Local Printer Bridge Agent
 * 
 * This script runs on a local machine at the restaurant to:
 * 1. Poll the cloud server for pending print jobs
 * 2. Send print commands to local thermal printers via network
 * 3. Report print status back to the server
 * 
 * Installation:
 * 1. Install Node.js on the local machine
 * 2. Copy this file to the local machine
 * 3. Run: npm init -y && npm install axios
 * 4. Configure the settings below
 * 5. Run: node bridge-agent.js
 * 
 * For Windows service: use pm2 or nssm to run as service
 */

const axios = require('axios');
const net = require('net');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const BINARY_CONTENT_PREFIX = 'b64:';

// ========================
// CONFIGURATION
// ========================

const CONFIG = {
  // Cloud server URL (your backend API)
  // CLOUD_URL: process.env.CLOUD_URL || 'http://localhost:3005',
  CLOUD_URL: process.env.CLOUD_URL || 'https://made-img-specializing-trio.trycloudflare.com',
  
  // Outlet ID from your system
  OUTLET_ID: process.env.OUTLET_ID || '43',
  
  // Bridge code (created via API: POST /api/v1/printers/bridges)
  BRIDGE_CODE: process.env.BRIDGE_CODE || 'KITCHEN-BRIDGE-1',
  
  // API key (optional - bridge works without it now)
  API_KEY: process.env.API_KEY || '',
  
  // Polling interval in milliseconds (adaptive: starts here, slows to 10s when idle)
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL) || 3000,

  // How often to report local printer status to cloud (reduced to save requests)
  STATUS_REPORT_INTERVAL: parseInt(process.env.STATUS_REPORT_INTERVAL) || 60000,

  // How often to refresh printer mapping from DB
  PRINTER_CONFIG_REFRESH_INTERVAL: parseInt(process.env.PRINTER_CONFIG_REFRESH_INTERVAL) || 60000,
  
  // Printers configuration - map stations to printer IP/port
  // Station names are DYNAMIC and match kitchen_stations.station_type or counter_type
  // Examples: main_kitchen, tandoor, bar, dessert, mocktail, bill, cashier
  // These are loaded dynamically from server via refreshPrinterConfigFromCloud()
  // Initial config is used as fallback if server is unreachable
  PRINTERS: {
    // KOT stations (from kitchen_stations.station_type)
    main_kitchen: { ip: '192.168.1.13', port: 9100 },
    kitchen: { ip: '192.168.1.13', port: 9100 },
    tandoor: { ip: '192.168.1.13', port: 9100 },
    bar: { ip: '192.168.1.13', port: 9100 },
    dessert: { ip: '192.168.1.13', port: 9100 },
    mocktail: { ip: '192.168.1.13', port: 9100 },
    // Bill/cashier stations
    bill: { ip: '192.168.1.13', port: 9100 },
    cashier: { ip: '192.168.1.13', port: 9100 },
    test: { ip: '192.168.1.13', port: 9100 }
  },
  
  // Fallback printer if station not found
  DEFAULT_PRINTER: { ip: '192.168.1.13', port: 9100 },

  // USB Fallback Configuration
  // When LAN printing fails, try USB printing as fallback
  USB_FALLBACK_ENABLED: process.env.USB_FALLBACK_ENABLED !== 'false', // enabled by default
  
  // USB Printer name (Windows shared printer name or device path)
  // Windows: Use printer share name from "Devices and Printers" (e.g., "POS-80" or "\\localhost\POS-80")
  // Linux/Mac: Use device path (e.g., "/dev/usb/lp0")
  USB_PRINTER_NAME: process.env.USB_PRINTER_NAME || 'RP 3230',
  
  // Temp directory for print files
  TEMP_DIR: process.env.TEMP_DIR || os.tmpdir()
};

// Normalize critical config values to avoid auth mismatches from whitespace.
CONFIG.CLOUD_URL = String(CONFIG.CLOUD_URL || '').trim();
CONFIG.OUTLET_ID = String(CONFIG.OUTLET_ID || '').trim();
CONFIG.BRIDGE_CODE = String(CONFIG.BRIDGE_CODE || '').trim();
CONFIG.API_KEY = String(CONFIG.API_KEY || '').trim();

// ========================
// PRINTER COMMUNICATION
// ========================

/**
 * Send raw data to thermal printer via TCP socket (LAN)
 */
function sendToPrinterLAN(printerIp, printerPort, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let connected = false;
    
    // Set timeout — 5s is enough for local network printers; faster failure detection
    client.setTimeout(10000);
    
    client.connect(printerPort, printerIp, () => {
      connected = true;
      console.log(`  Connected to printer ${printerIp}:${printerPort}`);
      client.write(data);
      client.end();
    });
    
    client.on('close', () => {
      if (connected) {
        resolve();
      }
    });
    
    client.on('error', (err) => {
      console.error(`  Printer error: ${err.message}`);
      reject(err);
    });
    
    client.on('timeout', () => {
      console.error('  Printer connection timeout');
      client.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

/**
 * Send raw data to USB printer via Windows print spooler or direct file write (Linux/Mac)
 * Windows: Uses 'print' command or 'copy' to printer share
 * Linux/Mac: Writes directly to device file
 */
function sendToPrinterUSB(printerName, data) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const tempFile = path.join(CONFIG.TEMP_DIR, `print_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
    
    // Write data to temp file
    try {
      fs.writeFileSync(tempFile, data);
    } catch (err) {
      return reject(new Error(`Failed to write temp file: ${err.message}`));
    }
    
    if (isWindows) {
      // Windows: Use 'copy' command to send raw data to printer
      // Format: copy /b <file> <printer>
      // Printer can be: "\\localhost\PrinterName" or just "PrinterName" if shared
      const printerPath = printerName.startsWith('\\\\') ? printerName : `\\\\localhost\\${printerName}`;
      const cmd = `copy /b "${tempFile}" "${printerPath}"`;
      
      exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
        
        if (error) {
          // Try alternative method: print command
          const altCmd = `print /d:"${printerPath}" "${tempFile}"`;
          exec(altCmd, { timeout: 15000 }, (altError) => {
            if (altError) {
              reject(new Error(`USB print failed: ${error.message}`));
            } else {
              console.log(`  ✅ Printed via USB (Windows print command)`);
              resolve();
            }
          });
        } else {
          console.log(`  ✅ Printed via USB (Windows copy)`);
          resolve();
        }
      });
    } else {
      // Linux/Mac: Write directly to device file
      // printerName should be device path like "/dev/usb/lp0"
      const devicePath = printerName.startsWith('/dev') ? printerName : `/dev/usb/lp0`;
      
      try {
        fs.writeFileSync(devicePath, data);
        fs.unlinkSync(tempFile);
        console.log(`  ✅ Printed via USB (${devicePath})`);
        resolve();
      } catch (err) {
        fs.unlinkSync(tempFile);
        reject(new Error(`USB print failed: ${err.message}`));
      }
    }
  });
}

/**
 * Send data to printer with LAN → USB fallback
 * First tries LAN (TCP), if fails and USB fallback is enabled, tries USB
 */
async function sendToPrinter(printerIp, printerPort, data) {
  // Try LAN first
  try {
    await sendToPrinterLAN(printerIp, printerPort, data);
    return { method: 'lan', success: true };
  } catch (lanError) {
    console.log(`  ⚠️ LAN print failed: ${lanError.message}`);
    
    // Try USB fallback if enabled
    if (CONFIG.USB_FALLBACK_ENABLED && CONFIG.USB_PRINTER_NAME) {
      console.log(`  🔄 Attempting USB fallback (${CONFIG.USB_PRINTER_NAME})...`);
      try {
        await sendToPrinterUSB(CONFIG.USB_PRINTER_NAME, data);
        return { method: 'usb', success: true };
      } catch (usbError) {
        console.log(`  ⚠️ USB print also failed: ${usbError.message}`);
        throw new Error(`LAN failed: ${lanError.message}; USB failed: ${usbError.message}`);
      }
    } else {
      // USB fallback not enabled, throw original error
      throw lanError;
    }
  }
}

function decodeJobContent(content) {
  if (content === null || content === undefined) {
    throw new Error('Missing print content');
  }

  if (Buffer.isBuffer(content)) {
    return content;
  }

  // Safety for APIs that serialize Buffer as { type: 'Buffer', data: [...] }.
  if (typeof content === 'object' && content.type === 'Buffer' && Array.isArray(content.data)) {
    return Buffer.from(content.data);
  }

  if (typeof content === 'string' && content.startsWith(BINARY_CONTENT_PREFIX)) {
    const base64Payload = content.slice(BINARY_CONTENT_PREFIX.length);
    if (!base64Payload) {
      throw new Error('Empty base64 print content');
    }
    return Buffer.from(base64Payload, 'base64');
  }

  // Backward compatibility for old jobs already stored as plain text.
  return content;
}

/**
 * Get printer config for a station (dynamic lookup)
 * Station names come directly from kitchen_stations.station_type (e.g., main_kitchen, tandoor, bar)
 */
function getPrinterForStation(station) {
  const printer = CONFIG.PRINTERS[station];
  if (printer) {
    return printer;
  }
  
  // Log when using default printer for unknown station
  console.log(`   ⚠️ No dedicated printer for station "${station}", using default printer`);
  return CONFIG.DEFAULT_PRINTER;
}

// ========================
// API COMMUNICATION
// ========================

// Build headers - only include API key if provided
const apiHeaders = { 'Content-Type': 'application/json' };
if (CONFIG.API_KEY) {
  apiHeaders['x-api-key'] = CONFIG.API_KEY;
  apiHeaders['Authorization'] = `Bearer ${CONFIG.API_KEY}`;
}

// Use HTTP keep-alive to reuse TCP/TLS connections (saves ~100-200ms per request)
const http = require('http');
const https = require('https');
const keepAliveHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 4 });
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 4 });

const api = axios.create({
  baseURL: CONFIG.CLOUD_URL,
  headers: apiHeaders,
  timeout: 10000,
  httpAgent: keepAliveHttpAgent,
  httpsAgent: keepAliveHttpsAgent
});

/**
 * Test API connectivity on startup
 */
async function testApiConnection() {
  console.log(`🔗 Testing connection to ${CONFIG.CLOUD_URL}...`);
  try {
    const response = await axios.get(`${CONFIG.CLOUD_URL}/health`, { timeout: 10000 });
    console.log(`✅ API server is reachable (status: ${response.status})`);
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(`❌ Connection refused - server might not be running`);
    } else if (error.code === 'ENOTFOUND') {
      console.error(`❌ DNS lookup failed - check CLOUD_URL: ${CONFIG.CLOUD_URL}`);
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.error(`❌ Connection timeout - server not responding or firewall blocking`);
    } else {
      console.error(`⚠️ API test: ${error.message}`);
    }
    return false;
  }
}

/**
 * Poll for next pending print job
 */
async function pollForJob() {
  try {
    const response = await api.get(
      `/api/v1/printers/bridge/${CONFIG.OUTLET_ID}/${CONFIG.BRIDGE_CODE}/poll`
    );
    
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      const serverMessage = error.response?.data?.message || 'Invalid credentials';
      console.error(`Authentication failed (${serverMessage}). Check API key, outlet ID, and bridge code.`);
    }
    throw error;
  }
}

/**
 * Acknowledge job completion.
 * Fire-and-forget by default — caller doesn't wait for the HTTP round-trip.
 * Retries once on failure to avoid lost acks.
 */
function acknowledgeJob(jobId, status, error = null) {
  const doAck = async (attempt) => {
    try {
      await api.post(
        `/api/v1/printers/bridge/${CONFIG.OUTLET_ID}/${CONFIG.BRIDGE_CODE}/jobs/${jobId}/ack`,
        { status, error },
        { timeout: 8000 }
      );
    } catch (err) {
      if (attempt < 2) {
        // Retry once after 1s
        setTimeout(() => doAck(attempt + 1), 1000);
      } else {
        console.error(`  Failed to acknowledge job ${jobId} after ${attempt} attempts:`, err.message);
      }
    }
  };
  // Fire and forget — don't block caller
  doAck(1);
}

function testPrinterConnection(printerIp, printerPort) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    const start = Date.now();

    client.setTimeout(3000);

    client.connect(printerPort, printerIp, () => {
      const latency = Date.now() - start;
      client.destroy();
      resolve({ isOnline: true, latency, error: null });
    });

    client.on('error', (err) => {
      resolve({ isOnline: false, latency: null, error: err.message });
    });

    client.on('timeout', () => {
      client.destroy();
      resolve({ isOnline: false, latency: null, error: 'Connection timeout' });
    });
  });
}

async function reportPrinterStatuses() {
  const printerEntries = Object.entries(CONFIG.PRINTERS || {});
  if (printerEntries.length === 0) return;

  // De-duplicate by printerId to avoid reporting same physical printer multiple times
  const seenPrinterIds = new Set();
  const uniqueEntries = [];
  for (const [station, printer] of printerEntries) {
    const key = printer.printerId ? String(printer.printerId) : `${printer.ip}:${printer.port}:${station}`;
    if (!seenPrinterIds.has(key)) {
      seenPrinterIds.add(key);
      uniqueEntries.push([station, printer]);
    }
  }

  const statuses = await Promise.all(
    uniqueEntries.map(async ([station, printer]) => {
      const result = await testPrinterConnection(printer.ip, printer.port);
      return {
        station,
        printerId: printer.printerId || null,
        ipAddress: printer.ip,
        port: printer.port,
        isOnline: result.isOnline,
        latency: result.latency,
        error: result.error,
        checkedAt: new Date().toISOString()
      };
    })
  );

  try {
    await api.post(
      `/api/v1/printers/bridge/${CONFIG.OUTLET_ID}/${CONFIG.BRIDGE_CODE}/status`,
      { statuses }
    );
  } catch (err) {
    console.error('Status report error:', err.response?.data?.message || err.message);
  }
}

async function refreshPrinterConfigFromCloud() {
  try {
    const response = await api.get(
      `/api/v1/printers/bridge/${CONFIG.OUTLET_ID}/${CONFIG.BRIDGE_CODE}/config`
    );

    const configData = response?.data?.data;
    const printersFromDb = configData?.printers;
    if (!printersFromDb || typeof printersFromDb !== 'object') {
      return;
    }

    const normalizedPrinters = {};
    for (const [station, printer] of Object.entries(printersFromDb)) {
      if (!station || !printer || !printer.ip) continue;
      const port = Number.isInteger(printer.port) ? printer.port : parseInt(printer.port, 10);
      normalizedPrinters[station] = {
        ip: String(printer.ip).trim(),
        port: Number.isInteger(port) ? port : 9100,
        printerId: printer.printerId || null
      };
    }

    const stations = Object.keys(normalizedPrinters);
    if (stations.length === 0) {
      console.log('⚠️  No active printer mappings returned from DB. Keeping existing local configuration.');
      return;
    }

    CONFIG.PRINTERS = normalizedPrinters;
    CONFIG.DEFAULT_PRINTER = normalizedPrinters[stations[0]];
    console.log(`🔄 Printer config refreshed from DB (${stations.length} stations: ${stations.join(', ')})`);
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    console.error(`Printer config refresh failed: ${message}`);
  }
}

// ========================
// MAIN LOOP — Long-polling + batch processing
// ========================

let jobsProcessed = 0;
let jobsFailed = 0;
// How long the server holds the connection when no jobs are pending (ms).
// The server will respond instantly if a job arrives during this window.
const LONG_POLL_WAIT = 25000;
// How many jobs to fetch per poll (reduces round-trips for multi-printer KOTs)
const BATCH_SIZE = 10;
// Delay before reconnecting after an error (avoids tight error loops)
const ERROR_RETRY_DELAY = 5000;

/**
 * Process a single print job: resolve printer → send TCP → acknowledge (fire-and-forget)
 */
async function processJob(job) {
  const t0 = Date.now();
  console.log(`  📄 Job #${job.id}: ${job.job_type} for ${job.station} (ref: ${job.reference_number || 'N/A'})`);

  // Resolve printer: prefer job's assigned printer IP, fall back to local config
  let printer;
  if (job.ip_address) {
    printer = { ip: job.ip_address, port: job.port || 9100 };
  } else {
    printer = getPrinterForStation(job.station);
  }

  if (!printer || !printer.ip) {
    console.log(`     ❌ No printer for station "${job.station}"`);
    acknowledgeJob(job.id, 'failed', `No printer configured for station: ${job.station}`);
    jobsFailed++;
    return;
  }

  try {
    const printableContent = decodeJobContent(job.content);
    const result = await sendToPrinter(printer.ip, printer.port, printableContent);
    acknowledgeJob(job.id, 'printed'); // fire-and-forget — don't wait for HTTP round-trip
    jobsProcessed++;
    const methodLabel = result.method === 'usb' ? `USB (${CONFIG.USB_PRINTER_NAME})` : `${printer.ip}:${printer.port}`;
    console.log(`     ✅ Printed via ${result.method.toUpperCase()} to ${methodLabel} in ${Date.now() - t0}ms (total: ${jobsProcessed})`);
  } catch (printError) {
    acknowledgeJob(job.id, 'failed', printError.message); // fire-and-forget
    jobsFailed++;
    console.log(`     ❌ Failed: ${printError.message} in ${Date.now() - t0}ms (failed: ${jobsFailed})`);
  }
}

/**
 * Main polling loop — uses long polling with batch fetching.
 * Server holds the connection for up to LONG_POLL_WAIT ms when idle,
 * responds instantly when a new job is created.
 * Result: near-zero latency when jobs arrive, ~2 requests/min when idle.
 */
async function pollLoop() {
  while (true) {
    try {
      const response = await api.get(
        `/api/v1/printers/bridge/${CONFIG.OUTLET_ID}/${CONFIG.BRIDGE_CODE}/poll`,
        {
          params: { wait: LONG_POLL_WAIT, batch: BATCH_SIZE },
          timeout: LONG_POLL_WAIT + 10000 // HTTP timeout > server hold time
        }
      );

      const result = response.data;
      const jobs = result.data;

      // Batch mode: data is an array
      if (Array.isArray(jobs) && jobs.length > 0) {
        console.log(`\n📦 Received ${jobs.length} job(s)`);
        // Process all jobs in parallel for speed (each goes to a different printer)
        await Promise.all(jobs.map(job => processJob(job)));
        // Immediately poll again — there may be more jobs
        continue;
      }

      // Single-job mode (backward compat): data is an object or null
      if (jobs && typeof jobs === 'object' && !Array.isArray(jobs) && jobs.id) {
        console.log(`\n📦 Received 1 job`);
        await processJob(jobs);
        continue;
      }

      // No jobs — server already waited LONG_POLL_WAIT ms, reconnect immediately
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn('⚠️  Rate limited (429) — waiting 30s');
        await sleep(30000);
      } else if (error.response?.status === 401) {
        console.error('❌ Auth failed. Check bridge code/API key. Retrying in 30s...');
        await sleep(30000);
      } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        // Normal: long-poll timeout, just reconnect
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.error(`❌ Server unreachable (${error.code}). Retrying in ${ERROR_RETRY_DELAY / 1000}s...`);
        await sleep(ERROR_RETRY_DELAY);
      } else {
        console.error('Poll error:', error.message);
        await sleep(ERROR_RETRY_DELAY);
      }
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================
// STARTUP
// ========================

function printBanner() {  
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           RESTAURANT POS - PRINTER BRIDGE AGENT          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Server:      ${CONFIG.CLOUD_URL.padEnd(43)}║`);
  console.log(`║  Outlet ID:   ${CONFIG.OUTLET_ID.padEnd(43)}║`);
  console.log(`║  Bridge Code: ${CONFIG.BRIDGE_CODE.padEnd(43)}║`);
  console.log(`║  Mode:        Long-poll (${LONG_POLL_WAIT / 1000}s hold, batch=${BATCH_SIZE})`.padEnd(59) + '║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Configured Printers:                                    ║');
  
  for (const [station, printer] of Object.entries(CONFIG.PRINTERS)) {
    const line = `${station}: ${printer.ip}:${printer.port}`;
    console.log(`║    - ${line.padEnd(52)}║`);
  }
  
  console.log('╠══════════════════════════════════════════════════════════╣');
  const usbStatus = CONFIG.USB_FALLBACK_ENABLED ? `ON → ${CONFIG.USB_PRINTER_NAME}` : 'OFF';
  console.log(`║  USB Fallback: ${usbStatus.padEnd(42)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🟢 Bridge agent started. Waiting for print jobs...');
  console.log('   Print flow: LAN (TCP) → USB fallback (if LAN fails)');
  console.log('   Press Ctrl+C to stop.\n');
}

function testPrinterConnections() {
  console.log('🔍 Testing printer connections...\n');
  
  // Test LAN printers
  console.log('   LAN Printers:');
  for (const [station, printer] of Object.entries(CONFIG.PRINTERS)) {
    const client = new net.Socket();
    client.setTimeout(3000);
    
    client.connect(printer.port, printer.ip, () => {
      console.log(`   ✅ ${station}: ${printer.ip}:${printer.port} - Connected`);
      client.destroy();
    });
    
    client.on('error', () => {
      console.log(`   ❌ ${station}: ${printer.ip}:${printer.port} - Not reachable`);
    });
    
    client.on('timeout', () => {
      console.log(`   ⚠️ ${station}: ${printer.ip}:${printer.port} - Timeout`);
      client.destroy();
    });
  }
}

/**
 * Test USB printer connectivity
 */
async function testUSBPrinter() {
  if (!CONFIG.USB_FALLBACK_ENABLED || !CONFIG.USB_PRINTER_NAME) {
    console.log('   USB Fallback: Disabled\n');
    return;
  }
  
  console.log(`\n   USB Printer (${CONFIG.USB_PRINTER_NAME}):`);
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    // Test Windows printer by checking if it exists in the system
    const printerPath = CONFIG.USB_PRINTER_NAME.startsWith('\\\\') 
      ? CONFIG.USB_PRINTER_NAME 
      : `\\\\localhost\\${CONFIG.USB_PRINTER_NAME}`;
    
    // Use 'wmic' to check printer existence
    exec(`wmic printer where "name='${CONFIG.USB_PRINTER_NAME}'" get name`, { timeout: 5000 }, (error, stdout) => {
      if (error || !stdout.includes(CONFIG.USB_PRINTER_NAME)) {
        // Try checking shared printer
        exec(`net view \\\\localhost`, { timeout: 5000 }, (err2, stdout2) => {
          if (stdout2 && stdout2.includes(CONFIG.USB_PRINTER_NAME)) {
            console.log(`   ✅ USB: ${CONFIG.USB_PRINTER_NAME} - Found (shared printer)`);
          } else {
            console.log(`   ⚠️ USB: ${CONFIG.USB_PRINTER_NAME} - Not found (check printer name in Devices & Printers)`);
            console.log(`      Tip: Share the printer and use exact share name`);
          }
        });
      } else {
        console.log(`   ✅ USB: ${CONFIG.USB_PRINTER_NAME} - Found`);
      }
    });
  } else {
    // Linux/Mac: Check if device file exists
    const devicePath = CONFIG.USB_PRINTER_NAME.startsWith('/dev') 
      ? CONFIG.USB_PRINTER_NAME 
      : `/dev/usb/lp0`;
    
    if (fs.existsSync(devicePath)) {
      console.log(`   ✅ USB: ${devicePath} - Device exists`);
    } else {
      console.log(`   ❌ USB: ${devicePath} - Device not found`);
      console.log(`      Tip: Check 'ls /dev/usb/' for available devices`);
    }
  }
}

// Start the agent
printBanner();

// Log API key status
if (CONFIG.API_KEY) {
  console.log('🔑 Using API key authentication');
} else {
  console.log('🌐 Running in public mode (no API key)');
}

// Main startup function
async function startAgent() {
  // Test API connectivity first
  const apiReachable = await testApiConnection();
  if (!apiReachable) {
    console.log('\n⚠️  API server not reachable. Will retry in background...\n');
  }

  // Optional: Test printer connections on startup
  if (process.argv.includes('--test')) {
    testPrinterConnections();
    await testUSBPrinter();
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('\nStarting polling...\n');
  }

  // Refresh printer config from cloud
  refreshPrinterConfigFromCloud();
  setInterval(refreshPrinterConfigFromCloud, CONFIG.PRINTER_CONFIG_REFRESH_INTERVAL);
  
  // Status reporting at longer intervals to reduce requests
  setInterval(reportPrinterStatuses, CONFIG.STATUS_REPORT_INTERVAL);
  reportPrinterStatuses();
  
  console.log(`🟢 Long-poll loop starting (hold=${LONG_POLL_WAIT / 1000}s, batch=${BATCH_SIZE}). ~2 req/min when idle, instant on new job.\n`);

  // Start the long-polling loop (runs forever)
  pollLoop();
}

startAgent();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🔴 Shutting down bridge agent...');
  console.log(`   Jobs processed: ${jobsProcessed}`);
  console.log(`   Jobs failed: ${jobsFailed}`);
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});


