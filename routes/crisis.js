const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// DETECT CRISIS IN CONTENT (Called automatically when creating posts)
// ============================================================================
const detectCrisis = (content) => {
  const crisisKeywords = [
    // Self-harm indicators
    'suicide', 'kill myself', 'end my life', 'want to die', 'no reason to live',
    'self harm', 'cut myself', 'hurt myself',
    
    // Violence indicators
    'kill someone', 'murder', 'shoot up', 'bomb', 'terrorist attack',
    
    // Severe depression indicators
    'everyone hates me', 'world better without me', 'goodbye world',
    'final message', 'last post',
    
    // Immediate danger
    'going to jump', 'pills ready', 'gun loaded', 'bridge ready'
  ];

  const lowerContent = content.toLowerCase();
  
  for (const keyword of crisisKeywords) {
    if (lowerContent.includes(keyword)) {
      return {
        isCrisis: true,
        severity: getSeverity(keyword),
        keyword: keyword,
        type: getCrisisType(keyword)
      };
    }
  }

  return { isCrisis: false };
};

const getSeverity = (keyword) => {
  const high = ['suicide', 'kill myself', 'gun loaded', 'pills ready', 'going to jump'];
  const medium = ['want to die', 'no reason to live', 'hurt myself'];
  
  if (high.some(k => keyword.includes(k))) return 'high';
  if (medium.some(k => keyword.includes(k))) return 'medium';
  return 'low';
};

const getCrisisType = (keyword) => {
  if (keyword.includes('suicide') || keyword.includes('kill myself')) return 'self_harm';
  if (keyword.includes('kill someone') || keyword.includes('murder')) return 'violence';
  if (keyword.includes('hate me') || keyword.includes('better without')) return 'depression';
  return 'general';
};

// ============================================================================
// CREATE CRISIS ALERT
// ============================================================================
router.post('/alert/create', async (req, res) => {
  try {
    const { userId, postId, content, detectedKeyword, severity, crisisType } = req.body;

    if (!userId || !content) {
      return res.status(400).json({
        success: false,
        error: 'User ID and content are required'
      });
    }

    // Create crisis alert
    const { data: alert, error: alertError } = await supabase
      .from('crisis_alerts')
      .insert({
        user_id: userId,
        post_id: postId,
        content: content,
        detected_keyword: detectedKeyword,
        severity: severity,
        crisis_type: crisisType,
        status: 'pending'
      })
      .select()
      .single();

    if (alertError) throw alertError;

    // Get Good Aura helpers (aura score >= 800)
    const { data: helpers, error: helpersError } = await supabase
      .from('user_scores')
      .select('user_id, aura_score')
      .gte('aura_score', 800)
      .limit(10);

    if (!helpersError && helpers && helpers.length > 0) {
      // Create notifications for Good Aura helpers
      const notifications = helpers.map(helper => ({
        user_id: helper.user_id,
        type: 'crisis_alert',
        title: '🚨 Crisis Alert - Help Needed',
        message: `A user may be in crisis. Your positive energy is needed!`,
        data: { alert_id: alert.id, severity: severity },
        read: false
      }));

      await supabase
        .from('notifications')
        .insert(notifications);
    }

    // If severity is high, also notify emergency contacts (future feature)
    if (severity === 'high') {
      // TODO: Send to professional crisis helplines
      // TODO: Notify emergency services if user consents
    }

    console.log(`🚨 Crisis alert created for user ${userId} - Severity: ${severity}`);

    res.json({
      success: true,
      message: 'Crisis alert created and helpers notified',
      data: {
        alert: alert,
        helpersNotified: helpers?.length || 0
      }
    });

  } catch (error) {
    console.error('❌ Create crisis alert error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET PENDING CRISIS ALERTS (For Good Aura Helpers)
// ============================================================================
router.get('/alerts/pending', async (req, res) => {
  try {
    const { helperId } = req.query;

    // Verify helper has good aura (>= 800)
    if (helperId) {
      const { data: helperScore } = await supabase
        .from('user_scores')
        .select('aura_score')
        .eq('user_id', helperId)
        .single();

      if (!helperScore || helperScore.aura_score < 800) {
        return res.status(403).json({
          success: false,
          error: 'Only Good Aura helpers (800+ aura) can view crisis alerts'
        });
      }
    }

    // Get pending alerts
    const { data, error } = await supabase
      .from('crisis_alerts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get pending alerts error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// RESPOND TO CRISIS ALERT
// ============================================================================
router.post('/alert/:alertId/respond', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { helperId, message, action } = req.body;

    if (!helperId || !action) {
      return res.status(400).json({
        success: false,
        error: 'Helper ID and action are required'
      });
    }

    // Verify helper has good aura
    const { data: helperScore } = await supabase
      .from('user_scores')
      .select('aura_score')
      .eq('user_id', helperId)
      .single();

    if (!helperScore || helperScore.aura_score < 800) {
      return res.status(403).json({
        success: false,
        error: 'Only Good Aura helpers can respond'
      });
    }

    // Create response
    const { data: response, error: responseError } = await supabase
      .from('crisis_responses')
      .insert({
        alert_id: alertId,
        helper_id: helperId,
        message: message,
        action: action
      })
      .select()
      .single();

    if (responseError) throw responseError;

    // Update alert status if action is 'resolved'
    if (action === 'resolved') {
      await supabase
        .from('crisis_alerts')
        .update({ 
          status: 'resolved',
          resolved_by: helperId,
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId);
    }

    // Award helper with aura points for helping
    await supabase.rpc('increment_aura', {
      p_user_id: helperId,
      p_amount: 10
    });

    console.log(`✅ Helper ${helperId} responded to crisis alert ${alertId}`);

    res.json({
      success: true,
      message: 'Response recorded and user notified',
      data: response
    });

  } catch (error) {
    console.error('❌ Respond to alert error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET CRISIS STATISTICS (Admin)
// ============================================================================
router.get('/stats', async (req, res) => {
  try {
    // Total alerts
    const { count: totalAlerts } = await supabase
      .from('crisis_alerts')
      .select('*', { count: 'exact', head: true });

    // Pending alerts
    const { count: pendingAlerts } = await supabase
      .from('crisis_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Resolved alerts
    const { count: resolvedAlerts } = await supabase
      .from('crisis_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved');

    // By severity
    const { data: bySeverity } = await supabase
      .from('crisis_alerts')
      .select('severity')
      .order('severity');

    const severityStats = {
      high: bySeverity?.filter(a => a.severity === 'high').length || 0,
      medium: bySeverity?.filter(a => a.severity === 'medium').length || 0,
      low: bySeverity?.filter(a => a.severity === 'low').length || 0
    };

    // Active helpers
    const { count: activeHelpers } = await supabase
      .from('user_scores')
      .select('*', { count: 'exact', head: true })
      .gte('aura_score', 800);

    res.json({
      success: true,
      data: {
        totalAlerts: totalAlerts || 0,
        pendingAlerts: pendingAlerts || 0,
        resolvedAlerts: resolvedAlerts || 0,
        severityStats: severityStats,
        activeHelpers: activeHelpers || 0,
        responseRate: totalAlerts > 0 ? ((resolvedAlerts / totalAlerts) * 100).toFixed(1) : 0
      }
    });

  } catch (error) {
    console.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Crisis detection service is running',
    features: [
      'Auto-detect harmful content',
      'Alert Good Aura helpers (800+)',
      'Track responses',
      'Crisis statistics'
    ]
  });
});

// Export both router and detectCrisis function
module.exports = { router, detectCrisis };