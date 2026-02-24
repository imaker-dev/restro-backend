/**
 * ESC/POS Image Utility
 * Converts images to ESC/POS raster bitmap format for thermal printers
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');

/**
 * Convert image to ESC/POS raster bitmap format
 * @param {string|Buffer} imageSource - Image path, URL, or buffer
 * @param {object} options - Conversion options
 * @param {number} options.maxWidth - Maximum width in pixels (default 384 for 80mm paper)
 * @param {number} options.maxHeight - Maximum height in pixels (default 200)
 * @param {number} options.threshold - Black/white threshold 0-255 (default 128)
 * @returns {Promise<Buffer>} - ESC/POS bitmap data
 */
async function imageToEscPos(imageSource, options = {}) {
  const {
    maxWidth = 384,  // 80mm paper = ~384 pixels at 203 DPI
    maxHeight = 200,
    threshold = 128
  } = options;

  try {
    let imageBuffer;

    // Handle different input types
    if (Buffer.isBuffer(imageSource)) {
      imageBuffer = imageSource;
    } else if (typeof imageSource === 'string') {
      if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
        // Download from URL using built-in fetch (Node.js 18+)
        const response = await fetch(imageSource);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.status}`);
        }
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        // Read from file path
        imageBuffer = await fs.readFile(imageSource);
      }
    } else {
      throw new Error('Invalid image source type');
    }

    // Process image with sharp
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    // Calculate resize dimensions maintaining aspect ratio
    let width = metadata.width;
    let height = metadata.height;

    if (width > maxWidth) {
      height = Math.round(height * (maxWidth / width));
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = Math.round(width * (maxHeight / height));
      height = maxHeight;
    }

    // Width must be multiple of 8 for ESC/POS
    width = Math.floor(width / 8) * 8;

    // Convert to grayscale, resize, and get raw pixel data
    const { data, info } = await image
      .resize(width, height, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Convert to 1-bit bitmap (black & white)
    const bytesPerRow = Math.ceil(info.width / 8);
    const bitmapData = [];

    for (let y = 0; y < info.height; y++) {
      for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = byteIdx * 8 + bit;
          if (x < info.width) {
            const pixelIdx = y * info.width + x;
            const pixelValue = data[pixelIdx];
            // Invert: dark pixels become 1 (black prints)
            if (pixelValue < threshold) {
              byte |= (0x80 >> bit);
            }
          }
        }
        bitmapData.push(byte);
      }
    }

    // Build ESC/POS raster bit image command
    // GS v 0 m xL xH yL yH d1...dk
    const xL = bytesPerRow & 0xFF;
    const xH = (bytesPerRow >> 8) & 0xFF;
    const yL = info.height & 0xFF;
    const yH = (info.height >> 8) & 0xFF;

    const escposCommand = Buffer.concat([
      Buffer.from([0x1D, 0x76, 0x30, 0x00]), // GS v 0 (normal mode)
      Buffer.from([xL, xH, yL, yH]),
      Buffer.from(bitmapData)
    ]);

    return escposCommand;
  } catch (error) {
    logger.error('Image to ESC/POS conversion failed:', error);
    throw error;
  }
}

/**
 * Create centered logo command with line feeds
 * @param {Buffer} logoData - ESC/POS bitmap data from imageToEscPos
 * @returns {Buffer} - Centered logo with spacing
 */
function wrapLogoWithAlignment(logoData) {
  if (!logoData || !Buffer.isBuffer(logoData)) {
    return Buffer.alloc(0);
  }

  return Buffer.concat([
    Buffer.from([0x1B, 0x61, 0x01]),  // Align center
    logoData,
    Buffer.from([0x0A]),              // Line feed
    Buffer.from([0x1B, 0x61, 0x00])   // Align left
  ]);
}

/**
 * Load and cache logo for an outlet
 * @param {string} logoUrl - URL or path to logo
 * @param {object} options - Conversion options
 * @returns {Promise<Buffer|null>} - ESC/POS logo data or null if failed
 */
async function loadOutletLogo(logoUrl, options = {}) {
  if (!logoUrl) {
    return null;
  }

  try {
    const logoBuffer = await imageToEscPos(logoUrl, {
      maxWidth: options.maxWidth || 300,
      maxHeight: options.maxHeight || 120,
      threshold: options.threshold || 128
    });
    return wrapLogoWithAlignment(logoBuffer);
  } catch (error) {
    logger.warn(`Failed to load outlet logo: ${logoUrl}`, error.message);
    return null;
  }
}

module.exports = {
  imageToEscPos,
  wrapLogoWithAlignment,
  loadOutletLogo
};
