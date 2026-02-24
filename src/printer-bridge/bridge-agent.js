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

// ========================
// CONFIGURATION
// ========================

const CONFIG = {
  // Cloud server URL (your backend API)
  // CLOUD_URL: process.env.CLOUD_URL || 'http://localhost:3005',
  CLOUD_URL: process.env.CLOUD_URL || 'https://restro-backend.imaker.in',
  
  // Outlet ID from your system
  OUTLET_ID: process.env.OUTLET_ID || '34',
  
  // Bridge code (created via API: POST /api/v1/printers/bridges)
  BRIDGE_CODE: process.env.BRIDGE_CODE || 'KITCHEN-BRIDGE-1',
  
  // API key (provided when bridge was created via API)
  API_KEY: process.env.API_KEY || '855242e269ca0ba825f22a58306ee63bef7d4f75c710ee8d081c24e474989509',
  
  // Polling interval in milliseconds
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL) || 2000,

  // How often to report local printer status to cloud
  STATUS_REPORT_INTERVAL: parseInt(process.env.STATUS_REPORT_INTERVAL) || 15000,

  // How often to refresh printer mapping from DB
  PRINTER_CONFIG_REFRESH_INTERVAL: parseInt(process.env.PRINTER_CONFIG_REFRESH_INTERVAL) || 30000,
  
  // Printers configuration - map stations to printer IP/port
  // Update these IPs to match your local network printers
  PRINTERS: {
    kot_kitchen: { ip: '192.168.1.13', port: 9100 },
    kot_bar: { ip: '192.168.1.13', port: 9100 },
    bill: { ip: '192.168.1.13', port: 9100 },
    kitchen: { ip: '192.168.1.13', port: 9100 },
    test: { ip: '192.168.1.13', port: 9100 },
    bar: { ip: '192.168.1.13', port: 9100 },
    cashier: { ip: '192.168.1.13', port: 9100 },
    dessert: { ip: '192.168.1.13', port: 9100 }
  },
  
  // Fallback printer if station not found
  DEFAULT_PRINTER: { ip: '192.168.1.13', port: 9100 }
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
 * Send raw data to thermal printer via TCP socket
 */
function sendToPrinter(printerIp, printerPort, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let connected = false;
    
    // Set timeout
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
 * Get printer config for a station
 */
function getPrinterForStation(station) {
  return CONFIG.PRINTERS[station] || CONFIG.DEFAULT_PRINTER;
}

// ========================
// API COMMUNICATION
// ========================

const api = axios.create({
  baseURL: CONFIG.CLOUD_URL,
  headers: {
    'x-api-key': CONFIG.API_KEY,
    Authorization: `Bearer ${CONFIG.API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 15000
});

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
 * Acknowledge job completion
 */
async function acknowledgeJob(jobId, status, error = null) {
  try {
    await api.post(
      `/api/v1/printers/bridge/${CONFIG.OUTLET_ID}/${CONFIG.BRIDGE_CODE}/jobs/${jobId}/ack`,
      { status, error }
    );
  } catch (err) {
    console.error(`  Failed to acknowledge job ${jobId}:`, err.message);
  }
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

  const statuses = await Promise.all(
    printerEntries.map(async ([station, printer]) => {
      const result = await testPrinterConnection(printer.ip, printer.port);
      return {
        station,
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
        port: Number.isInteger(port) ? port : 9100
      };
    }

    const stations = Object.keys(normalizedPrinters);
    if (stations.length === 0) {
      console.log('⚠️  No active printer mappings returned from DB. Keeping existing local configuration.');
      return;
    }

    CONFIG.PRINTERS = normalizedPrinters;
    CONFIG.DEFAULT_PRINTER = normalizedPrinters[stations[0]];
    console.log(`🔄 Printer config refreshed from DB (${stations.length} station mappings).`);
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    console.error(`Printer config refresh failed: ${message}`);
  }
}

// ========================
// MAIN LOOP
// ========================

let isProcessing = false;
let jobsProcessed = 0;
let jobsFailed = 0;

async function processNextJob() {
  if (isProcessing) return;
  isProcessing = true;
  
  try {
    const result = await pollForJob();
    
    if (!result.success || !result.data) {
      // No pending jobs
      isProcessing = false;
      return;
    }
    
    const job = result.data;
    console.log(`\n📄 Processing job #${job.id}: ${job.job_type} for ${job.station}`);
    console.log(`   Reference: ${job.reference_number || 'N/A'}`);
    
    // Get printer for this station
    const printer = getPrinterForStation(job.station);
    console.log(`   Printer: ${printer.ip}:${printer.port}`);
    
    try {
      // Send to printer
      await sendToPrinter(printer.ip, printer.port, job.content);
      
      // Report success
      await acknowledgeJob(job.id, 'printed');
      
      jobsProcessed++;
      console.log(`   ✅ Printed successfully (Total: ${jobsProcessed})`);
      
    } catch (printError) {
      // Report failure
      await acknowledgeJob(job.id, 'failed', printError.message);
      
      jobsFailed++;
      console.log(`   ❌ Print failed: ${printError.message} (Failed: ${jobsFailed})`);
    }
    
  } catch (error) {
    if (error.code !== 'ECONNREFUSED') {
      console.error('Poll error:', error.message);
    }
  }
  
  isProcessing = false;
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
  console.log(`║  Poll Interval: ${(CONFIG.POLL_INTERVAL + 'ms').padEnd(41)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Configured Printers:                                    ║');
  
  for (const [station, printer] of Object.entries(CONFIG.PRINTERS)) {
    const line = `${station}: ${printer.ip}:${printer.port}`;
    console.log(`║    - ${line.padEnd(52)}║`);
  }
  
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('🟢 Bridge agent started. Polling for print jobs...');
  console.log('   Press Ctrl+C to stop.\n');
}

function testPrinterConnections() {
  console.log('🔍 Testing printer connections...\n');
  
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

// Start the agent
if (!CONFIG.API_KEY) {
  console.error('Missing API_KEY. Set API_KEY in environment before starting bridge-agent.');
  process.exit(1);
}

printBanner();

// Optional: Test printer connections on startup
if (process.argv.includes('--test')) {
  testPrinterConnections();
  setTimeout(() => {
    console.log('\nStarting polling...\n');
    refreshPrinterConfigFromCloud();
    setInterval(refreshPrinterConfigFromCloud, CONFIG.PRINTER_CONFIG_REFRESH_INTERVAL);
    setInterval(processNextJob, CONFIG.POLL_INTERVAL);
    setInterval(reportPrinterStatuses, CONFIG.STATUS_REPORT_INTERVAL);
    reportPrinterStatuses();
  }, 5000);
} else {
  refreshPrinterConfigFromCloud();
  setInterval(refreshPrinterConfigFromCloud, CONFIG.PRINTER_CONFIG_REFRESH_INTERVAL);
  setInterval(processNextJob, CONFIG.POLL_INTERVAL);
  setInterval(reportPrinterStatuses, CONFIG.STATUS_REPORT_INTERVAL);
  reportPrinterStatuses();
}

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


