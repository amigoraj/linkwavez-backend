const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// CREATE NOTIFICATION
// ============================================================================
router.post('/create', async (req, res) => {
  try {
    const { 
      userId, 
      type, 
      title, 
      message, 
      data, 
      actionUrl,
      sendPush = true,
      sendEmail = false 
    } = req.body;

    if (!userId || !type || !title) {
      return res.status(400).json({
        success: false,
        error: 'User ID, type, and title are required'
      });
    }

    // Create in-app notification
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: type,
        title: title,
        message: message,
        data: data || {},
        action_url: actionUrl,
        read: false
      })
      .select()
      .single();

    if (error) throw error;

    // Send push notification if enabled
    if (sendPush) {
      // TODO: Integrate with Firebase Cloud Messaging (FCM)
      // await sendPushNotification(userId, title, message);
    }

    // Send email notification if enabled
    if (sendEmail) {
      // TODO: Integrate with email service (SendGrid/AWS SES)
      // await sendEmailNotification(userId, title, message);
    }

    console.log(`✅ Notification created for user ${userId}: ${title}`);

    res.json({
      success: true,
      message: 'Notification created successfully',
      data: notification
    });

  } catch (error) {
    console.error('❌ Create notification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET USER NOTIFICATIONS
// ============================================================================
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0, unreadOnly = false } = req.query;

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (unreadOnly === 'true') {
      query = query.eq('read', false);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    res.json({
      success: true,
      data: {
        notifications: data,
        unreadCount: unreadCount || 0,
        total: data.length
      }
    });

  } catch (error) {
    console.error('❌ Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// MARK NOTIFICATION AS READ
// ============================================================================
router.put('/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: data
    });

  } catch (error) {
    console.error('❌ Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// MARK ALL AS READ
// ============================================================================
router.put('/user/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: `${data.length} notifications marked as read`,
      data: { count: data.length }
    });

  } catch (error) {
    console.error('❌ Mark all as read error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DELETE NOTIFICATION
// ============================================================================
router.delete('/:notificationId', async (req, res) => {
  try {
    const { notificationId } = req.params;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Notification deleted'
    });

  } catch (error) {
    console.error('❌ Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DELETE ALL NOTIFICATIONS
// ============================================================================
router.delete('/user/:userId/all', async (req, res) => {
  try {
    const { userId } = req.params;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'All notifications deleted'
    });

  } catch (error) {
    console.error('❌ Delete all notifications error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET NOTIFICATION PREFERENCES
// ============================================================================
router.get('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    // If no preferences found, return defaults
    if (!data) {
      return res.json({
        success: true,
        data: {
          user_id: userId,
          push_enabled: true,
          email_enabled: true,
          likes: true,
          comments: true,
          follows: true,
          mentions: true,
          donations: true,
          charity_updates: true,
          crisis_alerts: true,
          messages: true,
          fan_tier_updates: true,
          premium_updates: true
        }
      });
    }

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// UPDATE NOTIFICATION PREFERENCES
// ============================================================================
router.put('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const preferences = req.body;

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Notification preferences updated for user ${userId}`);

    res.json({
      success: true,
      message: 'Notification preferences updated',
      data: data
    });

  } catch (error) {
    console.error('❌ Update preferences error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// BATCH CREATE NOTIFICATIONS (For system events)
// ============================================================================
router.post('/batch', async (req, res) => {
  try {
    const { notifications } = req.body;

    if (!Array.isArray(notifications) || notifications.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Notifications array is required'
      });
    }

    // Add default values
    const notificationsWithDefaults = notifications.map(notif => ({
      ...notif,
      read: false,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('notifications')
      .insert(notificationsWithDefaults)
      .select();

    if (error) throw error;

    console.log(`✅ ${data.length} notifications created in batch`);

    res.json({
      success: true,
      message: `${data.length} notifications created`,
      data: { count: data.length }
    });

  } catch (error) {
    console.error('❌ Batch create error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET NOTIFICATION STATISTICS
// ============================================================================
router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Total notifications
    const { count: total } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Unread notifications
    const { count: unread } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    // By type
    const { data: byType } = await supabase
      .from('notifications')
      .select('type')
      .eq('user_id', userId);

    const typeStats = {};
    byType?.forEach(n => {
      typeStats[n.type] = (typeStats[n.type] || 0) + 1;
    });

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: recent } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString());

    res.json({
      success: true,
      data: {
        total: total || 0,
        unread: unread || 0,
        read: (total || 0) - (unread || 0),
        byType: typeStats,
        last7Days: recent || 0
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
// HELPER FUNCTIONS FOR DIFFERENT NOTIFICATION TYPES
// ============================================================================

// Notify on new like
const notifyLike = async (postOwnerId, likerId, postId) => {
  await supabase
    .from('notifications')
    .insert({
      user_id: postOwnerId,
      type: 'like',
      title: 'New Like',
      message: 'Someone liked your post',
      data: { liker_id: likerId, post_id: postId },
      action_url: `/posts/${postId}`,
      read: false
    });
};

// Notify on new comment
const notifyComment = async (postOwnerId, commenterId, postId, commentText) => {
  await supabase
    .from('notifications')
    .insert({
      user_id: postOwnerId,
      type: 'comment',
      title: 'New Comment',
      message: commentText.substring(0, 100),
      data: { commenter_id: commenterId, post_id: postId },
      action_url: `/posts/${postId}`,
      read: false
    });
};

// Notify on new follower
const notifyFollow = async (userId, followerId) => {
  await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'follow',
      title: 'New Follower',
      message: 'Someone started following you',
      data: { follower_id: followerId },
      action_url: `/profile/${followerId}`,
      read: false
    });
};

// Notify on donation
const notifyDonation = async (campaignOwnerId, donorId, amount, campaignId) => {
  await supabase
    .from('notifications')
    .insert({
      user_id: campaignOwnerId,
      type: 'donation',
      title: '💝 New Donation',
      message: `Someone donated RM ${amount} to your campaign!`,
      data: { donor_id: donorId, amount: amount, campaign_id: campaignId },
      action_url: `/charity/campaigns/${campaignId}`,
      read: false
    });
};

// Notify on fan tier upgrade
const notifyFanTierUpgrade = async (userId, newTier, celebrityId) => {
  await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'fan_tier',
      title: '🎉 Fan Tier Upgrade!',
      message: `You've reached ${newTier} status!`,
      data: { tier: newTier, celebrity_id: celebrityId },
      action_url: `/profile/${userId}`,
      read: false
    });
};

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Notifications service is running',
    features: [
      'In-app notifications',
      'Push notifications (ready for FCM)',
      'Email notifications (ready for SendGrid)',
      'Notification preferences',
      'Batch notifications',
      'Statistics'
    ]
  });
});

// Export router and helper functions
module.exports = { 
  router,
  notifyLike,
  notifyComment,
  notifyFollow,
  notifyDonation,
  notifyFanTierUpgrade
};