/**
 * Global Image Upload Routes — NO authentication required
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = require('../utils/upload');

/**
 * @route   POST /api/v1/upload/image
 * @desc    Upload a single image (no auth)
 * @field   image — form-data file field
 * @query   folder — optional subfolder (default: 'images')
 * @access  Public
 */
router.post('/image', (req, res) => {
  const subfolder = req.query.folder || 'images';
  const middleware = upload.singleImage('image', subfolder);

  middleware(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `File too large. Maximum size: ${(upload.MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB`
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: err.field || 'Invalid file type. Only image files are allowed.'
          });
        }
        return res.status(400).json({ success: false, message: err.message });
      }
      // Handle malformed/empty form-data gracefully
      if (err.message && (err.message.includes('Unexpected end') || err.message.includes('Multipart'))) {
        return res.status(400).json({
          success: false,
          message: 'No image file provided. Send file in "image" field (multipart/form-data).'
        });
      }
      return res.status(500).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided. Send file in "image" field (multipart/form-data).'
      });
    }

    const fileInfo = upload.formatFileResponse(req, req.file);
    res.json({
      success: true,
      message: 'Image uploaded successfully',
      data: fileInfo
    });
  });
});

/**
 * @route   POST /api/v1/upload/images
 * @desc    Upload multiple images (no auth)
 * @field   images — form-data file field (up to 10)
 * @query   folder — optional subfolder (default: 'images')
 * @query   maxCount — optional max file count (default: 10)
 * @access  Public
 */
router.post('/images', (req, res) => {
  const subfolder = req.query.folder || 'images';
  const maxCount = Math.min(20, Math.max(1, parseInt(req.query.maxCount) || 10));
  const middleware = upload.multipleImages('images', maxCount, subfolder);

  middleware(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `File too large. Maximum size per file: ${(upload.MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB`
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: `Too many files. Maximum: ${maxCount}`
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: err.field || 'Invalid file type. Only image files are allowed.'
          });
        }
        return res.status(400).json({ success: false, message: err.message });
      }
      return res.status(500).json({ success: false, message: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image files provided. Send files in "images" field (multipart/form-data).'
      });
    }

    const files = req.files.map(f => upload.formatFileResponse(req, f));
    res.json({
      success: true,
      message: `${files.length} image(s) uploaded successfully`,
      data: {
        files,
        count: files.length
      }
    });
  });
});

/**
 * @route   DELETE /api/v1/upload/image
 * @desc    Delete an uploaded image by path
 * @body    { path: "uploads/images/xxx.jpg" }
 * @access  Public
 */
router.delete('/image', (req, res) => {
  const { path: filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({
      success: false,
      message: 'File path is required in request body.'
    });
  }

  // Security: prevent directory traversal
  if (filePath.includes('..') || !filePath.startsWith('uploads/')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid file path.'
    });
  }

  const deleted = upload.deleteFile(filePath);
  if (deleted) {
    res.json({ success: true, message: 'Image deleted successfully' });
  } else {
    res.status(404).json({ success: false, message: 'File not found' });
  }
});

module.exports = router;
