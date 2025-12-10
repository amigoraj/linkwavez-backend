// config/cloudinary.js
// Cloudinary Configuration for Media Upload

const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Validate environment variables
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.warn('⚠️ CLOUDINARY_CLOUD_NAME not set in .env file');
}

if (!process.env.CLOUDINARY_API_KEY) {
  console.warn('⚠️ CLOUDINARY_API_KEY not set in .env file');
}

if (!process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️ CLOUDINARY_API_SECRET not set in .env file');
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

console.log('✅ Cloudinary configured successfully!');

module.exports = cloudinary;