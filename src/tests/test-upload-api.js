/**
 * Global Image Upload API — Comprehensive Test
 * Tests: single upload, multiple upload, invalid files, size limits, delete, no-auth, URL accessibility
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE = 'http://localhost:3000/api/v1';

let passed = 0, failed = 0;
const tempFiles = [];

function section(t) { console.log(`\n${'═'.repeat(70)}\n  ${t}\n${'═'.repeat(70)}`); }
function test(name, cond, detail) {
  if (cond) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; console.log(`   ✗ FAIL: ${name}${detail ? ' → ' + detail : ''}`); }
}
function log(label, val) { console.log(`   ${label}:`, typeof val === 'object' ? JSON.stringify(val, null, 2).split('\n').join('\n   ') : val); }

// Create temp test image files
function createTestFile(name, content, ext) {
  const filePath = path.join(__dirname, name);
  // Write minimal valid file content for each type
  fs.writeFileSync(filePath, content);
  tempFiles.push(filePath);
  return filePath;
}

function cleanup() {
  for (const f of tempFiles) {
    try { fs.unlinkSync(f); } catch (e) { /* ignore */ }
  }
}

(async () => {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  IMAGE UPLOAD API — Comprehensive Test                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // Create test files
  // Minimal PNG (1x1 pixel)
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE
  ]);
  const pngFile = createTestFile('test-image.png', pngHeader);

  // Minimal JPEG
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const jpgFile = createTestFile('test-image.jpg', jpegHeader);

  // Minimal GIF
  const gifHeader = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xFF\xFF\xFF\x00\x00\x00!\xF9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');
  const gifFile = createTestFile('test-image.gif', gifHeader);

  // WebP (minimal)
  const webpFile = createTestFile('test-image.webp', Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 '));

  // BMP (minimal)
  const bmpFile = createTestFile('test-image.bmp', Buffer.from('BM'));

  // SVG
  const svgFile = createTestFile('test-image.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');

  // Invalid file (text)
  const txtFile = createTestFile('test-file.txt', 'This is not an image');

  // Invalid file (JS)
  const jsFile = createTestFile('test-file.js', 'console.log("not an image")');

  const uploadedPaths = [];

  // ══════════════════════════════════════════════════════════════
  // A. NO AUTH REQUIRED
  // ══════════════════════════════════════════════════════════════
  section('A. No authentication required');
  try {
    const form = new FormData();
    form.append('image', fs.createReadStream(pngFile));
    const r = await axios.post(`${BASE}/upload/image`, form, {
      headers: form.getHeaders()
    });
    test('Upload without auth token: 200', r.status === 200);
    test('success = true', r.data.success === true);
    if (r.data.data?.path) uploadedPaths.push(r.data.data.path);
  } catch (e) {
    test('Upload without auth', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // B. SINGLE IMAGE UPLOAD — PNG
  // ══════════════════════════════════════════════════════════════
  section('B. Single image upload — PNG');
  try {
    const form = new FormData();
    form.append('image', fs.createReadStream(pngFile));
    const r = await axios.post(`${BASE}/upload/image`, form, {
      headers: form.getHeaders()
    });
    test('PNG upload: 200', r.status === 200);
    test('message = "Image uploaded successfully"', r.data.message === 'Image uploaded successfully');

    const d = r.data.data;
    test('Has filename', !!d.filename);
    test('Has originalName', d.originalName === 'test-image.png');
    test('Has mimeType', !!d.mimeType);
    test('Has size (number)', typeof d.size === 'number' && d.size > 0);
    test('Has sizeFormatted', !!d.sizeFormatted);
    test('Has extension = .png', d.extension === '.png');
    test('Has path (starts with uploads/)', d.path.startsWith('uploads/'));
    test('Has url (http)', d.url.startsWith('http'));
    test('filename is UUID format', d.filename.length > 30);

    log('Response', d);
    if (d.path) uploadedPaths.push(d.path);
  } catch (e) {
    test('PNG upload', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // C. MULTIPLE EXTENSIONS — JPG, GIF, WebP, BMP, SVG
  // ══════════════════════════════════════════════════════════════
  section('C. Multiple extensions — JPG, GIF, WebP, BMP, SVG');
  const extTests = [
    { name: 'JPG', file: jpgFile, ext: '.jpg' },
    { name: 'GIF', file: gifFile, ext: '.gif' },
    { name: 'WebP', file: webpFile, ext: '.webp' },
    { name: 'BMP', file: bmpFile, ext: '.bmp' },
    { name: 'SVG', file: svgFile, ext: '.svg' },
  ];

  for (const t of extTests) {
    try {
      const form = new FormData();
      form.append('image', fs.createReadStream(t.file));
      const r = await axios.post(`${BASE}/upload/image`, form, {
        headers: form.getHeaders()
      });
      test(`${t.name}: upload success`, r.status === 200);
      test(`${t.name}: extension = ${t.ext}`, r.data.data.extension === t.ext);
      if (r.data.data?.path) uploadedPaths.push(r.data.data.path);
    } catch (e) {
      test(`${t.name}: upload`, false, e.response?.data?.message || e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // D. CUSTOM SUBFOLDER
  // ══════════════════════════════════════════════════════════════
  section('D. Custom subfolder via query param');
  try {
    const form = new FormData();
    form.append('image', fs.createReadStream(pngFile));
    const r = await axios.post(`${BASE}/upload/image?folder=menu-items`, form, {
      headers: form.getHeaders()
    });
    test('Custom folder: 200', r.status === 200);
    test('Path includes menu-items', r.data.data.path.includes('menu-items'));
    log('Path', r.data.data.path);
    if (r.data.data?.path) uploadedPaths.push(r.data.data.path);
  } catch (e) {
    test('Custom folder upload', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // E. MULTIPLE FILES UPLOAD
  // ══════════════════════════════════════════════════════════════
  section('E. Multiple files upload');
  try {
    const form = new FormData();
    form.append('images', fs.createReadStream(pngFile));
    form.append('images', fs.createReadStream(jpgFile));
    form.append('images', fs.createReadStream(gifFile));
    const r = await axios.post(`${BASE}/upload/images`, form, {
      headers: form.getHeaders()
    });
    test('Multiple upload: 200', r.status === 200);
    test('data.count = 3', r.data.data.count === 3);
    test('data.files is array', Array.isArray(r.data.data.files));
    test('Each file has url', r.data.data.files.every(f => f.url.startsWith('http')));
    test('Each file has path', r.data.data.files.every(f => f.path.startsWith('uploads/')));
    log('Files', r.data.data.files.map(f => ({ name: f.originalName, ext: f.extension, size: f.sizeFormatted })));
    r.data.data.files.forEach(f => uploadedPaths.push(f.path));
  } catch (e) {
    test('Multiple upload', false, e.response?.data?.message || e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // F. INVALID FILE TYPE — should reject
  // ══════════════════════════════════════════════════════════════
  section('F. Invalid file type — .txt and .js should be rejected');
  for (const inv of [{ name: '.txt', file: txtFile }, { name: '.js', file: jsFile }]) {
    try {
      const form = new FormData();
      form.append('image', fs.createReadStream(inv.file));
      await axios.post(`${BASE}/upload/image`, form, {
        headers: form.getHeaders()
      });
      test(`${inv.name}: should reject`, false);
    } catch (e) {
      test(`${inv.name}: rejected with 400`, e.response?.status === 400);
      test(`${inv.name}: has error message`, !!e.response?.data?.message);
      log(`${inv.name} error`, e.response?.data?.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // G. NO FILE PROVIDED — should error
  // ══════════════════════════════════════════════════════════════
  section('G. No file provided');
  try {
    const form = new FormData();
    const r = await axios.post(`${BASE}/upload/image`, form, {
      headers: form.getHeaders()
    });
    test('No file: should return 400', r.status === 400);
  } catch (e) {
    test('No file: 400', e.response?.status === 400);
    test('Error message mentions "No image"', e.response?.data?.message?.includes('No image'));
    log('Error', e.response?.data?.message);
  }

  // ══════════════════════════════════════════════════════════════
  // H. FILE URL IS ACCESSIBLE
  // ══════════════════════════════════════════════════════════════
  section('H. Uploaded file URL is accessible');
  if (uploadedPaths.length > 0) {
    const testPath = uploadedPaths[0];
    const url = `http://localhost:3000/${testPath}`;
    try {
      const r = await axios.get(url, { responseType: 'arraybuffer' });
      test('File accessible via URL: 200', r.status === 200);
      test('Content-type is image', r.headers['content-type']?.includes('image') || r.headers['content-type']?.includes('octet'));
      log('URL', url);
    } catch (e) {
      test('File accessible via URL', false, `${e.response?.status}: ${url}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // I. DELETE UPLOADED FILE
  // ══════════════════════════════════════════════════════════════
  section('I. Delete uploaded file');
  if (uploadedPaths.length > 0) {
    const delPath = uploadedPaths[uploadedPaths.length - 1];
    try {
      const r = await axios.delete(`${BASE}/upload/image`, {
        data: { path: delPath }
      });
      test('Delete: 200', r.status === 200);
      test('message = "Image deleted successfully"', r.data.message === 'Image deleted successfully');
    } catch (e) {
      test('Delete', false, e.response?.data?.message || e.message);
    }

    // Verify it's gone
    try {
      await axios.delete(`${BASE}/upload/image`, {
        data: { path: delPath }
      });
      test('Delete again: should 404', false);
    } catch (e) {
      test('Delete again: 404', e.response?.status === 404);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // J. SECURITY — directory traversal blocked
  // ══════════════════════════════════════════════════════════════
  section('J. Security — directory traversal blocked');
  try {
    await axios.delete(`${BASE}/upload/image`, {
      data: { path: '../../../etc/passwd' }
    });
    test('Traversal: should reject', false);
  } catch (e) {
    test('Traversal: rejected 400', e.response?.status === 400);
    test('Error: "Invalid file path"', e.response?.data?.message === 'Invalid file path.');
  }

  // No path provided
  try {
    await axios.delete(`${BASE}/upload/image`, { data: {} });
    test('No path: should reject', false);
  } catch (e) {
    test('No path: rejected 400', e.response?.status === 400);
  }

  // ══════════════════════════════════════════════════════════════
  // CLEANUP temp files
  // ══════════════════════════════════════════════════════════════
  cleanup();

  // ══════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  RESULTS: ✓ ${passed} passed, ✗ ${failed} failed`);
  console.log(`${'═'.repeat(70)}`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
})().catch(err => {
  cleanup();
  console.error('Fatal:', err.response?.data || err.message);
  process.exit(1);
});
