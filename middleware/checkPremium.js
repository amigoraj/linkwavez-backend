const { pool } = require('../config/database');

// Middleware to check if user has premium access
const checkPremium = (requiredFeature) => {
  return async (req, res, next) => {
    try {
      const userId = req.params.userId || req.body.user_id;
      
      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'User ID required'
        });
      }
      
      // Check subscription
      const result = await pool.query(`
        SELECT sp.features
        FROM subscriptions s
        JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE s.user_id = $1
        AND s.status = 'active'
        AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
      `, [userId]);
      
      if (result.rows.length === 0) {
        return res.status(403).json({
          status: 'error',
          message: 'Premium subscription required',
          required_feature: requiredFeature,
          upgrade_url: '/api/subscriptions/plans'
        });
      }
      
      const features = result.rows[0].features;
      
      if (features[requiredFeature] !== true) {
        return res.status(403).json({
          status: 'error',
          message: `This feature requires ${requiredFeature}`,
          required_feature: requiredFeature,
          upgrade_url: '/api/subscriptions/plans'
        });
      }
      
      next();
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  };
};

module.exports = { checkPremium };