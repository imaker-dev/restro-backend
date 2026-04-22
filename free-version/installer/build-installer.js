#!/usr/bin/env node
/**
 * Restro POS — Installer Build Script
 * 
 * Prepares the installer-ready structure and optionally compiles
 * the Inno Setup script into a single .exe installer.
 * 
 * Steps:
 *   1. Build backend binary (calls existing build.js)
 *   2. Verify Flutter build exists
 *   3. Compile Inno Setup script (if iscc.exe is available)
 * 
 * Usage:
 *   node free-version/installer/build-installer.js
 *   node free-version/installer/build-installer.js --flutter-dir=C:\path\to\flutter\build
 *   node free-version/installer/build-installer.js --skip-backend  (if backend already built)
 * 
 * Prerequisites:
 *   - Backend: npm install done, MariaDB downloaded
 *   - Flutter: flutter build windows --release (done separately)
 *   - Inno Setup 6: https://jrsoftware.org/isinfo.php (optional, for .exe output)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FREE_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const INSTALLER_DIR = __dirname;

// Parse args
const args = process.argv.slice(2);
const skipBackend = args.includes('--skip-backend');
const flutterDirArg = args.find(a => a.startsWith('--flutter-dir='))?.split('=')[1];

// Default Flutter build path (adjust for your project)
const FLUTTER_BUILD_DIR = flutterDirArg || path.resolve(ROOT, '..', 'iMakerRestro', 'build', 'windows', 'x64', 'runner', 'Release');
const BACKEND_BUILD_DIR = path.join(DIST_DIR, 'restro-pos-win64');

function section(title) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(50)}`);
}

async function build() {
  console.log('=== Restro POS — Installer Build ===\n');

  // Step 1: Build backend
  section('Step 1: Backend Binary');
  if (skipBackend) {
    console.log('  Skipping backend build (--skip-backend)');
  } else {
    console.log('  Building backend binary...');
    execSync('node free-version/scripts/build.js --platform=win64 --skip-zip', {
      cwd: ROOT,
      stdio: 'inherit'
    });
  }

  // Verify backend build
  const backendExe = path.join(BACKEND_BUILD_DIR, 'restro-pos.exe');
  if (!fs.existsSync(backendExe)) {
    console.error(`\n  ERROR: Backend binary not found at:\n    ${backendExe}`);
    console.error('  Run: node free-version/scripts/build.js --platform=win64');
    process.exit(1);
  }
  const backendSize = (fs.statSync(backendExe).size / 1024 / 1024).toFixed(1);
  console.log(`  ✓ Backend binary: ${backendSize} MB`);

  // Verify MariaDB
  const mariadbDir = path.join(BACKEND_BUILD_DIR, 'mariadb', 'bin');
  if (!fs.existsSync(mariadbDir)) {
    console.error(`\n  ERROR: MariaDB not found at:\n    ${mariadbDir}`);
    console.error('  Run: node free-version/scripts/download-mariadb.js --platform=win64');
    process.exit(1);
  }
  console.log('  ✓ MariaDB portable found');

  // Step 2: Verify Flutter build
  section('Step 2: Flutter Desktop Build');
  if (fs.existsSync(FLUTTER_BUILD_DIR)) {
    const flutterExe = fs.readdirSync(FLUTTER_BUILD_DIR).find(f => f.endsWith('.exe'));
    if (flutterExe) {
      console.log(`  ✓ Flutter build found: ${flutterExe}`);
      console.log(`    Path: ${FLUTTER_BUILD_DIR}`);
    } else {
      console.warn('  ⚠ Flutter build directory exists but no .exe found');
      console.warn(`    Path: ${FLUTTER_BUILD_DIR}`);
    }
  } else {
    console.warn(`  ⚠ Flutter build not found at:\n    ${FLUTTER_BUILD_DIR}`);
    console.warn('  You can specify a custom path:');
    console.warn('    --flutter-dir=C:\\path\\to\\flutter\\build\\windows\\x64\\runner\\Release');
    console.warn('\n  The Inno Setup script will need the Flutter build to compile.');
  }

  // Step 3: Update Inno Setup paths in .iss file
  section('Step 3: Prepare Inno Setup Script');
  const issTemplate = path.join(INSTALLER_DIR, 'restro-pos-setup.iss');
  if (fs.existsSync(issTemplate)) {
    console.log(`  ✓ Inno Setup script: ${issTemplate}`);
  } else {
    console.error('  ERROR: restro-pos-setup.iss not found!');
    process.exit(1);
  }

  // Step 4: Try to compile with Inno Setup
  section('Step 4: Compile Installer');
  const isccPaths = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ];
  
  let isccExe = null;
  for (const p of isccPaths) {
    if (fs.existsSync(p)) { isccExe = p; break; }
  }

  // Also check PATH
  if (!isccExe) {
    try {
      execSync('where iscc', { stdio: 'pipe' });
      isccExe = 'iscc';
    } catch (_) {}
  }

  if (isccExe) {
    console.log(`  Found Inno Setup: ${isccExe}`);
    
    if (!fs.existsSync(FLUTTER_BUILD_DIR)) {
      console.warn('\n  ⚠ Cannot compile — Flutter build directory not found.');
      console.warn('  Build Flutter first, then re-run or compile manually.');
    } else {
      console.log('  Compiling installer...');
      try {
        execSync(`"${isccExe}" "${issTemplate}"`, {
          cwd: INSTALLER_DIR,
          stdio: 'inherit'
        });
        
        // Find output
        const outputExe = fs.readdirSync(DIST_DIR).find(f => f.startsWith('RestroPOS-Setup'));
        if (outputExe) {
          const size = (fs.statSync(path.join(DIST_DIR, outputExe)).size / 1024 / 1024).toFixed(1);
          console.log(`\n  ✓ Installer created: dist/${outputExe} (${size} MB)`);
        }
      } catch (err) {
        console.error('  ✗ Inno Setup compilation failed:', err.message);
        console.error('  You can compile manually: open restro-pos-setup.iss in Inno Setup Compiler');
      }
    }
  } else {
    console.warn('  Inno Setup not found on this system.');
    console.warn('  Download from: https://jrsoftware.org/isinfo.php');
    console.warn('  Then compile: ISCC.exe restro-pos-setup.iss');
  }

  // Summary
  section('Summary');
  console.log('  Backend files ready at:');
  console.log(`    ${BACKEND_BUILD_DIR}`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Build Flutter: cd iMakerRestro && flutter build windows --release');
  console.log('    2. Add BackendManager to Flutter app (see backend_manager.dart)');
  console.log('    3. Install Inno Setup 6: https://jrsoftware.org/isinfo.php');
  console.log('    4. Open restro-pos-setup.iss → adjust paths → Build');
  console.log('    5. Distribute: dist/RestroPOS-Setup-*.exe');
  console.log('');
}

build().catch(err => {
  console.error('Installer build failed:', err);
  process.exit(1);
});
