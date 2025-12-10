const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET FAN SUBSCRIPTION PLANS
router.get('/plans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM subscription_plans
      WHERE plan_type IN ('superfan', 'superfan_plus')
      AND is_active = true
      ORDER BY price_monthly ASC
    `);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// SUBSCRIBE AS SUPERFAN
router.post('/subscribe', async (req, res) => {
  try {
    const { user_id, plan_type } = req.body;
    
    const plan = await pool.query(`
      SELECT * FROM subscription_plans WHERE plan_type = $1
    `, [plan_type]);
    
    if (plan.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Plan not found' });
    }
    
    const result = await pool.query(`
      INSERT INTO subscriptions 
      (user_id, plan_id, plan_type, status, started_at, expires_at, next_billing_date)
      VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP, 
              CURRENT_TIMESTAMP + INTERVAL '1 month',
              CURRENT_TIMESTAMP + INTERVAL '1 month')
      ON CONFLICT (user_id) 
      DO UPDATE SET
        plan_id = $2,
        plan_type = $3,
        status = 'active',
        started_at = CURRENT_TIMESTAMP,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '1 month',
        next_billing_date = CURRENT_TIMESTAMP + INTERVAL '1 month'
      RETURNING *
    `, [user_id, plan.rows[0].id, plan_type]);
    
    res.status(201).json({
      status: 'success',
      message: `Successfully subscribed to ${plan_type}!`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET EXCLUSIVE CONTENT FOR FAN
router.get('/exclusive-content/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { celebrity_id } = req.query;
    
    const subscription = await pool.query(`
      SELECT sp.plan_type, sp.features
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = $1 AND s.status = 'active'
    `, [userId]);
    
    const fanStatus = await pool.query(`
      SELECT fb.badge_name
      FROM user_fan_status ufs
      LEFT JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      WHERE ufs.fan_user_id = $1 AND ufs.celebrity_user_id = $2
    `, [userId, celebrity_id]);
    
    let subscriptionLevel = 'free';
    let fanTier = 'new';
    
    if (subscription.rows.length > 0) {
      subscriptionLevel = subscription.rows[0].plan_type;
    }
    
    if (fanStatus.rows.length > 0) {
      fanTier = fanStatus.rows[0].badge_name?.toLowerCase().replace(' fan', '').replace('-', '_') || 'new';
    }
    
    const content = await pool.query(`
      SELECT 
        ec.*,
        u.username as celebrity_username,
        u.avatar_url as celebrity_avatar
      FROM exclusive_content ec
      JOIN users u ON ec.celebrity_user_id = u.id
      WHERE ec.celebrity_user_id = $1
      AND (ec.expires_at IS NULL OR ec.expires_at > CURRENT_TIMESTAMP)
      AND (
        (ec.required_subscription IS NULL) OR
        (ec.required_subscription = 'superfan' AND $2 IN ('superfan', 'superfan_plus')) OR
        (ec.required_subscription = 'superfan_plus' AND $2 = 'superfan_plus')
      )
      ORDER BY ec.created_at DESC
    `, [celebrity_id, subscriptionLevel]);
    
    res.json({
      status: 'success',
      user_subscription: subscriptionLevel,
      fan_tier: fanTier,
      count: content.rows.length,
      data: content.rows
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// CALCULATE AND LOG COMMENT PRIORITY
router.post('/comment/calculate-priority', async (req, res) => {
  try {
    const { comment_id, user_id, celebrity_id } = req.body;
    
    const subscription = await pool.query(`
      SELECT sp.plan_type
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = $1 AND s.status = 'active'
    `, [user_id]);
    
    let subscriptionLevel = 'free';
    if (subscription.rows.length > 0) {
      subscriptionLevel = subscription.rows[0].plan_type;
    }
    
    const fanStatus = await pool.query(`
      SELECT fb.badge_name
      FROM user_fan_status ufs
      LEFT JOIN fan_badges fb ON ufs.current_badge_id = fb.id
      WHERE ufs.fan_user_id = $1 AND ufs.celebrity_user_id = $2
    `, [user_id, celebrity_id]);
    
    let fanTier = 'new';
    if (fanStatus.rows.length > 0) {
      const badgeName = fanStatus.rows[0].badge_name;
      fanTier = badgeName?.toLowerCase().replace(' fan', '').replace('-', '_') || 'new';
    }
    
    const result = await pool.query(`
      INSERT INTO comment_priority_scores
      (comment_id, user_id, celebrity_id, subscription_level, fan_tier, priority_score)
      VALUES (
        $1, $2, $3, $4, $5,
        calculate_comment_priority_score($4, $5, 0)
      )
      ON CONFLICT (comment_id)
      DO UPDATE SET
        priority_score = calculate_comment_priority_score($4, $5, 0),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [comment_id, user_id, celebrity_id, subscriptionLevel, fanTier]);
    
    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;