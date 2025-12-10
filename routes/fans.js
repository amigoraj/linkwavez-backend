const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET FAN STATUS
router.get('/:fanId/status/:celebrityId', async (req, res) => {
  try {
    const { fanId, celebrityId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        ufs.*,
        fb.badge_name,
        fb.badge_icon,
        fb.badge_color,
        fb.min_interactions as current_tier_min,
        (SELECT min_interactions FROM fan_badges 
         WHERE min_interactions > fb.min_interactions 
         ORDER BY min_interactions ASC LIMIT 1) as next_tier_min
      FROM user_fan_status ufs
      LEFT JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      WHERE ufs.fan_user_id = $1 AND ufs.celebrity_user_id = $2
    `, [fanId, celebrityId]);
    
    if (result.rows.length === 0) {
      const newFan = await pool.query(`
        INSERT INTO user_fan_status 
        (fan_user_id, celebrity_user_id, current_badge_id)
        SELECT $1, $2, id FROM fan_badges WHERE badge_name = 'New Fan'
        RETURNING *
      `, [fanId, celebrityId]);
      
      return res.json({
        status: 'success',
        data: newFan.rows[0]
      });
    }
    
    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// LOG FAN INTERACTION
router.post('/:fanId/interaction', async (req, res) => {
  try {
    const { fanId } = req.params;
    const { celebrity_user_id, interaction_type, post_id } = req.body;
    
    await pool.query(`
      INSERT INTO fan_interactions 
      (fan_user_id, celebrity_user_id, interaction_type, post_id)
      VALUES ($1, $2, $3, $4)
    `, [fanId, celebrity_user_id, interaction_type, post_id]);
    
    await pool.query(`
      INSERT INTO user_fan_status (fan_user_id, celebrity_user_id, total_interactions, comment_count, reaction_count)
      VALUES ($1, $2, 1, 
        CASE WHEN $3 = 'comment' THEN 1 ELSE 0 END,
        CASE WHEN $3 = 'reaction' THEN 1 ELSE 0 END)
      ON CONFLICT (fan_user_id, celebrity_user_id)
      DO UPDATE SET
        total_interactions = user_fan_status.total_interactions + 1,
        comment_count = user_fan_status.comment_count + 
          CASE WHEN $3 = 'comment' THEN 1 ELSE 0 END,
        reaction_count = user_fan_status.reaction_count + 
          CASE WHEN $3 = 'reaction' THEN 1 ELSE 0 END,
        last_interaction_at = CURRENT_TIMESTAMP
    `, [fanId, celebrity_user_id, interaction_type]);
    
    await pool.query(`
      UPDATE user_fan_status ufs
      SET current_badge_id = (
        SELECT id FROM fan_badges
        WHERE min_interactions <= ufs.total_interactions
        ORDER BY min_interactions DESC
        LIMIT 1
      ),
      badge_earned_at = CASE 
        WHEN current_badge_id != (
          SELECT id FROM fan_badges
          WHERE min_interactions <= ufs.total_interactions
          ORDER BY min_interactions DESC
          LIMIT 1
        ) THEN CURRENT_TIMESTAMP
        ELSE badge_earned_at
      END
      WHERE fan_user_id = $1 AND celebrity_user_id = $2
    `, [fanId, celebrity_user_id]);
    
    res.json({
      status: 'success',
      message: 'Interaction logged successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET FAN LEADERBOARD
router.get('/:celebrityId/leaderboard', async (req, res) => {
  try {
    const { celebrityId } = req.params;
    const { limit = 100 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        ROW_NUMBER() OVER (ORDER BY ufs.total_interactions DESC) as rank,
        u.id,
        u.username,
        u.avatar_url,
        ufs.total_interactions,
        ufs.comment_count,
        ufs.reaction_count,
        fb.badge_name,
        fb.badge_icon,
        fb.badge_color
      FROM user_fan_status ufs
      JOIN users u ON ufs.fan_user_id = u.id
      LEFT JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      WHERE ufs.celebrity_user_id = $1
      ORDER BY ufs.total_interactions DESC
      LIMIT $2
    `, [celebrityId, limit]);
    
    res.json({
      status: 'success',
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET USER'S BADGES
router.get('/:userId/badges', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        c.id as celebrity_id,
        c.username as celebrity_username,
        c.avatar_url as celebrity_avatar,
        fb.badge_name,
        fb.badge_icon,
        fb.badge_color,
        ufs.total_interactions,
        ufs.badge_earned_at
      FROM user_fan_status ufs
      JOIN users c ON ufs.celebrity_user_id = c.id
      LEFT JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      WHERE ufs.fan_user_id = $1
      AND fb.badge_name IS NOT NULL
      ORDER BY ufs.badge_earned_at DESC
    `, [userId]);
    
    res.json({
      status: 'success',
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;