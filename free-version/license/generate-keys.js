#!/usr/bin/env node
/**
 * ONE-TIME SCRIPT — Run this ONCE to generate RSA key pair for license signing.
 * 
 * Output:
 *   free-version/license/private.key  — KEEP SECRET (used by imaker to generate tokens)
 *   free-version/license/public.key   — EMBEDDED in the binary (used to verify tokens)
 * 
 * Usage:
 *   node free-version/license/generate-keys.js
 * 
 * IMPORTANT: 
 *   - private.key must NEVER be shipped with the free version
 *   - Add private.key to .gitignore
 *   - Only public.key is bundled in the binary
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_DIR = __dirname;

console.log('=== Generating RSA Key Pair for License System ===\n');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

const privatePath = path.join(KEY_DIR, 'private.key');
const publicPath = path.join(KEY_DIR, 'public.key');

fs.writeFileSync(privatePath, privateKey);
fs.writeFileSync(publicPath, publicKey);

console.log(`✓ Private key: ${privatePath}`);
console.log(`  (KEEP SECRET — never ship with free version)`);
console.log(`✓ Public key:  ${publicPath}`);
console.log(`  (Embedded in binary — used to verify tokens)`);
console.log('\nDone. Now you can generate activation tokens with:');
console.log('  node free-version/license/generate-token.js --email=admin@restaurant.com --password=Pass123 --restaurant="My Restaurant"');
