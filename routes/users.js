const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// ========================================
// GET ALL USERS (with pagination & search)
// ========================================
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0, search } = req.query;
    
    let query = `
      SELECT u.id, u.username, u.email, u.avatar_url, u.bio, 
             u.wisdom_score, u.created_at,
             (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
             (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count
      FROM users u
    `;
    
    const params = [];
    
    if (search) {
      params.push(`%${search}%`);
      query += ` WHERE u.username ILIKE $${params.length} OR u.bio ILIKE $${params.length}`;
    }
    
    query += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
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
// GET SINGLE USER BY ID
// ========================================
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.avatar_url, u.bio, 
             u.wisdom_score, u.created_at,
             (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as followers_count,
             (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
             (SELECT COUNT(*) FROM wisdom_clips WHERE user_id = u.id) as clips_count
      FROM users u
      WHERE u.id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'User not found' 
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
// CREATE NEW USER
// ========================================
router.post('/', async (req, res) => {
  try {
    const { username, email, password_hash, avatar_url, bio } = req.body;
    
    if (!username || !email || !password_hash) {
      return res.status(400).json({
        status: 'error',
        message: 'Username, email, and password are required'
      });
    }
    
    const result = await pool.query(`
      INSERT INTO users (username, email, password_hash, avatar_url, bio)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, avatar_url, bio, wisdom_score, created_at
    `, [username, email, password_hash, avatar_url || null, bio || null]);
    
    const newUser = result.rows[0];
    
    await pool.query(`
      INSERT INTO avatars (user_id, avatar_data, aura_level, wisdom_level)
      VALUES ($1, '{}', 'bronze', 0)
    `, [newUser.id]);
    
    await pool.query(`
      INSERT INTO wallet (user_id, wisdom_coins, premium_coins)
      VALUES ($1, 0, 0)
    `, [newUser.id]);
    
    res.status(201).json({ 
      status: 'success', 
      data: newUser 
    });
  } catch (error) {
    console.error('Error:', error);
    if (error.code === '23505') {
      res.status(400).json({ 
        status: 'error', 
        message: 'Username or email already exists' 
      });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: error.message 
      });
    }
  }
});

// ========================================
// UPDATE USER
// ========================================
router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, email, avatar_url, bio } = req.body;
    
    const result = await pool.query(`
      UPDATE users 
      SET username = COALESCE($1, username),
          email = COALESCE($2, email),
          avatar_url = COALESCE($3, avatar_url),
          bio = COALESCE($4, bio),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING id, username, email, avatar_url, bio, wisdom_score, created_at
    `, [username, email, avatar_url, bio, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'User not found' 
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
// DELETE USER
// ========================================
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      status: 'success', 
      message: 'User deleted successfully' 
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
// GET USER'S FOLLOWERS
// ========================================
router.get('/:userId/followers', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT u.id, u.username, u.avatar_url, u.bio, u.wisdom_score
      FROM users u
      JOIN follows f ON u.id = f.follower_id
      WHERE f.following_id = $1
      ORDER BY f.created_at DESC
    `, [userId]);
    
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
// GET USER'S FOLLOWING
// ========================================
router.get('/:userId/following', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT u.id, u.username, u.avatar_url, u.bio, u.wisdom_score
      FROM users u
      JOIN follows f ON u.id = f.following_id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC
    `, [userId]);
    
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
// GET USER'S CLIPS
// ========================================
router.get('/:userId/clips', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT * FROM wisdom_clips
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
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
module.exports = router;
