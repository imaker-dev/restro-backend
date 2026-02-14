/**
 * Global Image Upload Utility
 * Handles local file storage with multer — supports all common image formats
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/app.config');

// Allowed image extensions
const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
  '.svg', '.tiff', '.tif', '.ico', '.heic', '.heif', '.avif'
];

// Allowed MIME types
const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp',
  'image/svg+xml', 'image/tiff', 'image/x-icon', 'image/vnd.microsoft.icon',
  'image/heic', 'image/heif', 'image/avif'
];

// Max file size (from config or 10MB default)
const MAX_FILE_SIZE = config.maxFileSize || 10 * 1024 * 1024;

// Base upload directory
const UPLOAD_DIR = path.resolve(config.uploadPath || './uploads');

/**
 * Ensure upload directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Configure multer storage — saves to uploads/<subfolder>/
 */
function createStorage(subfolder = 'images') {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dest = path.join(UPLOAD_DIR, subfolder);
      ensureDir(dest);
      cb(null, dest);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${uuidv4()}${ext}`;
      cb(null, uniqueName);
    }
  });
}

/**
 * File filter — only allow images
 */
function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = ALLOWED_MIMES.includes(file.mimetype);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);

  if (mimeOk || extOk) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 
      `Invalid file type: ${ext} (${file.mimetype}). Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
    ));
  }
}

/**
 * Build full public URL for an uploaded file
 */
function getFileUrl(req, relativePath) {
  const protocol = req.protocol;
  const host = req.get('host');
  // Normalize path separators for URL
  const urlPath = relativePath.replace(/\\/g, '/');
  return `${protocol}://${host}/${urlPath}`;
}

/**
 * Create upload middleware for single image
 * @param {string} fieldName - Form field name (default: 'image')
 * @param {string} subfolder - Subfolder under uploads/ (default: 'images')
 */
function singleImage(fieldName = 'image', subfolder = 'images') {
  return multer({
    storage: createStorage(subfolder),
    fileFilter: imageFileFilter,
    limits: { fileSize: MAX_FILE_SIZE }
  }).single(fieldName);
}

/**
 * Create upload middleware for multiple images
 * @param {string} fieldName - Form field name (default: 'images')
 * @param {number} maxCount - Maximum number of files (default: 10)
 * @param {string} subfolder - Subfolder under uploads/ (default: 'images')
 */
function multipleImages(fieldName = 'images', maxCount = 10, subfolder = 'images') {
  return multer({
    storage: createStorage(subfolder),
    fileFilter: imageFileFilter,
    limits: { fileSize: MAX_FILE_SIZE }
  }).array(fieldName, maxCount);
}

/**
 * Format file info for API response
 */
function formatFileResponse(req, file) {
  const relativePath = path.join('uploads', path.relative(UPLOAD_DIR, file.path));
  return {
    filename: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    sizeFormatted: formatBytes(file.size),
    extension: path.extname(file.originalname).toLowerCase(),
    path: relativePath.replace(/\\/g, '/'),
    url: getFileUrl(req, relativePath)
  };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Delete an uploaded file by its relative path
 */
function deleteFile(relativePath) {
  const fullPath = path.resolve(relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

module.exports = {
  singleImage,
  multipleImages,
  formatFileResponse,
  deleteFile,
  getFileUrl,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIMES,
  MAX_FILE_SIZE,
  UPLOAD_DIR
};
