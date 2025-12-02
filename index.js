const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
  } else {
    console.log('✅ Database connected successfully!');
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: '🌊 LinkWavez API is running! 🚀',
    app: 'LinkWavez',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Get all wisdom clips
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

// Get categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM video_categories ORDER BY name'
    );
    
    res.json({
      status: 'success',
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

// Get businesses
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

// Start server
app.listen(port, () => {
  console.log(`🌊 LinkWavez API running on port ${port}`);
});