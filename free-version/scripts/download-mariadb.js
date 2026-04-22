#!/usr/bin/env node
/**
 * Downloads portable MariaDB for the target platform.
 * MariaDB is used as the local database for the free offline version.
 * 
 * Usage:
 *   node free-version/scripts/download-mariadb.js --platform=win64
 *   node free-version/scripts/download-mariadb.js --platform=macos
 *   node free-version/scripts/download-mariadb.js --platform=linux
 *   node free-version/scripts/download-mariadb.js --platform=all    # download all 3
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MARIADB_VERSION_WIN = '11.4.4';
// Note: MariaDB does not always publish portable bintar builds for every minor version on every OS.
// Keep Windows on latest tested, and use an LTS version for macOS/Linux that is commonly available.
const MARIADB_VERSION_UNIX = '10.11.12';

// MariaDB download URLs by platform
const DOWNLOADS = {
  win64: {
    version: MARIADB_VERSION_WIN,
    url: `https://archive.mariadb.org/mariadb-${MARIADB_VERSION_WIN}/winx64-packages/mariadb-${MARIADB_VERSION_WIN}-winx64.zip`,
    archive: 'mariadb.zip',
    extractCmd: (archive, dest) => `powershell -Command "Expand-Archive -Path '${archive}' -DestinationPath '${dest}' -Force"`,
    innerDir: `mariadb-${MARIADB_VERSION_WIN}-winx64`,
  },
  macos: {
    version: MARIADB_VERSION_UNIX,
    url: `https://archive.mariadb.org/mariadb-${MARIADB_VERSION_UNIX}/bintar-darwin-x86_64/mariadb-${MARIADB_VERSION_UNIX}-osx10.19-x86_64.tar.gz`,
    archive: 'mariadb.tar.gz',
    extractCmd: (archive, dest) => `tar -xzf "${archive}" -C "${dest}"`,
    innerDir: `mariadb-${MARIADB_VERSION_UNIX}-osx10.19-x86_64`,
  },
  linux: {
    version: MARIADB_VERSION_UNIX,
    url: `https://archive.mariadb.org/mariadb-${MARIADB_VERSION_UNIX}/bintar-linux-systemd-x86_64/mariadb-${MARIADB_VERSION_UNIX}-linux-systemd-x86_64.tar.gz`,
    archive: 'mariadb.tar.gz',
    extractCmd: (archive, dest) => `tar -xzf "${archive}" -C "${dest}"`,
    innerDir: `mariadb-${MARIADB_VERSION_UNIX}-linux-systemd-x86_64`,
  },
};

const args = process.argv.slice(2);
const platform = args.find(a => a.startsWith('--platform='))?.split('=')[1] || 'win64';

if (platform !== 'all' && !DOWNLOADS[platform]) {
  console.error(`Unknown platform: ${platform}. Use: win64, macos, linux, all`);
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Move directory: try rename first, fall back to copy+delete (fixes Windows EPERM)
 */
function moveDir(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EXDEV') {
      // Cross-device or permission issue — copy then delete
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    console.log(`To: ${dest}`);
    
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    
    const request = (url) => {
      protocol.get(url, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`Redirecting to: ${response.headers.location}`);
          const redirectProtocol = response.headers.location.startsWith('https') ? https : http;
          redirectProtocol.get(response.headers.location, (res) => {
            if (res.statusCode !== 200) {
              reject(new Error(`Download failed (HTTP ${res.statusCode}) for ${response.headers.location}`));
              return;
            }
            const total = parseInt(res.headers['content-length'], 10);
            let downloaded = 0;
            
            res.on('data', (chunk) => {
              downloaded += chunk.length;
              if (total) {
                const pct = ((downloaded / total) * 100).toFixed(1);
                process.stdout.write(`\r  ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
              }
            });
            
            res.pipe(file);
            file.on('finish', () => {
              file.close();
              console.log('\n  Download complete');
              resolve();
            });
          }).on('error', reject);
          return;
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed (HTTP ${response.statusCode}) for ${url}`));
          return;
        }

        const total = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;
        
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(`\r  ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          }
        });
        
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('\n  Download complete');
          resolve();
        });
      }).on('error', reject);
    };
    
    request(url);
  });
}

function assertArchiveLooksValid(archivePath) {
  // If we accidentally downloaded HTML (404 page) the file will be tiny.
  // MariaDB archives are typically hundreds of MB.
  const minBytes = 1024 * 1024; // 1MB
  const size = fs.statSync(archivePath).size;
  if (size < minBytes) {
    throw new Error(
      `Downloaded file is too small (${size} bytes). The URL may be invalid or returned HTML instead of an archive.`
    );
  }
}

async function downloadPlatform(plat) {
  const config = DOWNLOADS[plat];
  const DIST_DIR = path.join(ROOT, 'dist', `restro-pos-${plat}`);
  const TEMP_DIR = path.join(ROOT, 'dist', 'temp');

  console.log(`\n=== Downloading MariaDB ${config.version} for ${plat} ===\n`);

  // Create directories
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const archivePath = path.join(TEMP_DIR, `mariadb-${plat}.${config.archive.split('.').slice(1).join('.')}`);

  // Download
  if (fs.existsSync(archivePath)) {
    console.log('Archive already downloaded, skipping download...');
  } else {
    await downloadFile(config.url, archivePath);
  }

  // Validate archive looks real (avoid extracting HTML/404 pages)
  try {
    assertArchiveLooksValid(archivePath);
  } catch (e) {
    console.error(`\nDownload validation failed for ${plat}: ${e.message}`);
    console.error(`URL: ${config.url}`);
    // Cleanup bad file
    try { fs.rmSync(archivePath, { force: true }); } catch {}
    process.exit(1);
  }

  // Extract
  console.log('\nExtracting...');
  const extractDest = path.join(TEMP_DIR, `extracted-${plat}`);
  if (fs.existsSync(extractDest)) {
    fs.rmSync(extractDest, { recursive: true, force: true });
  }
  fs.mkdirSync(extractDest, { recursive: true });
  
  try {
    execSync(config.extractCmd(archivePath, extractDest), { stdio: 'inherit' });
  } catch (err) {
    console.error('Extraction failed:', err.message);
    process.exit(1);
  }

  // Move to dist (using moveDir to avoid Windows EPERM)
  const mariadbDest = path.join(DIST_DIR, 'mariadb');
  if (fs.existsSync(mariadbDest)) {
    fs.rmSync(mariadbDest, { recursive: true, force: true });
  }
  
  const innerPath = path.join(extractDest, config.innerDir);
  if (fs.existsSync(innerPath)) {
    moveDir(innerPath, mariadbDest);
  } else {
    // Try to find the extracted directory
    const dirs = fs.readdirSync(extractDest).filter(d => 
      fs.statSync(path.join(extractDest, d)).isDirectory()
    );
    if (dirs.length > 0) {
      moveDir(path.join(extractDest, dirs[0]), mariadbDest);
    } else {
      console.error('Could not find extracted MariaDB directory');
      process.exit(1);
    }
  }

  console.log(`\n✓ MariaDB ${config.version} for ${plat} installed to: ${mariadbDest}`);

  // Cleanup this platform's temp files
  fs.rmSync(extractDest, { recursive: true, force: true });
  fs.rmSync(archivePath, { force: true });
}

async function main() {
  const platforms = platform === 'all' ? ['win64', 'macos', 'linux'] : [platform];

  for (const plat of platforms) {
    await downloadPlatform(plat);
  }

  // Cleanup temp dir
  const TEMP_DIR = path.join(ROOT, 'dist', 'temp');
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  console.log('\n' + '='.repeat(50));
  if (platform === 'all') {
    console.log('✓ All platforms downloaded!');
    console.log('  dist/restro-pos-win64/mariadb/');
    console.log('  dist/restro-pos-macos/mariadb/');
    console.log('  dist/restro-pos-linux/mariadb/');
  } else {
    console.log(`\nNext: Run the build script:`);
    console.log(`  node free-version/scripts/build.js --platform=${platform}`);
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
