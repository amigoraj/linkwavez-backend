// ============================================================================
// SIMPLE TEST SERVER - FIXED VERSION
// Now handles spaces in userId!
// ============================================================================

const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ============================================================================
// TEST ENDPOINT - Profile Picture Upload (FIXED!)
// ============================================================================
app.post('/api/media/profile-picture', upload.single('file'), (req, res) => {
  console.log('\n=== UPLOAD REQUEST RECEIVED ===');
  console.log('Body (raw):', req.body);
  console.log('File:', req.file ? {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  } : 'No file');
  
  // ✅ FIX: Trim whitespace from userId
  const userIdRaw = req.body.userId;
  const userId = userIdRaw ? userIdRaw.trim() : '';
  
  console.log('userId (raw):', `"${userIdRaw}"`);
  console.log('userId (trimmed):', `"${userId}"`);
  console.log('==============================\n');

  // Check userId
  if (!userId || userId === '') {
    return res.status(400).json({
      success: false,
      error: 'User ID is required',
      debug: {
        userIdRaw: userIdRaw,
        userIdTrimmed: userId,
        hasFile: !!req.file,
        bodyKeys: Object.keys(req.body)
      }
    });
  }

  // Check file
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded',
      debug: {
        userId: userId,
        hasFile: false
      }
    });
  }

  // ✅ SUCCESS!
  console.log('✅ Upload successful!');
  res.json({
    success: true,
    message: '🎉 Upload works perfectly! Your Postman setup is correct!',
    data: {
      userId: userId,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      message: 'Test successful! Now we can integrate with Cloudinary!'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Test server is running!',
    endpoints: {
      upload: 'POST /api/media/profile-picture'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  🧪 LINKWAVEZ TEST SERVER (FIXED!)            ║');
  console.log('║  Port: 10000                                   ║');
  console.log('║                                                ║');
  console.log('║  ✅ Now handles spaces in userId!             ║');
  console.log('║                                                ║');
  console.log('║  Test endpoint:                                ║');
  console.log('║  POST http://localhost:10000/api/media/profile-picture');
  console.log('║                                                ║');
  console.log('║  Form-data fields:                             ║');
  console.log('║  - userId (Text): test-user-123                ║');
  console.log('║  - file (File): select any image               ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log('✅ Server ready! Try your Postman request now!\n');
});

// Error handling
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({
    success: false,
    error: error.message
  });
});