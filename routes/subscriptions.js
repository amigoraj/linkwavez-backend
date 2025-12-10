const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET ALL SUBSCRIPTION PLANS
router.get('/plans', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM subscription_plans
      WHERE is_active = true
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

// GET USER'S SUBSCRIPTION
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT 
        s.*,
        sp.plan_name,
        sp.plan_type,
        sp.features,
        sp.badge_color,
        sp.badge_icon
      FROM subscriptions s
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = $1
      AND s.status = 'active'
      ORDER BY s.started_at DESC
      LIMIT 1
    `, [userId]);
    
    if (result.rows.length === 0) {
      const freePlan = await pool.query(`
        SELECT * FROM subscription_plans WHERE plan_type = 'free'
      `);
      
      return res.json({
        status: 'success',
        data: {
          plan_name: 'Free',
          plan_type: 'free',
          features: freePlan.rows[0].features,
          status: 'active'
        }
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

// CHECK FEATURE ACCESS
router.get('/user/:userId/feature/:featureName', async (req, res) => {
  try {
    const { userId, featureName } = req.params;
    
    const subscription = await pool.query(`
      SELECT sp.features
      FROM subscriptions s
      JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE s.user_id = $1
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
    `, [userId]);
    
    let hasAccess = false;
    
    if (subscription.rows.length > 0) {
      const features = subscription.rows[0].features;
      hasAccess = features[featureName] === true;
    }
    
    res.json({
      status: 'success',
      feature: featureName,
      has_access: hasAccess
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// CREATE SUBSCRIPTION
router.post('/subscribe', async (req, res) => {
  try {
    const { user_id, plan_type, payment_method } = req.body;
    
    const plan = await pool.query(`
      SELECT * FROM subscription_plans WHERE plan_type = $1
    `, [plan_type]);
    
    if (plan.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Plan not found'
      });
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
      message: 'Subscription created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// REQUEST VERIFICATION
router.post('/verification/request', async (req, res) => {
  try {
    const {
      user_id,
      verification_type,
      requested_plan,
      id_document_url,
      proof_documents,
      social_media_links,
      follower_count,
      reason
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO verification_requests
      (user_id, verification_type, requested_plan, id_document_url, 
       proof_documents, social_media_links, follower_count, reason, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *
    `, [
      user_id,
      verification_type,
      requested_plan,
      id_document_url,
      proof_documents,
      social_media_links,
      follower_count,
      reason
    ]);
    
    res.status(201).json({
      status: 'success',
      message: 'Verification request submitted',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET USER'S VERIFICATION STATUS
router.get('/verification/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM verification_requests
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.json({
        status: 'success',
        verified: false,
        message: 'No verification request found'
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

module.exports = router;