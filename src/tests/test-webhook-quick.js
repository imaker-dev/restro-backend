/**
 * Quick Webhook Test - Diagnose 500 errors
 */
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const BASE_URL = 'http://localhost:3005/api/v1';
const WEBHOOK_SECRET = 'test-webhook-secret';

async function test() {
  console.log('Testing Dyno Webhook...\n');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = {
    event: 'order.new',
    timestamp: new Date().toISOString(),
    data: {
      platform: 'swiggy',
      external_order_id: `DIAG_${Date.now()}`,
      dyno_order_id: 'DYNO_DIAG_001',
      customer: {
        name: 'Test Customer',
        phone: '+919999999999',
        address: '123 Test Street'
      },
      items: [
        {
          external_item_id: 'ITEM_001',
          name: 'Test Burger',
          quantity: 1,
          unit_price: 100,
          total_price: 100
        }
      ],
      payment: {
        method: 'prepaid',
        is_paid: true,
        item_total: 100,
        taxes: 5,
        total: 105
      },
      timing: {
        placed_at: new Date().toISOString()
      }
    }
  };

  const payloadString = JSON.stringify(payload);
  const signatureData = `${timestamp}.${payloadString}`;
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signatureData).digest('hex');

  console.log('Request Details:');
  console.log('  URL:', `${BASE_URL}/integrations/dyno/webhook`);
  console.log('  Timestamp:', timestamp);
  console.log('  Signature:', signature.substring(0, 20) + '...');
  console.log('  Channel ID: 1');
  console.log('');

  try {
    const res = await axios.post(`${BASE_URL}/integrations/dyno/webhook`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Dyno-Signature': signature,
        'X-Dyno-Timestamp': timestamp,
        'X-Dyno-Channel-Id': '1'
      }
    });

    console.log('✓ SUCCESS!');
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(res.data, null, 2));
  } catch (error) {
    console.log('✗ FAILED!');
    console.log('Status:', error.response?.status);
    console.log('Error:', error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      console.log('\n>>> ERROR DETAILS:');
      console.log(error.response.data.error);
    }
  }
}

test();
