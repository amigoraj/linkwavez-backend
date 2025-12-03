const express = require('express');
const cors = require('cors');
const { pool } = require('./config/database');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const usersRoutes = require('./routes/users');

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: '🌊 LinkWavez API is running! 🚀',
    app: 'LinkWavez',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      users: '/api/users',
      clips: '/api/clips',
      categories: '/api/categories',
      businesses: '/api/businesses'
    }
  });
});

// ========================================
// USER ROUTES
// ========================================
app.use('/api/users', usersRoutes);

// ========================================
// WISDOM CLIPS ROUTES
// ========================================
app.get('/api/clips', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM wisdom_clips ORDER BY created_at DESC LIMIT 20'
    );
    
    res.json({
      status: 'success',
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ========================================
// CATEGORY ROUTES
// ========================================
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM video_categories ORDER BY name'
    );
    
    res.json({
      status: 'success',
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ========================================
// BUSINESS ROUTES
// ========================================
app.get('/api/businesses', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM businesses ORDER BY name'
    );
    
    res.json({
      status: 'success',
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

app.get('/api/businesses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM businesses WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Business not found'
      });
    }
    
    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// ========================================
// ERROR HANDLING
// ========================================
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ========================================
// START SERVER
// ========================================
app.listen(port, () => {
  console.log(`🌊 LinkWavez API running on port ${port}`);
  console.log(`📍 http://localhost:${port}`);
});