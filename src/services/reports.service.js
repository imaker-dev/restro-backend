/**
 * Reports Service
 * Aggregated reports - Staff, Table, Counter, Item, Sales
 * Never read raw orders - always use aggregated tables
 */

const { getPool } = require('../database');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

const reportsService = {
  // ========================
  // DAILY SALES AGGREGATION
  // ========================

  /**
   * Aggregate daily sales (run at end of day or on-demand)
   */
  async aggregateDailySales(outletId, reportDate = null) {
    const pool = getPool();
    const date = reportDate || new Date().toISOString().slice(0, 10);

    // Get order totals
    const [orderStats] = await pool.query(
      `SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN order_type = 'dine_in' THEN 1 END) as dine_in_orders,
        COUNT(CASE WHEN order_type = 'takeaway' THEN 1 END) as takeaway_orders,
        COUNT(CASE WHEN order_type = 'delivery' THEN 1 END) as delivery_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        SUM(guest_count) as total_guests,
        SUM(subtotal) as gross_sales,
        SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as net_sales,
        SUM(discount_amount) as discount_amount,
        SUM(tax_amount) as tax_amount,
        SUM(service_charge) as service_charge,
        SUM(packaging_charge) as packaging_charge,
        SUM(delivery_charge) as delivery_charge,
        SUM(round_off) as round_off
       FROM orders 
       WHERE outlet_id = ? AND DATE(created_at) = ? AND status != 'cancelled'`,
      [outletId, date]
    );

    // Get payment totals
    const [paymentStats] = await pool.query(
      `SELECT 
        SUM(total_amount) as total_collection,
        SUM(CASE WHEN payment_mode = 'cash' THEN total_amount ELSE 0 END) as cash_collection,
        SUM(CASE WHEN payment_mode = 'card' THEN total_amount ELSE 0 END) as card_collection,
        SUM(CASE WHEN payment_mode = 'upi' THEN total_amount ELSE 0 END) as upi_collection,
        SUM(CASE WHEN payment_mode = 'wallet' THEN total_amount ELSE 0 END) as wallet_collection,
        SUM(CASE WHEN payment_mode = 'credit' THEN total_amount ELSE 0 END) as credit_collection,
        SUM(tip_amount) as tip_amount
       FROM payments 
       WHERE outlet_id = ? AND DATE(created_at) = ? AND status = 'completed'`,
      [outletId, date]
    );

    // Get complimentary and refunds
    const [extras] = await pool.query(
      `SELECT 
        (SELECT SUM(total_amount) FROM orders WHERE outlet_id = ? AND DATE(created_at) = ? AND is_complimentary = 1) as complimentary_amount,
        (SELECT SUM(refund_amount) FROM refunds WHERE outlet_id = ? AND DATE(created_at) = ? AND status = 'approved') as refund_amount
      `,
      [outletId, date, outletId, date]
    );

    // Get peak hour
    const [peakHour] = await pool.query(
      `SELECT 
        HOUR(created_at) as hour,
        SUM(total_amount) as sales
       FROM orders 
       WHERE outlet_id = ? AND DATE(created_at) = ? AND status = 'paid'
       GROUP BY HOUR(created_at)
       ORDER BY sales DESC
       LIMIT 1`,
      [outletId, date]
    );

    const stats = orderStats[0];
    const payments = paymentStats[0];
    const ext = extras[0];

    const avgOrderValue = stats.total_orders > 0 ? stats.net_sales / stats.total_orders : 0;
    const avgGuestSpend = stats.total_guests > 0 ? stats.net_sales / stats.total_guests : 0;

    // Upsert daily sales
    await pool.query(
      `INSERT INTO daily_sales (
        outlet_id, report_date, total_orders, dine_in_orders, takeaway_orders, delivery_orders,
        cancelled_orders, total_guests, gross_sales, net_sales, discount_amount, tax_amount,
        service_charge, packaging_charge, delivery_charge, round_off,
        total_collection, cash_collection, card_collection, upi_collection, wallet_collection, credit_collection,
        complimentary_amount, refund_amount, tip_amount,
        average_order_value, average_guest_spend,
        peak_hour, peak_hour_sales, aggregated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        total_orders = VALUES(total_orders), dine_in_orders = VALUES(dine_in_orders),
        takeaway_orders = VALUES(takeaway_orders), delivery_orders = VALUES(delivery_orders),
        cancelled_orders = VALUES(cancelled_orders), total_guests = VALUES(total_guests),
        gross_sales = VALUES(gross_sales), net_sales = VALUES(net_sales),
        discount_amount = VALUES(discount_amount), tax_amount = VALUES(tax_amount),
        service_charge = VALUES(service_charge), packaging_charge = VALUES(packaging_charge),
        delivery_charge = VALUES(delivery_charge), round_off = VALUES(round_off),
        total_collection = VALUES(total_collection), cash_collection = VALUES(cash_collection),
        card_collection = VALUES(card_collection), upi_collection = VALUES(upi_collection),
        wallet_collection = VALUES(wallet_collection), credit_collection = VALUES(credit_collection),
        complimentary_amount = VALUES(complimentary_amount), refund_amount = VALUES(refund_amount),
        tip_amount = VALUES(tip_amount), average_order_value = VALUES(average_order_value),
        average_guest_spend = VALUES(average_guest_spend), peak_hour = VALUES(peak_hour),
        peak_hour_sales = VALUES(peak_hour_sales), aggregated_at = NOW()`,
      [
        outletId, date, stats.total_orders || 0, stats.dine_in_orders || 0,
        stats.takeaway_orders || 0, stats.delivery_orders || 0, stats.cancelled_orders || 0,
        stats.total_guests || 0, stats.gross_sales || 0, stats.net_sales || 0,
        stats.discount_amount || 0, stats.tax_amount || 0, stats.service_charge || 0,
        stats.packaging_charge || 0, stats.delivery_charge || 0, stats.round_off || 0,
        payments.total_collection || 0, payments.cash_collection || 0, payments.card_collection || 0,
        payments.upi_collection || 0, payments.wallet_collection || 0, payments.credit_collection || 0,
        ext.complimentary_amount || 0, ext.refund_amount || 0, payments.tip_amount || 0,
        avgOrderValue, avgGuestSpend,
        peakHour[0]?.hour ? `${peakHour[0].hour}:00` : null, peakHour[0]?.sales || 0
      ]
    );

    return { success: true, date };
  },

  // ========================
  // ITEM SALES AGGREGATION
  // ========================

  async aggregateItemSales(outletId, reportDate = null) {
    const pool = getPool();
    const date = reportDate || new Date().toISOString().slice(0, 10);

    const [items] = await pool.query(
      `SELECT 
        oi.item_id, oi.variant_id, oi.item_name, oi.variant_name,
        i.category_id, c.name as category_name,
        SUM(CASE WHEN oi.status != 'cancelled' THEN oi.quantity ELSE 0 END) as quantity_sold,
        SUM(CASE WHEN oi.status = 'cancelled' THEN oi.quantity ELSE 0 END) as quantity_cancelled,
        SUM(CASE WHEN oi.status != 'cancelled' THEN oi.total_price ELSE 0 END) as gross_amount,
        SUM(CASE WHEN oi.status != 'cancelled' THEN oi.discount_amount ELSE 0 END) as discount_amount,
        SUM(CASE WHEN oi.status != 'cancelled' THEN oi.tax_amount ELSE 0 END) as tax_amount,
        COUNT(DISTINCT oi.order_id) as order_count
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       JOIN items i ON oi.item_id = i.id
       LEFT JOIN categories c ON i.category_id = c.id
       WHERE o.outlet_id = ? AND DATE(o.created_at) = ?
       GROUP BY oi.item_id, oi.variant_id, oi.item_name, oi.variant_name, i.category_id, c.name`,
      [outletId, date]
    );

    for (const item of items) {
      const netAmount = item.gross_amount - item.discount_amount;
      const avgPrice = item.quantity_sold > 0 ? netAmount / item.quantity_sold : 0;

      await pool.query(
        `INSERT INTO item_sales (
          outlet_id, report_date, item_id, variant_id, item_name, variant_name,
          category_id, category_name, quantity_sold, quantity_cancelled,
          gross_amount, discount_amount, net_amount, tax_amount,
          order_count, average_price, aggregated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          quantity_sold = VALUES(quantity_sold), quantity_cancelled = VALUES(quantity_cancelled),
          gross_amount = VALUES(gross_amount), discount_amount = VALUES(discount_amount),
          net_amount = VALUES(net_amount), tax_amount = VALUES(tax_amount),
          order_count = VALUES(order_count), average_price = VALUES(average_price), aggregated_at = NOW()`,
        [
          outletId, date, item.item_id, item.variant_id, item.item_name, item.variant_name,
          item.category_id, item.category_name, item.quantity_sold, item.quantity_cancelled,
          item.gross_amount, item.discount_amount, netAmount, item.tax_amount,
          item.order_count, avgPrice
        ]
      );
    }

    return { success: true, itemCount: items.length };
  },

  // ========================
  // STAFF SALES AGGREGATION
  // ========================

  async aggregateStaffSales(outletId, reportDate = null) {
    const pool = getPool();
    const date = reportDate || new Date().toISOString().slice(0, 10);

    const [staff] = await pool.query(
      `SELECT 
        o.created_by as user_id, u.name as user_name,
        COUNT(*) as order_count,
        SUM(o.guest_count) as guest_count,
        SUM(CASE WHEN o.status = 'paid' THEN o.total_amount ELSE 0 END) as net_sales,
        SUM(o.discount_amount) as discount_given,
        SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        SUM(CASE WHEN o.status = 'cancelled' THEN o.total_amount ELSE 0 END) as cancelled_amount
       FROM orders o
       JOIN users u ON o.created_by = u.id
       WHERE o.outlet_id = ? AND DATE(o.created_at) = ?
       GROUP BY o.created_by, u.full_name`,
      [outletId, date]
    );

    // Get tips
    const [tips] = await pool.query(
      `SELECT p.received_by as user_id, SUM(p.tip_amount) as tips
       FROM payments p
       WHERE p.outlet_id = ? AND DATE(p.created_at) = ? AND p.status = 'completed'
       GROUP BY p.received_by`,
      [outletId, date]
    );
    const tipMap = {};
    tips.forEach(t => tipMap[t.user_id] = t.tips);

    for (const s of staff) {
      const avgOrderValue = s.order_count > 0 ? s.net_sales / s.order_count : 0;

      await pool.query(
        `INSERT INTO staff_sales (
          outlet_id, report_date, user_id, user_name,
          order_count, guest_count, net_sales, discount_given, tips_received,
          cancelled_orders, cancelled_amount, average_order_value, aggregated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          order_count = VALUES(order_count), guest_count = VALUES(guest_count),
          net_sales = VALUES(net_sales), discount_given = VALUES(discount_given),
          tips_received = VALUES(tips_received), cancelled_orders = VALUES(cancelled_orders),
          cancelled_amount = VALUES(cancelled_amount), average_order_value = VALUES(average_order_value),
          aggregated_at = NOW()`,
        [
          outletId, date, s.user_id, s.user_name,
          s.order_count, s.guest_count, s.net_sales, s.discount_given,
          tipMap[s.user_id] || 0, s.cancelled_orders, s.cancelled_amount, avgOrderValue
        ]
      );
    }

    return { success: true, staffCount: staff.length };
  },

  // ========================
  // REPORTS RETRIEVAL
  // ========================

  /**
   * Get daily sales report
   */
  async getDailySalesReport(outletId, startDate, endDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM daily_sales 
       WHERE outlet_id = ? AND report_date BETWEEN ? AND ?
       ORDER BY report_date DESC`,
      [outletId, startDate, endDate]
    );
    return rows;
  },

  /**
   * Get item sales report (top selling)
   */
  async getItemSalesReport(outletId, startDate, endDate, limit = 20) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        item_id, item_name, variant_name, category_name,
        SUM(quantity_sold) as total_quantity,
        SUM(net_amount) as total_revenue,
        SUM(order_count) as total_orders,
        AVG(average_price) as avg_price
       FROM item_sales 
       WHERE outlet_id = ? AND report_date BETWEEN ? AND ?
       GROUP BY item_id, item_name, variant_name, category_name
       ORDER BY total_quantity DESC
       LIMIT ?`,
      [outletId, startDate, endDate, limit]
    );
    return rows;
  },

  /**
   * Get staff performance report
   */
  async getStaffReport(outletId, startDate, endDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        user_id, user_name,
        SUM(order_count) as total_orders,
        SUM(guest_count) as total_guests,
        SUM(net_sales) as total_sales,
        SUM(discount_given) as total_discounts,
        SUM(tips_received) as total_tips,
        SUM(cancelled_orders) as total_cancellations,
        AVG(average_order_value) as avg_order_value
       FROM staff_sales 
       WHERE outlet_id = ? AND report_date BETWEEN ? AND ?
       GROUP BY user_id, user_name
       ORDER BY total_sales DESC`,
      [outletId, startDate, endDate]
    );
    return rows;
  },

  /**
   * Get category sales report
   */
  async getCategorySalesReport(outletId, startDate, endDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        category_id, category_name,
        SUM(quantity_sold) as total_quantity,
        SUM(net_amount) as total_revenue,
        COUNT(DISTINCT item_id) as item_count
       FROM item_sales 
       WHERE outlet_id = ? AND report_date BETWEEN ? AND ?
       GROUP BY category_id, category_name
       ORDER BY total_revenue DESC`,
      [outletId, startDate, endDate]
    );

    // Calculate contribution percentage
    const totalRevenue = rows.reduce((sum, r) => sum + parseFloat(r.total_revenue), 0);
    return rows.map(r => ({
      ...r,
      contributionPercent: totalRevenue > 0 ? ((r.total_revenue / totalRevenue) * 100).toFixed(2) : 0
    }));
  },

  /**
   * Get payment mode report
   */
  async getPaymentModeReport(outletId, startDate, endDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        payment_mode,
        COUNT(*) as transaction_count,
        SUM(total_amount) as total_amount,
        SUM(tip_amount) as tip_amount
       FROM payments 
       WHERE outlet_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status = 'completed'
       GROUP BY payment_mode
       ORDER BY total_amount DESC`,
      [outletId, startDate, endDate]
    );

    const totalAmount = rows.reduce((sum, r) => sum + parseFloat(r.total_amount), 0);
    return rows.map(r => ({
      ...r,
      percentageShare: totalAmount > 0 ? ((r.total_amount / totalAmount) * 100).toFixed(2) : 0
    }));
  },

  /**
   * Get tax summary report
   */
  async getTaxReport(outletId, startDate, endDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        i.invoice_date as report_date,
        SUM(i.taxable_amount) as taxable_amount,
        SUM(i.cgst_amount) as cgst_amount,
        SUM(i.sgst_amount) as sgst_amount,
        SUM(i.igst_amount) as igst_amount,
        SUM(i.vat_amount) as vat_amount,
        SUM(i.total_tax) as total_tax,
        COUNT(*) as invoice_count
       FROM invoices i
       WHERE i.outlet_id = ? AND i.invoice_date BETWEEN ? AND ? AND i.is_cancelled = 0
       GROUP BY i.invoice_date
       ORDER BY i.invoice_date DESC`,
      [outletId, startDate, endDate]
    );
    return rows;
  },

  /**
   * Get hourly sales report
   */
  async getHourlySalesReport(outletId, reportDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        HOUR(created_at) as hour,
        COUNT(*) as order_count,
        SUM(guest_count) as guest_count,
        SUM(total_amount) as net_sales
       FROM orders 
       WHERE outlet_id = ? AND DATE(created_at) = ? AND status = 'paid'
       GROUP BY HOUR(created_at)
       ORDER BY hour`,
      [outletId, reportDate]
    );
    return rows;
  },

  /**
   * Get floor/section sales report
   */
  async getFloorSectionReport(outletId, startDate, endDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        o.floor_id, f.name as floor_name,
        o.section_id, s.name as section_name,
        COUNT(*) as order_count,
        SUM(o.guest_count) as guest_count,
        SUM(CASE WHEN o.status = 'paid' THEN o.total_amount ELSE 0 END) as net_sales
       FROM orders o
       LEFT JOIN floors f ON o.floor_id = f.id
       LEFT JOIN sections s ON o.section_id = s.id
       WHERE o.outlet_id = ? AND DATE(o.created_at) BETWEEN ? AND ? AND o.status != 'cancelled'
       GROUP BY o.floor_id, f.name, o.section_id, s.name
       ORDER BY net_sales DESC`,
      [outletId, startDate, endDate]
    );

    return rows.map(r => ({
      ...r,
      avgOrderValue: r.order_count > 0 ? (r.net_sales / r.order_count).toFixed(2) : 0
    }));
  },

  /**
   * Get counter/station sales report (Kitchen vs Bar)
   */
  async getCounterSalesReport(outletId, startDate, endDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        kt.station,
        COUNT(DISTINCT kt.id) as ticket_count,
        COUNT(ki.id) as item_count,
        SUM(ki.quantity) as total_quantity,
        AVG(TIMESTAMPDIFF(MINUTE, kt.created_at, kt.ready_at)) as avg_prep_time
       FROM kot_tickets kt
       JOIN kot_items ki ON kt.id = ki.kot_id
       WHERE kt.outlet_id = ? AND DATE(kt.created_at) BETWEEN ? AND ?
       GROUP BY kt.station
       ORDER BY ticket_count DESC`,
      [outletId, startDate, endDate]
    );
    return rows;
  },

  /**
   * Get cancellation report
   */
  async getCancellationReport(outletId, startDate, endDate) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT 
        ocl.cancel_type,
        cr.reason as reason_text,
        COUNT(*) as cancel_count,
        u.name as cancelled_by_name,
        COUNT(DISTINCT ocl.order_id) as affected_orders
       FROM order_cancel_logs ocl
       LEFT JOIN cancel_reasons cr ON ocl.reason_id = cr.id
       JOIN orders o ON ocl.order_id = o.id
       LEFT JOIN users u ON ocl.cancelled_by = u.id
       WHERE o.outlet_id = ? AND DATE(ocl.created_at) BETWEEN ? AND ?
       GROUP BY ocl.cancel_type, cr.reason, u.name
       ORDER BY cancel_count DESC`,
      [outletId, startDate, endDate]
    );
    return rows;
  },

  // ========================
  // DASHBOARD STATS
  // ========================

  /**
   * Get live dashboard stats
   */
  async getLiveDashboard(outletId) {
    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);

    // Today's sales
    const [todaySales] = await pool.query(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(guest_count) as total_guests,
        SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as net_sales,
        COUNT(CASE WHEN status NOT IN ('paid', 'cancelled') THEN 1 END) as active_orders
       FROM orders 
       WHERE outlet_id = ? AND DATE(created_at) = ?`,
      [outletId, today]
    );

    // Active tables
    const [activeTables] = await pool.query(
      `SELECT COUNT(*) as count FROM tables WHERE outlet_id = ? AND status = 'occupied'`,
      [outletId]
    );

    // Pending KOTs by station
    const [pendingKots] = await pool.query(
      `SELECT 
        station,
        COUNT(*) as count
       FROM kot_tickets 
       WHERE outlet_id = ? AND status NOT IN ('served', 'cancelled') AND DATE(created_at) = ?
       GROUP BY station`,
      [outletId, today]
    );

    // Payment breakdown
    const [payments] = await pool.query(
      `SELECT 
        payment_mode,
        SUM(total_amount) as amount
       FROM payments 
       WHERE outlet_id = ? AND DATE(created_at) = ? AND status = 'completed'
       GROUP BY payment_mode`,
      [outletId, today]
    );

    return {
      date: today,
      sales: todaySales[0],
      activeTables: activeTables[0].count,
      pendingKots: pendingKots.reduce((obj, k) => { obj[k.station] = k.count; return obj; }, {}),
      paymentBreakdown: payments.reduce((obj, p) => { obj[p.payment_mode] = p.amount; return obj; }, {})
    };
  }
};

module.exports = reportsService;
