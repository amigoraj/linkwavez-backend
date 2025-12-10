// middleware/upload.js
// Multer Middleware for File Upload

const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (we'll upload directly to Cloudinary)
const storage = multer.memoryStorage();

// File filter - only allow images and videos
const fileFilter = (req, file, cb) => {
  // Allowed image extensions
  const imageTypes = /jpeg|jpg|png|gif|webp/;
  // Allowed video extensions
  const videoTypes = /mp4|mov|avi|wmv|flv|mkv/;
  
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;
  
  // Check if it's an image
  const isImage = imageTypes.test(extname) && mimetype.startsWith('image/');
  
  // Check if it's a video
  const isVideo = videoTypes.test(extname) && mimetype.startsWith('video/');
  
  if (isImage || isVideo) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed!'), false);
  }
};

// Multer upload configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max file size
  }
});

module.exports = upload;