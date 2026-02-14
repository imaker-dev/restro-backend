/**
 * Printer Service
 * Handles print job queue for KOT, BOT, Bills
 * Supports local bridge agent polling pattern
 */

const { getPool } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { pubsub } = require('../config/redis');
const logger = require('../utils/logger');
const crypto = require('crypto');
const net = require('net');

const printerService = {
  // ========================
  // PRINTER MANAGEMENT
  // ========================

  async createPrinter(data) {
    const pool = getPool();
    const uuid = uuidv4();
    const code = data.code || `PRN${Date.now().toString(36).toUpperCase()}`;

    const [result] = await pool.query(
      `INSERT INTO printers (
        uuid, outlet_id, name, code, printer_type, station,
        counter_id, kitchen_station_id, ip_address, port,
        connection_type, paper_width, characters_per_line,
        supports_cash_drawer, supports_cutter, supports_logo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid, data.outletId, data.name, code, data.printerType || 'kot',
        data.station, data.counterId, data.kitchenStationId,
        data.ipAddress, data.port || 9100, data.connectionType || 'network',
        data.paperWidth || '80mm', data.charactersPerLine || 48,
        data.supportsCashDrawer || false, data.supportsCutter !== false,
        data.supportsLogo || false
      ]
    );

    return { id: result.insertId, uuid, code };
  },

  async getPrinters(outletId, filters = {}) {
    const pool = getPool();
    let query = `SELECT * FROM printers WHERE outlet_id = ?`;
    const params = [outletId];

    if (filters.station) {
      query += ` AND station = ?`;
      params.push(filters.station);
    }
    if (filters.printerType) {
      query += ` AND printer_type = ?`;
      params.push(filters.printerType);
    }
    if (filters.isActive !== undefined) {
      query += ` AND is_active = ?`;
      params.push(filters.isActive);
    }

    query += ` ORDER BY name`;
    const [printers] = await pool.query(query, params);
    return printers;
  },

  async getPrinterById(id) {
    const pool = getPool();
    const [printers] = await pool.query('SELECT * FROM printers WHERE id = ?', [id]);
    return printers[0];
  },

  async getPrinterByStation(outletId, station) {
    const pool = getPool();
    const [printers] = await pool.query(
      `SELECT * FROM printers WHERE outlet_id = ? AND station = ? AND is_active = 1 LIMIT 1`,
      [outletId, station]
    );
    return printers[0];
  },

  async updatePrinter(id, data) {
    const pool = getPool();
    const updates = [];
    const params = [];

    const fields = ['name', 'station', 'ip_address', 'port', 'paper_width', 
                    'characters_per_line', 'supports_cash_drawer', 'supports_cutter',
                    'supports_logo', 'is_active'];
    
    for (const field of fields) {
      const camelField = field.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      if (data[camelField] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(data[camelField]);
      }
    }

    if (updates.length === 0) return;

    params.push(id);
    await pool.query(`UPDATE printers SET ${updates.join(', ')} WHERE id = ?`, params);
  },

  async updatePrinterStatus(id, isOnline) {
    const pool = getPool();
    await pool.query(
      `UPDATE printers SET is_online = ?, last_seen_at = NOW() WHERE id = ?`,
      [isOnline, id]
    );
  },

  // ========================
  // PRINT JOB QUEUE
  // ========================

  async createPrintJob(data) {
    const pool = getPool();
    const uuid = uuidv4();

    // Find appropriate printer for this station
    let printerId = data.printerId;
    if (!printerId && data.station) {
      const printer = await this.getPrinterByStation(data.outletId, data.station);
      printerId = printer?.id;
    }

    const [result] = await pool.query(
      `INSERT INTO print_jobs (
        uuid, outlet_id, printer_id, job_type, station,
        kot_id, order_id, invoice_id, content, content_type,
        reference_number, table_number, priority, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid, data.outletId, printerId, data.jobType, data.station,
        data.kotId, data.orderId, data.invoiceId, data.content,
        data.contentType || 'text', data.referenceNumber,
        data.tableNumber, data.priority || 0, data.createdBy
      ]
    );

    const jobId = result.insertId;

    // Log creation
    await pool.query(
      `INSERT INTO print_job_logs (print_job_id, action, details) VALUES (?, 'created', ?)`,
      [jobId, JSON.stringify({ station: data.station, type: data.jobType })]
    );

    // Notify bridges via pub/sub
    pubsub.publish('print:new_job', {
      outletId: data.outletId,
      station: data.station,
      jobId,
      jobType: data.jobType,
      referenceNumber: data.referenceNumber
    });

    logger.info(`Print job created: ${uuid} for ${data.station}`);
    return { id: jobId, uuid };
  },

  async getPendingJobs(outletId, station, limit = 10) {
    const pool = getPool();
    
    const [jobs] = await pool.query(
      `SELECT pj.*, p.name as printer_name, p.ip_address, p.port
       FROM print_jobs pj
       LEFT JOIN printers p ON pj.printer_id = p.id
       WHERE pj.outlet_id = ? 
         AND pj.station = ?
         AND pj.status = 'pending'
         AND pj.attempts < pj.max_attempts
       ORDER BY pj.priority DESC, pj.created_at ASC
       LIMIT ?`,
      [outletId, station, limit]
    );

    return jobs;
  },

  async getNextPendingJob(outletId, station) {
    const pool = getPool();
    
    const [jobs] = await pool.query(
      `SELECT pj.*, p.name as printer_name, p.ip_address, p.port
       FROM print_jobs pj
       LEFT JOIN printers p ON pj.printer_id = p.id
       WHERE pj.outlet_id = ? 
         AND pj.station = ?
         AND pj.status = 'pending'
         AND pj.attempts < pj.max_attempts
       ORDER BY pj.priority DESC, pj.created_at ASC
       LIMIT 1`,
      [outletId, station]
    );

    if (jobs[0]) {
      // Mark as processing
      await pool.query(
        `UPDATE print_jobs SET status = 'processing', processed_at = NOW(), attempts = attempts + 1 WHERE id = ?`,
        [jobs[0].id]
      );
    }

    return jobs[0] || null;
  },

  async markJobPrinted(jobId, bridgeId = null) {
    const pool = getPool();

    await pool.query(
      `UPDATE print_jobs SET status = 'printed', printed_at = NOW() WHERE id = ?`,
      [jobId]
    );

    await pool.query(
      `INSERT INTO print_job_logs (print_job_id, action, bridge_id) VALUES (?, 'printed', ?)`,
      [jobId, bridgeId]
    );

    // Update bridge stats
    if (bridgeId) {
      await pool.query(
        `UPDATE printer_bridges SET total_jobs_printed = total_jobs_printed + 1, last_poll_at = NOW() WHERE id = ?`,
        [bridgeId]
      );
    }

    logger.info(`Print job ${jobId} marked as printed`);
  },

  async markJobFailed(jobId, error, bridgeId = null) {
    const pool = getPool();

    const [job] = await pool.query('SELECT attempts, max_attempts FROM print_jobs WHERE id = ?', [jobId]);
    
    const newStatus = job[0].attempts >= job[0].max_attempts ? 'failed' : 'pending';

    await pool.query(
      `UPDATE print_jobs SET status = ?, last_error = ? WHERE id = ?`,
      [newStatus, error, jobId]
    );

    await pool.query(
      `INSERT INTO print_job_logs (print_job_id, action, details, bridge_id) VALUES (?, 'failed', ?, ?)`,
      [jobId, error, bridgeId]
    );

    if (bridgeId) {
      await pool.query(
        `UPDATE printer_bridges SET failed_jobs = failed_jobs + 1 WHERE id = ?`,
        [bridgeId]
      );
    }
  },

  async cancelJob(jobId, reason) {
    const pool = getPool();

    await pool.query(
      `UPDATE print_jobs SET status = 'cancelled' WHERE id = ?`,
      [jobId]
    );

    await pool.query(
      `INSERT INTO print_job_logs (print_job_id, action, details) VALUES (?, 'cancelled', ?)`,
      [jobId, reason]
    );
  },

  async retryJob(jobId) {
    const pool = getPool();

    await pool.query(
      `UPDATE print_jobs SET status = 'pending', attempts = 0 WHERE id = ?`,
      [jobId]
    );

    await pool.query(
      `INSERT INTO print_job_logs (print_job_id, action) VALUES (?, 'retried')`,
      [jobId]
    );
  },

  // ========================
  // BRIDGE MANAGEMENT
  // ========================

  async createBridge(data) {
    const pool = getPool();
    const uuid = uuidv4();
    const apiKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    const [result] = await pool.query(
      `INSERT INTO printer_bridges (
        uuid, outlet_id, name, bridge_code, api_key, assigned_stations
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuid, data.outletId, data.name, data.bridgeCode,
        hashedKey, JSON.stringify(data.assignedStations || [])
      ]
    );

    return { 
      id: result.insertId, 
      uuid, 
      bridgeCode: data.bridgeCode,
      apiKey // Return plain key only on creation
    };
  },

  async validateBridgeApiKey(outletId, bridgeCode, apiKey) {
    const pool = getPool();
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    const [bridges] = await pool.query(
      `SELECT * FROM printer_bridges 
       WHERE outlet_id = ? AND bridge_code = ? AND api_key = ? AND is_active = 1`,
      [outletId, bridgeCode, hashedKey]
    );

    if (bridges[0]) {
      // Update last seen
      await pool.query(
        `UPDATE printer_bridges SET is_online = 1, last_poll_at = NOW() WHERE id = ?`,
        [bridges[0].id]
      );
    }

    return bridges[0] || null;
  },

  async getBridges(outletId) {
    const pool = getPool();
    const [bridges] = await pool.query(
      `SELECT id, uuid, outlet_id, name, bridge_code, assigned_stations,
              is_active, is_online, last_poll_at, total_jobs_printed, failed_jobs,
              created_at
       FROM printer_bridges WHERE outlet_id = ?`,
      [outletId]
    );
    return bridges;
  },

  async updateBridgeStatus(bridgeId, isOnline, lastIp = null) {
    const pool = getPool();
    await pool.query(
      `UPDATE printer_bridges SET is_online = ?, last_poll_at = NOW(), last_ip = ? WHERE id = ?`,
      [isOnline, lastIp, bridgeId]
    );
  },

  // ========================
  // CONTENT FORMATTING
  // ========================

  formatKotContent(kotData) {
    const lines = [];
    const w = 42;
    const dash = '-'.repeat(w);
    const cmd = this.getEscPosCommands();

    const title = kotData.station === 'bar' ? 'BAR ORDER (BOT)' : 'KITCHEN ORDER (KOT)';
    lines.push(cmd.ALIGN_CENTER + cmd.BOLD_ON + title);
    lines.push(cmd.BOLD_OFF + cmd.ALIGN_LEFT + 'KOT#: ' + kotData.kotNumber);
    lines.push(this.padBetween('Table: ' + (kotData.tableNumber || 'Takeaway'), kotData.time || '', w));
    lines.push(dash);

    for (const item of kotData.items || []) {
      const tag = item.itemType ? ` [${item.itemType.toUpperCase()}]` : '';
      lines.push(`${item.quantity} x ${item.itemName || ''}${tag}`);
      if (item.variantName) lines.push(`  (${item.variantName})`);
      if (item.addonsText) lines.push(`  + ${item.addonsText}`);
      if (item.instructions) lines.push(`  >> ${item.instructions}`);
    }

    lines.push(dash);
    lines.push('Captain: ' + (kotData.captainName || 'N/A'));
    lines.push(dash);

    return lines.join('\n');
  },

  formatCancelSlipContent(cancelData) {
    const lines = [];
    const w = 42;
    const dash = '-'.repeat(w);
    const cmd = this.getEscPosCommands();

    lines.push(cmd.ALIGN_CENTER + cmd.BOLD_ON + '*** CANCEL ***');
    lines.push(cmd.BOLD_OFF + cmd.ALIGN_LEFT + 'Order#: ' + (cancelData.orderNumber || 'N/A'));
    lines.push(this.padBetween(
      'Table: ' + (cancelData.tableNumber || 'Takeaway'),
      cancelData.kotNumber ? 'KOT#: ' + cancelData.kotNumber : '', w
    ));
    lines.push('Time: ' + (cancelData.time || ''));
    lines.push(dash);

    for (const item of cancelData.items || []) {
      const tag = item.itemType ? ` [${item.itemType.toUpperCase()}]` : '';
      lines.push(`${item.quantity} x ${item.itemName || ''}${tag}`);
      if (item.variantName) lines.push(`  (${item.variantName})`);
    }

    lines.push(dash);
    lines.push('Reason: ' + (cancelData.reason || 'N/A'));
    lines.push('Cancelled By: ' + (cancelData.cancelledBy || 'Staff'));
    lines.push(dash);

    return lines.join('\n');
  },

  async printCancelSlip(cancelData, userId) {
    const content = this.formatCancelSlipContent(cancelData);
    const station = cancelData.station || 'kitchen';

    return this.createPrintJob({
      outletId: cancelData.outletId,
      jobType: 'cancel_slip',
      station,
      orderId: cancelData.orderId,
      content: this.wrapWithEscPos(content, { beep: true }),
      contentType: 'escpos',
      referenceNumber: cancelData.orderNumber,
      tableNumber: cancelData.tableNumber,
      priority: 10,
      createdBy: userId
    });
  },

  async printCancelSlipDirect(cancelData, printerIp, printerPort = 9100) {
    const content = this.formatCancelSlipContent(cancelData);
    const escposData = this.wrapWithEscPos(content, { beep: true });

    try {
      const result = await this.printDirect(printerIp, printerPort, escposData);
      logger.info(`Cancel slip printed directly to ${printerIp}:${printerPort}`);
      return result;
    } catch (error) {
      logger.error(`Direct cancel slip print failed:`, error.message);
      throw error;
    }
  },

  formatBillContent(billData) {
    const lines = [];
    const w = 42;
    const dash = '-'.repeat(w);
    const cmd = this.getEscPosCommands();

    // Duplicate header (centered)
    if (billData.isDuplicate) {
      lines.push(cmd.ALIGN_CENTER + 'Duplicate');
      if (billData.duplicateNumber) {
        lines.push('Copy #' + billData.duplicateNumber);
      }
    }

    // Restaurant name (bold + double height, centered)
    lines.push(cmd.ALIGN_CENTER + cmd.BOLD_ON + cmd.DOUBLE_HEIGHT + (billData.outletName || 'Restaurant'));

    // Address, phone, gstin (centered, normal size)
    const infoLines = [];
    if (billData.outletAddress) infoLines.push('Add.' + billData.outletAddress);
    if (billData.outletPhone) infoLines.push('Mob.' + billData.outletPhone);
    if (billData.outletGstin) infoLines.push('GSTIN: ' + billData.outletGstin);
    if (infoLines.length > 0) {
      lines.push(cmd.NORMAL + cmd.BOLD_OFF + infoLines[0]);
      for (let i = 1; i < infoLines.length; i++) lines.push(infoLines[i]);
    } else {
      lines.push(cmd.NORMAL + cmd.BOLD_OFF);
    }

    // Switch to left alignment
    lines.push(cmd.ALIGN_LEFT + dash);

    // Date/time + order type/table (order label bold)
    const orderLabel = billData.orderType === 'dine_in'
      ? 'Dine In: ' + (billData.tableNumber || '')
      : (billData.orderType === 'takeaway' ? 'Takeaway' : (billData.orderType || 'Takeaway'));
    const datePart = 'Date: ' + (billData.date || '');
    const dateSpace = Math.max(1, w - datePart.length - orderLabel.length);
    lines.push(datePart + ' '.repeat(dateSpace) + cmd.BOLD_ON + orderLabel + cmd.BOLD_OFF);
    lines.push(billData.time || '');

    // Cashier + bill number
    const cashier = 'Cashier: ' + (billData.cashierName || 'Staff');
    const billNo = 'Bill No.: ' + (billData.invoiceNumber || '');
    if (cashier.length + billNo.length + 1 <= w) {
      lines.push(this.padBetween(cashier, billNo, w));
    } else {
      lines.push(cashier);
      lines.push(billNo);
    }
    lines.push(dash);

    // Item column header: Item | Qty | Price | Amount
    const cQ = 4, cP = 8, cA = 9;
    const cN = w - cQ - cP - cA;
    lines.push(
      'Item'.padEnd(cN) +
      this.rAlign('Qty.', cQ) +
      this.rAlign('Price', cP) +
      this.rAlign('Amount', cA)
    );
    lines.push(dash);

    // Items (preserve original case)
    let totalQty = 0;
    for (const item of billData.items || []) {
      const qty = parseInt(item.quantity) || 0;
      totalQty += qty;
      const cols =
        this.rAlign(qty.toString(), cQ) +
        this.rAlign(parseFloat(item.unitPrice).toFixed(2), cP) +
        this.rAlign(parseFloat(item.totalPrice).toFixed(2), cA);
      const name = item.itemName || '';

      if (name.length <= cN) {
        lines.push(name.padEnd(cN) + cols);
      } else {
        const wrapped = this.wrapText(name, cN);
        for (let i = 0; i < wrapped.length - 1; i++) lines.push(wrapped[i]);
        const last = wrapped[wrapped.length - 1] || '';
        lines.push(last.padEnd(cN) + cols);
      }
    }
    lines.push(dash);

    // Total qty + subtotal
    lines.push(this.padBetween('Total Qty: ' + totalQty, 'Sub ' + billData.subtotal, w));

    // Taxes (UPPERCASE base name, strip embedded rate)
    for (const tax of billData.taxes || []) {
      const baseName = (tax.name || 'Tax').replace(/\s*[\d.]+%?/g, '').trim().toUpperCase();
      const label = baseName + '@' + tax.rate + '%';
      lines.push(this.padBetween(label, tax.amount, w));
    }

    // Service charge
    if (billData.serviceCharge) {
      lines.push(this.padBetween('Service Charge:', billData.serviceCharge, w));
    }

    // Discount
    if (billData.discount) {
      lines.push(this.padBetween('Discount:', '-' + billData.discount, w));
    }

    lines.push(dash);

    // Round off
    if (billData.roundOff && parseFloat(billData.roundOff) !== 0) {
      lines.push(this.padBetween('Round Off', billData.roundOff, w));
      lines.push(dash);
    }

    // Grand total (bold + double height, centered)
    lines.push(cmd.ALIGN_CENTER + cmd.BOLD_ON + cmd.DOUBLE_HEIGHT + 'Grand Total \u20B9 ' + billData.grandTotal);
    lines.push(cmd.NORMAL + cmd.BOLD_OFF + cmd.ALIGN_LEFT + dash);

    // Payment mode
    if (billData.paymentMode) {
      lines.push(cmd.ALIGN_CENTER + 'Paid: ' + billData.paymentMode.toUpperCase());
    }

    // Footer
    lines.push(cmd.ALIGN_CENTER + 'THANKS VISIT AGAIN');

    return lines.join('\n');
  },

  centerText(text, width) {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  },

  padBetween(left, right, width) {
    const l = left.toString();
    const r = right.toString();
    const pad = Math.max(1, width - l.length - r.length);
    return l + ' '.repeat(pad) + r;
  },

  rAlign(text, width) {
    const s = text.toString();
    return s.length >= width ? s : ' '.repeat(width - s.length) + s;
  },

  wrapText(text, maxWidth) {
    if (text.length <= maxWidth) return [text];
    const words = text.split(' ');
    const result = [];
    let line = '';
    for (const word of words) {
      if (line.length + word.length + (line ? 1 : 0) <= maxWidth) {
        line += (line ? ' ' : '') + word;
      } else {
        if (line) result.push(line);
        line = word.length > maxWidth ? word.substring(0, maxWidth) : word;
      }
    }
    if (line) result.push(line);
    return result.length ? result : [''];
  },

  // ========================
  // ESC/POS COMMANDS
  // ========================

  getEscPosCommands() {
    return {
      INIT: '\x1B\x40',              // Initialize printer
      BOLD_ON: '\x1B\x45\x01',       // Bold on
      BOLD_OFF: '\x1B\x45\x00',      // Bold off
      ALIGN_LEFT: '\x1B\x61\x00',    // Align left
      ALIGN_CENTER: '\x1B\x61\x01', // Align center
      ALIGN_RIGHT: '\x1B\x61\x02',  // Align right
      DOUBLE_HEIGHT: '\x1B\x21\x10', // Double height
      NORMAL: '\x1B\x21\x00',        // Normal text
      FEED_LINES: '\x1B\x64\x05',    // Feed 5 lines
      CUT: '\x1D\x56\x00',           // Full cut
      PARTIAL_CUT: '\x1D\x56\x01',   // Partial cut
      OPEN_DRAWER: '\x1B\x70\x00\x19\xFA', // Open cash drawer
      BEEP: '\x1B\x42\x03\x02'       // Beep 3 times
    };
  },

  wrapWithEscPos(content, options = {}) {
    const cmd = this.getEscPosCommands();
    let output = cmd.INIT;

    if (options.beep) {
      output += cmd.BEEP;
    }

    output += content;
    output += cmd.FEED_LINES;

    if (options.cut !== false) {
      output += options.partialCut ? cmd.PARTIAL_CUT : cmd.CUT;
    }

    if (options.openDrawer) {
      output += cmd.OPEN_DRAWER;
    }

    return output;
  },

  // ========================
  // HIGH-LEVEL PRINT METHODS
  // ========================

  async printKot(kotData, userId) {
    const content = this.formatKotContent(kotData);
    const station = kotData.station || 'kitchen';

    return this.createPrintJob({
      outletId: kotData.outletId,
      jobType: station === 'bar' ? 'bot' : 'kot',
      station,
      kotId: kotData.kotId,
      orderId: kotData.orderId,
      content: this.wrapWithEscPos(content, { beep: true }),
      contentType: 'escpos',
      referenceNumber: kotData.kotNumber,
      tableNumber: kotData.tableNumber,
      priority: 10, // KOTs are high priority
      createdBy: userId
    });
  },

  async printBill(billData, userId) {
    const content = this.formatBillContent(billData);

    return this.createPrintJob({
      outletId: billData.outletId,
      jobType: billData.isDuplicate ? 'duplicate_bill' : 'bill',
      station: 'bill',
      orderId: billData.orderId,
      invoiceId: billData.invoiceId,
      content: this.wrapWithEscPos(content, { openDrawer: billData.openDrawer }),
      contentType: 'escpos',
      referenceNumber: billData.invoiceNumber,
      tableNumber: billData.tableNumber,
      priority: 5,
      createdBy: userId
    });
  },

  async openCashDrawer(outletId, userId) {
    const cmd = this.getEscPosCommands();
    
    return this.createPrintJob({
      outletId,
      jobType: 'cash_drawer',
      station: 'cashier',
      content: cmd.INIT + cmd.OPEN_DRAWER,
      contentType: 'escpos',
      referenceNumber: 'DRAWER',
      priority: 15, // Highest priority
      createdBy: userId
    });
  },

  async printTestPage(outletId, station, userId) {
    const content = [
      '================================',
      '        PRINTER TEST PAGE',
      '================================',
      '',
      `Station: ${station}`,
      `Time: ${new Date().toLocaleString()}`,
      '',
      'If you can read this,',
      'the printer is working correctly!',
      '',
      '================================'
    ].join('\n');

    return this.createPrintJob({
      outletId,
      jobType: 'test',
      station,
      content: this.wrapWithEscPos(content),
      contentType: 'escpos',
      referenceNumber: 'TEST',
      createdBy: userId
    });
  },

  // ========================
  // STATS & MONITORING
  // ========================

  // ========================
  // DIRECT NETWORK PRINTING
  // ========================

  /**
   * Send data directly to a network printer via TCP
   * @param {string} ipAddress - Printer IP address
   * @param {number} port - Printer port (default 9100)
   * @param {string|Buffer} data - ESC/POS data to print
   * @param {number} timeout - Connection timeout in ms (default 5000)
   */
  async printDirect(ipAddress, port = 9100, data, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let connected = false;

      const timeoutId = setTimeout(() => {
        if (!connected) {
          client.destroy();
          reject(new Error(`Connection timeout to printer ${ipAddress}:${port}`));
        }
      }, timeout);

      client.connect(port, ipAddress, () => {
        connected = true;
        clearTimeout(timeoutId);
        logger.info(`Connected to printer ${ipAddress}:${port}`);
        
        client.write(data, (err) => {
          if (err) {
            client.destroy();
            reject(err);
          } else {
            // Give printer time to process before closing
            setTimeout(() => {
              client.end();
              resolve({ success: true, message: 'Print job sent successfully' });
            }, 100);
          }
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeoutId);
        logger.error(`Printer error ${ipAddress}:${port}:`, err.message);
        reject(new Error(`Printer connection failed: ${err.message}`));
      });

      client.on('close', () => {
        logger.info(`Disconnected from printer ${ipAddress}:${port}`);
      });
    });
  },

  /**
   * Print KOT directly to network printer
   */
  async printKotDirect(kotData, printerIp, printerPort = 9100) {
    const content = this.formatKotContent(kotData);
    const escposData = this.wrapWithEscPos(content, { beep: true });
    
    try {
      const result = await this.printDirect(printerIp, printerPort, escposData);
      logger.info(`KOT ${kotData.kotNumber} printed directly to ${printerIp}:${printerPort}`);
      return result;
    } catch (error) {
      logger.error(`Direct KOT print failed for ${kotData.kotNumber}:`, error.message);
      throw error;
    }
  },

  /**
   * Print Bill directly to network printer
   */
  async printBillDirect(billData, printerIp, printerPort = 9100) {
    const content = this.formatBillContent(billData);
    const escposData = this.wrapWithEscPos(content, { openDrawer: billData.openDrawer });
    
    try {
      const result = await this.printDirect(printerIp, printerPort, escposData);
      logger.info(`Bill ${billData.invoiceNumber} printed directly to ${printerIp}:${printerPort}`);
      return result;
    } catch (error) {
      logger.error(`Direct Bill print failed for ${billData.invoiceNumber}:`, error.message);
      throw error;
    }
  },

  /**
   * Test printer connectivity
   */
  async testPrinterConnection(ipAddress, port = 9100) {
    return new Promise((resolve) => {
      const client = new net.Socket();
      const timeout = setTimeout(() => {
        client.destroy();
        resolve({ success: false, message: 'Connection timeout' });
      }, 3000);

      client.connect(port, ipAddress, () => {
        clearTimeout(timeout);
        client.end();
        resolve({ success: true, message: 'Printer is reachable' });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, message: err.message });
      });
    });
  },

  async getJobStats(outletId, date = null) {
    const pool = getPool();
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const [stats] = await pool.query(
      `SELECT 
         station,
         job_type,
         status,
         COUNT(*) as count
       FROM print_jobs
       WHERE outlet_id = ? AND DATE(created_at) = ?
       GROUP BY station, job_type, status`,
      [outletId, targetDate]
    );

    const [pendingCount] = await pool.query(
      `SELECT COUNT(*) as count FROM print_jobs 
       WHERE outlet_id = ? AND status = 'pending'`,
      [outletId]
    );

    return {
      date: targetDate,
      pending: pendingCount[0].count,
      breakdown: stats
    };
  }
};

module.exports = printerService;
