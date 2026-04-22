#!/usr/bin/env node
/**
 * Restro POS Free Version — Build Script
 * 
 * Creates a complete distributable package:
 * 1. Packages backend JS into standalone binary using pkg (code protected)
 * 2. Copies launcher scripts, env config, public.key
 * 3. Checks that MariaDB was downloaded (run download-mariadb.js first)
 * 4. Creates a ready-to-upload .zip for the website
 * 
 * Usage:
 *   node free-version/scripts/build.js --platform=win64
 *   node free-version/scripts/build.js --platform=macos
 *   node free-version/scripts/build.js --platform=linux
 *   node free-version/scripts/build.js --platform=all
 * 
 * Output (per platform):
 *   dist/restro-pos-win64/          ← full folder
 *   dist/restro-pos-windows.zip     ← ready to upload to website
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const FREE_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');

const PLATFORMS = {
  win64:  { pkg: 'node20-win-x64',   ext: '.exe', launcher: 'start-windows.bat', zipName: 'restro-pos-windows.zip' },
  macos:  { pkg: 'node20-macos-x64',  ext: '',     launcher: 'start-mac.sh',      zipName: 'restro-pos-macos.zip' },
  linux:  { pkg: 'node20-linux-x64',  ext: '',     launcher: 'start-linux.sh',     zipName: 'restro-pos-linux.zip' },
};

// Parse args
const args = process.argv.slice(2);
const platformArg = args.find(a => a.startsWith('--platform='))?.split('=')[1] || 'win64';
const skipZip = args.includes('--skip-zip');
const targetPlatforms = platformArg === 'all' ? Object.keys(PLATFORMS) : [platformArg];

/**
 * Create a zip file from a directory using PowerShell (Windows) or tar/zip (Unix)
 */
function createZip(sourceDir, zipPath) {
  const folderName = path.basename(sourceDir);
  const parentDir = path.dirname(sourceDir);

  if (process.platform === 'win32') {
    // Remove existing zip first
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execSync(
      `powershell -Command "Compress-Archive -Path '${sourceDir}' -DestinationPath '${zipPath}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execSync(`cd "${parentDir}" && zip -r "${zipPath}" "${folderName}"`, { stdio: 'inherit' });
  }
}

async function build() {
  console.log('=== Restro POS Free Version — Build ===\n');

  // Pre-check: public.key must exist
  const publicKeyPath = path.join(FREE_DIR, 'license', 'public.key');
  if (!fs.existsSync(publicKeyPath)) {
    console.error('ERROR: public.key not found!');
    console.error('Run first: node free-version/license/generate-keys.js');
    process.exit(1);
  }

  // Pre-check: @yao-pkg/pkg installed (supports Node 18/20/21/22)
  try {
    execSync('npx @yao-pkg/pkg --version', { cwd: ROOT, stdio: 'pipe' });
  } catch {
    console.log('Installing @yao-pkg/pkg...');
    execSync('npm install --save-dev @yao-pkg/pkg', { cwd: ROOT, stdio: 'inherit' });
  }

  const results = [];

  for (const platform of targetPlatforms) {
    const config = PLATFORMS[platform];
    if (!config) {
      console.error(`Unknown platform: ${platform}. Use: win64, macos, linux, all`);
      process.exit(1);
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  Building for ${platform}`);
    console.log(`${'─'.repeat(50)}`);

    const outputDir = path.join(DIST_DIR, `restro-pos-${platform}`);

    // Check if MariaDB was downloaded for this platform
    const mariadbDir = path.join(outputDir, 'mariadb');
    if (!fs.existsSync(mariadbDir) || fs.readdirSync(mariadbDir).length === 0) {
      console.warn(`\n  ⚠ MariaDB not found for ${platform}!`);
      console.warn(`  Run first: node free-version/scripts/download-mariadb.js --platform=${platform}`);
      console.warn(`  Skipping ${platform}...\n`);
      continue;
    }

    // Create required directories (don't wipe — MariaDB is already there)
    fs.mkdirSync(path.join(outputDir, 'uploads'), { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'data'), { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'license'), { recursive: true });

    // 1. Run pkg — compile backend to binary
    console.log('\n  [1/5] Compiling backend binary...');
    const binaryName = `restro-pos${config.ext}`;
    try {
      execSync(
        `npx @yao-pkg/pkg "${path.join(FREE_DIR, 'app-free.js')}" --config "${path.join(ROOT, 'package.json')}" --target ${config.pkg} --output "${path.join(outputDir, binaryName)}" --compress GZip`,
        { cwd: ROOT, stdio: 'inherit' }
      );
    } catch (err) {
      console.error(`  ✗ pkg build failed for ${platform}:`, err.message);
      continue;
    }

    // 2. Copy public.key (for offline token verification)
    console.log('  [2/5] Copying license public key...');
    fs.copyFileSync(publicKeyPath, path.join(outputDir, 'license', 'public.key'));

    // 3. Copy launcher script
    console.log('  [3/5] Copying launcher script...');
    const launcherSrc = path.join(FREE_DIR, 'launcher', config.launcher);
    if (fs.existsSync(launcherSrc)) {
      fs.copyFileSync(launcherSrc, path.join(outputDir, config.launcher));
    }

    // 4. Copy .env config
    console.log('  [4/5] Copying environment config...');
    const envSrc = path.join(FREE_DIR, 'config', 'free.env');
    if (fs.existsSync(envSrc)) {
      fs.copyFileSync(envSrc, path.join(outputDir, '.env'));
    }

    // 5. Create zip for website upload
    const zipPath = path.join(DIST_DIR, config.zipName);
    if (!skipZip) {
      console.log('  [5/5] Creating zip for website upload...');
      try {
        createZip(outputDir, zipPath);
        console.log(`  ✓ Zip: ${zipPath}`);
      } catch (err) {
        console.warn(`  ⚠ Zip creation failed: ${err.message}`);
        console.warn(`  You can manually zip: ${outputDir}`);
      }
    } else {
      console.log('  [5/5] Skipping zip (--skip-zip)');
    }

    results.push({ platform, outputDir, binaryName, zipPath });
    console.log(`\n  ✓ ${platform} build complete`);
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('  BUILD SUMMARY');
  console.log(`${'='.repeat(50)}\n`);

  if (results.length === 0) {
    console.log('  No platforms built. Download MariaDB first:');
    console.log('  node free-version/scripts/download-mariadb.js --platform=all\n');
    process.exit(1);
  }

  for (const r of results) {
    console.log(`  ${r.platform}:`);
    console.log(`    Folder: ${r.outputDir}`);
    if (!skipZip && fs.existsSync(r.zipPath)) {
      const sizeMB = (fs.statSync(r.zipPath).size / 1024 / 1024).toFixed(1);
      console.log(`    Zip:    ${r.zipPath} (${sizeMB} MB) ← upload this to website`);
    }
    console.log('');
  }

  console.log('  What each zip contains:');
  console.log('  ├── restro-pos(.exe)     # Backend binary (code protected)');
  console.log('  ├── mariadb/             # Portable database');
  console.log('  ├── license/public.key   # Token verification key');
  console.log('  ├── start-windows.bat    # Launcher script');
  console.log('  ├── .env                 # Config');
  console.log('  ├── uploads/             # Empty (user uploads)');
  console.log('  └── data/                # Empty (DB files on first run)');
  console.log('');
  console.log('  Upload these zips to the website download page.');
  console.log('  Restaurants download → extract → run launcher → activate with token.');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
