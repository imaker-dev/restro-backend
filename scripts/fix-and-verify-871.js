/**
 * Fix invoice for order 871 and verify all NC logic
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('=== Fix & Verify Order 871 ===\n');

    // 1. Check order state
    const [orders] = await pool.query(
      `SELECT id, order_number, status, payment_status, subtotal, tax_amount, total_amount, 
              paid_amount, due_amount, is_nc, nc_amount, table_id, table_session_id
       FROM orders WHERE id = 871`
    );
    const order = orders[0];
    if (!order) { console.log('Order 871 not found'); return; }
    console.log('Order:', JSON.stringify(order, null, 2));

    // 2. Check items
    const [items] = await pool.query(
      `SELECT id, item_name, total_price, tax_amount, tax_details, is_nc, nc_amount, status
       FROM order_items WHERE order_id = 871 ORDER BY id`
    );
    const activeItems = items.filter(i => i.status !== 'cancelled');
    console.log(`\nItems (${activeItems.length} active):`);
    
    let subtotal = 0, ncAmount = 0, totalTax = 0;
    for (const item of activeItems) {
      const price = parseFloat(item.total_price);
      subtotal += price;
      
      if (item.is_nc) {
        ncAmount += price;
        console.log(`  [NC] ${item.item_name}: ₹${price} (tax SKIPPED)`);
      } else {
        // Only non-NC items contribute to tax
        const taxDetails = item.tax_details ? JSON.parse(item.tax_details) : [];
        let itemTax = 0;
        for (const t of taxDetails) {
          itemTax += parseFloat(t.amount) || 0;
        }
        totalTax += itemTax;
        console.log(`  [OK] ${item.item_name}: ₹${price} (tax: ₹${itemTax.toFixed(2)})`);
      }
    }
    totalTax = parseFloat(totalTax.toFixed(2));
    
    const taxableAmount = subtotal - ncAmount;
    const preRound = taxableAmount + totalTax;
    const grandTotal = Math.max(0, Math.round(preRound));
    const roundOff = parseFloat((grandTotal - preRound).toFixed(2));

    console.log(`\nCalculation:`);
    console.log(`  subtotal: ₹${subtotal} (all items)`);
    console.log(`  ncAmount: ₹${ncAmount} (NC items, tax=0)`);
    console.log(`  taxableAmount: ₹${taxableAmount} (non-NC)`);
    console.log(`  totalTax: ₹${totalTax} (non-NC only)`);
    console.log(`  grandTotal: ₹${grandTotal}`);

    // 3. Fix invoice
    const [invRows] = await pool.query(
      'SELECT id, invoice_number, grand_total, is_nc, nc_amount, nc_tax_amount, payment_status FROM invoices WHERE order_id = 871 AND is_cancelled = 0'
    );
    if (invRows[0]) {
      const inv = invRows[0];
      console.log(`\nInvoice BEFORE fix: ${inv.invoice_number} - grand_total=${inv.grand_total}, is_nc=${inv.is_nc}, nc_amount=${inv.nc_amount}, nc_tax_amount=${inv.nc_tax_amount}`);
      
      // Build tax breakup for non-NC items
      const taxBreakup = {};
      let cgst = 0, sgst = 0, igst = 0, vat = 0, cess = 0;
      for (const item of activeItems) {
        if (item.is_nc) continue;
        const taxDetails = item.tax_details ? JSON.parse(item.tax_details) : [];
        for (const t of taxDetails) {
          const code = t.componentCode || t.code || 'TAX';
          const amt = parseFloat(t.amount) || 0;
          if (!taxBreakup[code]) taxBreakup[code] = { name: t.componentName || t.name, rate: t.rate, taxableAmount: 0, taxAmount: 0 };
          taxBreakup[code].taxableAmount += parseFloat(item.total_price);
          taxBreakup[code].taxAmount += amt;
          const upper = code.toUpperCase();
          if (upper.includes('CGST')) cgst += amt;
          else if (upper.includes('SGST')) sgst += amt;
          else if (upper.includes('IGST')) igst += amt;
          else if (upper.includes('VAT')) vat += amt;
          else if (upper.includes('CESS')) cess += amt;
        }
      }

      await pool.query(
        `UPDATE invoices SET 
          subtotal = ?, taxable_amount = ?, total_tax = ?,
          cgst_amount = ?, sgst_amount = ?, igst_amount = ?, vat_amount = ?, cess_amount = ?,
          grand_total = ?, round_off = ?,
          is_nc = ?, nc_amount = ?, nc_tax_amount = 0, payable_amount = ?,
          amount_in_words = ?, tax_breakup = ?
         WHERE id = ?`,
        [
          subtotal, taxableAmount, totalTax,
          cgst, sgst, igst, vat, cess,
          grandTotal, roundOff,
          ncAmount > 0 ? 1 : 0, ncAmount, grandTotal,
          grandTotal === 0 ? 'Zero Rupees Only' : `Rupees ${grandTotal} Only`,
          JSON.stringify(taxBreakup),
          inv.id
        ]
      );
      console.log(`  Invoice FIXED ✓`);
    }

    // 4. Check table and session
    if (order.table_id) {
      const [tables] = await pool.query('SELECT id, table_number, status FROM tables WHERE id = ?', [order.table_id]);
      console.log(`\nTable: ${JSON.stringify(tables[0])}`);
    }
    if (order.table_session_id) {
      const [sessions] = await pool.query('SELECT id, status, ended_at FROM table_sessions WHERE id = ?', [order.table_session_id]);
      console.log(`Session: ${JSON.stringify(sessions[0])}`);
    }

    // 5. Check KOTs
    const [kots] = await pool.query(
      `SELECT id, kot_number, status FROM kot_tickets WHERE order_id = 871`
    );
    console.log(`\nKOTs: ${kots.map(k => `${k.kot_number}(${k.status})`).join(', ')}`);

    // 6. Verify final invoice
    const [finalInv] = await pool.query(
      `SELECT invoice_number, subtotal, taxable_amount, total_tax, grand_total, 
              round_off, is_nc, nc_amount, nc_tax_amount, payable_amount, payment_status
       FROM invoices WHERE order_id = 871 AND is_cancelled = 0`
    );
    if (finalInv[0]) {
      console.log(`\nFinal Invoice:`, JSON.stringify(finalInv[0], null, 2));
    }

    // 7. Payment simulation
    console.log(`\n=== Payment Flow (₹0 for NC order) ===`);
    console.log(`  amount: 0, invoiceId: ${invRows[0]?.id}`);
    console.log(`  invoice grand_total: ${grandTotal}`);
    console.log(`  paidAmount after payment: 0`);
    console.log(`  orderTotal (from invoice): ${grandTotal}`);
    console.log(`  dueAmount: ${grandTotal} - 0 = ${grandTotal}`);
    if (grandTotal === 0) {
      console.log(`  dueAmount <= 0 → paymentStatus = 'completed', orderStatus = 'completed'`);
      console.log(`  ✓ Table released, KOTs served, order completed`);
    } else {
      console.log(`  ⚠ grandTotal is not 0, payment of ₹0 will NOT complete the order`);
    }

    console.log('\n=== Done ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
