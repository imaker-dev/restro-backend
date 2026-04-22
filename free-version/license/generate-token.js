#!/usr/bin/env node
/**
 * IMAKER INTERNAL — Generate an activation token for a restaurant.
 * 
 * This script is used by imaker team ONLY. It signs a license payload
 * with the private key. The resulting token is given to the restaurant
 * along with the admin email and password.
 * 
 * Usage:
 *   node free-version/license/generate-token.js \
 *     --email=admin@myrestaurant.com \
 *     --password=SecurePass123 \
 *     --restaurant="The Grand Kitchen" \
 *     --phone=9876543210 \
 *     --outlets=1
 * 
 * Output:
 *   Activation token (base64 string) + admin credentials
 * 
 * The restaurant receives:
 *   1. Activation Token (long base64 string)
 *   2. Admin Email: admin@myrestaurant.com
 *   3. Admin Password: SecurePass123
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_DIR = __dirname;
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'private.key');

// Parse CLI arguments
const args = {};
process.argv.slice(2).forEach(arg => {
  const [key, ...valParts] = arg.replace(/^--/, '').split('=');
  args[key] = valParts.join('=');
});

if (!args.email || !args.password || !args.restaurant) {
  console.error('Usage: node generate-token.js --email=<email> --password=<password> --restaurant=<name> [--phone=<phone>] [--outlets=<max>]');
  process.exit(1);
}

// Check private key exists
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error('ERROR: Private key not found at:', PRIVATE_KEY_PATH);
  console.error('Run: node free-version/license/generate-keys.js first');
  process.exit(1);
}

const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

// Build license payload
const licenseId = crypto.randomUUID();
const payload = {
  v: 1,                                    // token version
  lid: licenseId,                          // unique license ID
  plan: 'free',                            // plan type
  restaurant: args.restaurant,             // restaurant name
  email: args.email.toLowerCase(),         // admin email
  password: args.password,                 // admin password (plain — encrypted in token)
  phone: args.phone || null,               // contact phone
  maxOutlets: parseInt(args.outlets) || 1, // max outlets allowed
  createdAt: new Date().toISOString(),     // issue date
  expiresAt: null,                         // null = lifetime (never expires)
};

// Serialize and sign
const payloadStr = JSON.stringify(payload);
const payloadB64 = Buffer.from(payloadStr).toString('base64url');

const sign = crypto.createSign('SHA256');
sign.update(payloadStr);
sign.end();
const signature = sign.sign(privateKey, 'base64url');

// Token format: <base64url_payload>.<base64url_signature>
const token = `${payloadB64}.${signature}`;

console.log('=== Activation Token Generated ===\n');
console.log('License ID:', licenseId);
console.log('Restaurant:', args.restaurant);
console.log('Plan:       Free (Lifetime)');
console.log('Max Outlets:', payload.maxOutlets);
console.log('');
console.log('--- Give these to the restaurant ---\n');
console.log('Admin Email:    ', args.email);
console.log('Admin Password: ', args.password);
console.log('');
console.log('Activation Token:');
console.log('─'.repeat(60));
console.log(token);
console.log('─'.repeat(60));
console.log('');
console.log(`Token length: ${token.length} characters`);
console.log('\nThe restaurant enters this token on first launch to activate the system.');
