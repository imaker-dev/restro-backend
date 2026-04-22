#!/usr/bin/env node
/**
 * IMAKER INTERNAL — Generate a Pro upgrade token for an existing restaurant.
 * 
 * This script creates a cryptographically signed upgrade token that
 * converts a Free plan installation to Pro. The token is bound to a
 * specific license ID (prevents reuse on other installations).
 * 
 * Usage:
 *   node free-version/license/generate-upgrade-token.js \
 *     --license-id=<current-free-license-uuid> \
 *     --restaurant="The Grand Kitchen"
 * 
 * Output:
 *   Upgrade token (base64 string) to send to the restaurant.
 * 
 * The restaurant receives:
 *   1. Upgrade Token (long base64 string)
 *   2. Instructions: Settings → Upgrade Plan → Paste token
 *   
 * NOTE: No new credentials needed — restaurant keeps existing admin login.
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
  args[key.replace(/-/g, '_')] = valParts.join('=');
});

if (!args.license_id) {
  console.error('Usage: node generate-upgrade-token.js --license-id=<uuid> [--restaurant=<name>]');
  console.error('');
  console.error('  --license-id   REQUIRED  The current Free license UUID (shown in app Settings → About)');
  console.error('  --restaurant   Optional  Restaurant name (for display/logging only)');
  process.exit(1);
}

// Check private key exists
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error('ERROR: Private key not found at:', PRIVATE_KEY_PATH);
  console.error('Run: node free-version/license/generate-keys.js first');
  process.exit(1);
}

const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');

// Build upgrade payload
const newLicenseId = crypto.randomUUID();
const payload = {
  v: 1,                                        // token version
  lid: newLicenseId,                            // NEW license ID for Pro
  plan: 'pro',                                  // target plan
  restaurant: args.restaurant || '',            // restaurant name (informational)
  upgradeOf: args.license_id,                   // CRITICAL: binds to current Free license
  modules: {
    captain: true,
    inventory: true,
    advancedReports: true,
  },
  maxOutlets: parseInt(args.outlets) || 3,      // Pro default: 3
  maxUsers: -1,                                 // -1 = unlimited
  createdAt: new Date().toISOString(),
  expiresAt: null,                              // lifetime
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

console.log('=== Pro Upgrade Token Generated ===\n');
console.log('New License ID:  ', newLicenseId);
console.log('Upgrades From:   ', args.license_id);
console.log('Restaurant:      ', args.restaurant || '(not specified)');
console.log('Plan:             Pro (Lifetime)');
console.log('Modules:          Captain ✓  Inventory ✓  Advanced Reports ✓');
console.log('Max Outlets:     ', payload.maxOutlets);
console.log('Max Users:        Unlimited');
console.log('');
console.log('--- Send this to the restaurant ---\n');
console.log('Instructions: Open Restro POS → Settings → Upgrade Plan → Paste the token below.');
console.log('');
console.log('Upgrade Token:');
console.log('─'.repeat(60));
console.log(token);
console.log('─'.repeat(60));
console.log('');
console.log(`Token length: ${token.length} characters`);
console.log('\nIMPORTANT: This token can only be used on the installation with License ID:', args.license_id);
console.log('No new login credentials needed — restaurant keeps existing admin email/password.');
