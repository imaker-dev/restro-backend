const { initializeDatabase, getPool } = require('../src/database');

(async () => {
  await initializeDatabase();
  const pool = getPool();
  
  // Get the problematic invoice by order_id
  const [inv] = await pool.query(
    'SELECT * FROM invoices WHERE order_id = ? AND is_cancelled = 0', 
    [746]
  );
  
  const invoice = inv[0];
  console.log('Invoice:', invoice.invoice_number);
  console.log('Order ID:', invoice.order_id);
  console.log('\nStored Values:');
  console.log('  subtotal:', invoice.subtotal);
  console.log('  discount_amount:', invoice.discount_amount);
  console.log('  taxable_amount:', invoice.taxable_amount);
  console.log('  cgst_amount:', invoice.cgst_amount);
  console.log('  sgst_amount:', invoice.sgst_amount);
  console.log('  vat_amount:', invoice.vat_amount);
  console.log('  total_tax:', invoice.total_tax);
  console.log('  grand_total:', invoice.grand_total);
  
  // Parse tax_breakup
  const taxBreakup = typeof invoice.tax_breakup === 'string' 
    ? JSON.parse(invoice.tax_breakup) 
    : invoice.tax_breakup;
  console.log('\nTax Breakup:');
  let breakupSum = 0;
  for (const [code, data] of Object.entries(taxBreakup || {})) {
    console.log(`  ${code}: rate=${data.rate}%, taxable=${data.taxableAmount}, tax=${data.taxAmount}`);
    breakupSum += parseFloat(data.taxAmount) || 0;
  }
  console.log('  Sum of breakup:', breakupSum.toFixed(2));
  
  // Get order items
  const [items] = await pool.query(
    `SELECT oi.*, i.name 
     FROM order_items oi 
     LEFT JOIN items i ON oi.item_id = i.id 
     WHERE oi.order_id = ? AND oi.status != 'cancelled'`,
    [invoice.order_id]
  );
  
  console.log('\nOrder Items:');
  let itemSubtotal = 0;
  let rawVatAmount = 0;
  let rawCgstAmount = 0;
  let rawSgstAmount = 0;
  
  for (const item of items) {
    console.log(`  - ${item.name}: ₹${item.total_price} (qty: ${item.quantity})`);
    itemSubtotal += parseFloat(item.total_price) || 0;
    
    if (item.tax_details) {
      const td = typeof item.tax_details === 'string' 
        ? JSON.parse(item.tax_details) 
        : item.tax_details;
      for (const tax of td) {
        const code = tax.componentCode || tax.code || tax.name || 'TAX';
        const amt = parseFloat(tax.amount) || 0;
        console.log(`      Tax: ${code} @ ${tax.rate}% = ₹${amt}`);
        
        const codeUpper = code.toUpperCase();
        if (codeUpper.includes('VAT')) rawVatAmount += amt;
        else if (codeUpper.includes('CGST')) rawCgstAmount += amt;
        else if (codeUpper.includes('SGST')) rawSgstAmount += amt;
      }
    }
  }
  
  console.log('\nCalculation Analysis:');
  console.log('  Item subtotal:', itemSubtotal.toFixed(2));
  console.log('  Raw VAT (before discount):', rawVatAmount.toFixed(2));
  console.log('  Raw CGST (before discount):', rawCgstAmount.toFixed(2));
  console.log('  Raw SGST (before discount):', rawSgstAmount.toFixed(2));
  
  const discountRatio = parseFloat(invoice.taxable_amount) / parseFloat(invoice.subtotal);
  console.log('  Discount ratio:', discountRatio.toFixed(4));
  
  const expectedVat = rawVatAmount * discountRatio;
  const expectedCgst = rawCgstAmount * discountRatio;
  const expectedSgst = rawSgstAmount * discountRatio;
  console.log('\n  Expected VAT (after discount):', expectedVat.toFixed(2));
  console.log('  Expected CGST (after discount):', expectedCgst.toFixed(2));
  console.log('  Expected SGST (after discount):', expectedSgst.toFixed(2));
  console.log('  Expected total tax:', (expectedVat + expectedCgst + expectedSgst).toFixed(2));
  
  console.log('\n  Stored vat_amount:', invoice.vat_amount);
  console.log('  Stored total_tax:', invoice.total_tax);
  console.log('  Sum of stored individual taxes:', 
    (parseFloat(invoice.cgst_amount) + parseFloat(invoice.sgst_amount) + parseFloat(invoice.vat_amount)).toFixed(2));
  
  // Check if totalTax matches taxBreakup
  console.log('\n  totalTax matches taxBreakup sum:', 
    Math.abs(parseFloat(invoice.total_tax) - breakupSum) < 0.1 ? 'YES' : 'NO');
  console.log('  totalTax matches individual sum:', 
    Math.abs(parseFloat(invoice.total_tax) - (parseFloat(invoice.cgst_amount) + parseFloat(invoice.sgst_amount) + parseFloat(invoice.vat_amount))) < 0.1 ? 'YES' : 'NO');
  
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
