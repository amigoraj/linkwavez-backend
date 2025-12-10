const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { checkPremium } = require('../middleware/checkPremium');

// GET CELEBRITY DASHBOARD
router.get('/dashboard/:userId', checkPremium('celebrity_dashboard'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const celebrity = await pool.query(`
      SELECT u.id, u.username, u.avatar_url, u.bio, u.wisdom_score,
             (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as total_followers
      FROM users u
      WHERE u.id = $1
    `, [userId]);
    
    if (celebrity.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    
    const fanTiers = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE fb.badge_name = 'Die-Hard Fan') as die_hard_count,
        COUNT(*) FILTER (WHERE fb.badge_name = 'Super Fan') as super_fan_count,
        COUNT(*) FILTER (WHERE fb.badge_name = 'Loyal Fan') as loyal_fan_count,
        COUNT(*) FILTER (WHERE fb.badge_name = 'Active Fan') as active_fan_count,
        COUNT(*) FILTER (WHERE fb.badge_name = 'New Fan') as new_fan_count
      FROM user_fan_status ufs
      LEFT JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      WHERE ufs.celebrity_user_id = $1
    `, [userId]);
    
    const todayStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT fi.fan_user_id) as active_fans_today,
        COUNT(*) FILTER (WHERE fi.interaction_type = 'comment') as comments_today,
        COUNT(*) FILTER (WHERE fi.interaction_type = 'reaction') as reactions_today
      FROM fan_interactions fi
      WHERE fi.celebrity_user_id = $1
      AND DATE(fi.created_at) = CURRENT_DATE
    `, [userId]);
    
    const dieHardFans = await pool.query(`
      SELECT u.id, u.username, u.avatar_url, ufs.total_interactions, fb.badge_name
      FROM user_fan_status ufs
      JOIN users u ON ufs.fan_user_id = u.id
      JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      WHERE ufs.celebrity_user_id = $1
      AND fb.badge_name = 'Die-Hard Fan'
      ORDER BY ufs.total_interactions DESC
      LIMIT 10
    `, [userId]);
    
    res.json({
      status: 'success',
      data: {
        celebrity: celebrity.rows[0],
        fan_tiers: fanTiers.rows[0],
        today_stats: todayStats.rows[0],
        die_hard_fans: dieHardFans.rows
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET FAN TIERS BREAKDOWN
router.get('/:userId/fans/tiers', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        fb.badge_name,
        fb.badge_icon,
        fb.badge_color,
        COUNT(ufs.id) as count
      FROM fan_badges fb
      LEFT JOIN user_fan_status ufs ON fb.id = ufs.current_badge_id 
        AND ufs.celebrity_user_id = $1
      GROUP BY fb.id, fb.badge_name, fb.badge_icon, fb.badge_color
      ORDER BY fb.min_interactions DESC
    `, [userId]);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET DIE-HARD FANS LIST
router.get('/:userId/fans/die-hard', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        u.bio,
        ufs.total_interactions,
        ufs.comment_count,
        ufs.reaction_count,
        ufs.first_interaction_at,
        fb.badge_name,
        fb.badge_icon
      FROM user_fan_status ufs
      JOIN users u ON ufs.fan_user_id = u.id
      JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      WHERE ufs.celebrity_user_id = $1
      AND fb.badge_name IN ('Die-Hard Fan', 'Super Fan')
      ORDER BY ufs.total_interactions DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
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

// GET CELEBRITY SETTINGS
router.get('/:userId/settings', async (req, res) => {
  try {
    const { userId } = req.params;
    
    let result = await pool.query(`
      SELECT * FROM celebrity_settings
      WHERE celebrity_user_id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      result = await pool.query(`
        INSERT INTO celebrity_settings (celebrity_user_id)
        VALUES ($1)
        RETURNING *
      `, [userId]);
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

// UPDATE CELEBRITY SETTINGS
router.put('/:userId/settings', async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      enable_ai_replies,
      enable_auto_filter,
      dm_access_tier,
      comment_filter_level,
      show_fan_tiers_publicly,
      auto_thank_new_fans,
      monthly_shoutout_enabled
    } = req.body;
    
    const result = await pool.query(`
      UPDATE celebrity_settings
      SET 
        enable_ai_replies = COALESCE($1, enable_ai_replies),
        enable_auto_filter = COALESCE($2, enable_auto_filter),
        dm_access_tier = COALESCE($3, dm_access_tier),
        comment_filter_level = COALESCE($4, comment_filter_level),
        show_fan_tiers_publicly = COALESCE($5, show_fan_tiers_publicly),
        auto_thank_new_fans = COALESCE($6, auto_thank_new_fans),
        monthly_shoutout_enabled = COALESCE($7, monthly_shoutout_enabled),
        updated_at = CURRENT_TIMESTAMP
      WHERE celebrity_user_id = $8
      RETURNING *
    `, [
      enable_ai_replies,
      enable_auto_filter,
      dm_access_tier,
      comment_filter_level,
      show_fan_tiers_publicly,
      auto_thank_new_fans,
      monthly_shoutout_enabled,
      userId
    ]);
    
    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET AI INSIGHTS
router.get('/:userId/insights', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, unread_only = false } = req.query;
    
    let query = `
      SELECT * FROM ai_insights
      WHERE celebrity_user_id = $1
    `;
    
    if (unread_only === 'true') {
      query += ` AND is_read = false`;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $2`;
    
    const result = await pool.query(query, [userId, limit]);
    
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

// CREATE AI INSIGHT
router.post('/:userId/insights', async (req, res) => {
  try {
    const { userId } = req.params;
    const { insight_type, insight_title, insight_description, priority } = req.body;
    
    const result = await pool.query(`
      INSERT INTO ai_insights 
      (celebrity_user_id, insight_type, insight_title, insight_description, priority)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, insight_type, insight_title, insight_description, priority || 'medium']);
    
    res.status(201).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET FILTERED COMMENTS (By Priority)
router.get('/:userId/comments/filtered', async (req, res) => {
  try {
    const { userId } = req.params;
    const { post_id, filter = 'all' } = req.query;
    
    let priorityFilter = '';
    
    switch(filter) {
      case 'superfan_plus':
        priorityFilter = `AND cps.subscription_level = 'superfan_plus'`;
        break;
      case 'superfan':
        priorityFilter = `AND cps.subscription_level IN ('superfan', 'superfan_plus')`;
        break;
      case 'die_hard':
        priorityFilter = `AND cps.fan_tier = 'die_hard'`;
        break;
      case 'premium':
        priorityFilter = `AND cps.subscription_level IN ('superfan', 'superfan_plus')`;
        break;
    }
    
    const result = await pool.query(`
      SELECT 
        c.*,
        u.username,
        u.avatar_url,
        cps.priority_score,
        cps.subscription_level,
        cps.fan_tier,
        fb.badge_name as fan_badge,
        fb.badge_icon as fan_badge_icon,
        sp.badge_icon as subscription_badge,
        sp.badge_color as subscription_badge_color
      FROM comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN comment_priority_scores cps ON c.id = cps.comment_id
      LEFT JOIN user_fan_status ufs ON ufs.fan_user_id = c.user_id AND ufs.celebrity_user_id = $1
      LEFT JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      LEFT JOIN subscriptions sub ON sub.user_id = c.user_id AND sub.status = 'active'
      LEFT JOIN subscription_plans sp ON sub.plan_id = sp.id
      WHERE c.clip_id = $2
      ${priorityFilter}
      ORDER BY cps.priority_score DESC NULLS LAST, c.created_at DESC
      LIMIT 100
    `, [userId, post_id]);
    
    res.json({
      status: 'success',
      filter: filter,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;