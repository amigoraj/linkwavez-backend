const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// START LIVE STREAM
// ============================================================================
router.post('/start', async (req, res) => {
  try {
    const { streamerId, title, description, category, thumbnailUrl } = req.body;

    if (!streamerId || !title) {
      return res.status(400).json({
        success: false,
        error: 'Streamer ID and title are required'
      });
    }

    // Check if user already has an active stream
    const { data: existing } = await supabase
      .from('live_streams')
      .select('*')
      .eq('streamer_id', streamerId)
      .eq('status', 'live')
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active stream'
      });
    }

    // Generate Agora stream key (in production, use actual Agora API)
    const streamKey = `stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const agoraChannelName = `channel_${streamerId}_${Date.now()}`;

    // Create stream
    const { data: stream, error } = await supabase
      .from('live_streams')
      .insert({
        streamer_id: streamerId,
        title: title,
        description: description,
        category: category || 'general',
        thumbnail_url: thumbnailUrl,
        stream_key: streamKey,
        agora_channel_name: agoraChannelName,
        status: 'live',
        viewer_count: 0,
        total_views: 0,
        total_gifts_received: 0
      })
      .select()
      .single();

    if (error) throw error;

    // Notify followers that streamer went live
    // Get follower IDs
    const { data: followers } = await supabase
      .from('followers')
      .select('follower_id')
      .eq('following_id', streamerId);

    if (followers && followers.length > 0) {
      // Create notifications for followers
      const notifications = followers.map(f => ({
        user_id: f.follower_id,
        type: 'live_stream',
        title: '🔴 Live Now!',
        message: `${title}`,
        data: { stream_id: stream.id, streamer_id: streamerId },
        action_url: `/live/${stream.id}`,
        read: false
      }));

      await supabase
        .from('notifications')
        .insert(notifications);
    }

    console.log(`🔴 Stream started: ${title} by ${streamerId}`);

    res.json({
      success: true,
      message: 'Stream started successfully',
      data: {
        stream: stream,
        agoraChannelName: agoraChannelName,
        streamKey: streamKey
      }
    });

  } catch (error) {
    console.error('❌ Start stream error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// END LIVE STREAM
// ============================================================================
router.put('/end/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { streamerId } = req.body;

    // Get stream
    const { data: stream } = await supabase
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (!stream) {
      return res.status(404).json({
        success: false,
        error: 'Stream not found'
      });
    }

    if (stream.streamer_id !== streamerId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to end this stream'
      });
    }

    // Calculate duration
    const startTime = new Date(stream.started_at);
    const endTime = new Date();
    const durationMinutes = Math.floor((endTime - startTime) / 1000 / 60);

    // Update stream
    const { data: updatedStream, error } = await supabase
      .from('live_streams')
      .update({
        status: 'ended',
        ended_at: endTime.toISOString(),
        duration_minutes: durationMinutes
      })
      .eq('id', streamId)
      .select()
      .single();

    if (error) throw error;

    console.log(`⏹️ Stream ended: ${streamId} - Duration: ${durationMinutes} mins`);

    res.json({
      success: true,
      message: 'Stream ended successfully',
      data: {
        stream: updatedStream,
        durationMinutes: durationMinutes,
        totalViews: updatedStream.total_views,
        totalGifts: updatedStream.total_gifts_received
      }
    });

  } catch (error) {
    console.error('❌ End stream error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET ACTIVE STREAMS
// ============================================================================
router.get('/active', async (req, res) => {
  try {
    const { category, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('live_streams')
      .select('*')
      .eq('status', 'live')
      .order('viewer_count', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get active streams error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET STREAM DETAILS
// ============================================================================
router.get('/:streamId', async (req, res) => {
  try {
    const { streamId } = req.params;

    const { data: stream, error } = await supabase
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (error || !stream) {
      return res.status(404).json({
        success: false,
        error: 'Stream not found'
      });
    }

    // Get current viewers
    const { data: viewers } = await supabase
      .from('stream_viewers')
      .select('user_id')
      .eq('stream_id', streamId)
      .eq('is_active', true);

    res.json({
      success: true,
      data: {
        ...stream,
        currentViewers: viewers?.length || 0
      }
    });

  } catch (error) {
    console.error('❌ Get stream error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// JOIN STREAM (Viewer)
// ============================================================================
router.post('/:streamId/join', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Check if stream exists and is live
    const { data: stream } = await supabase
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .eq('status', 'live')
      .single();

    if (!stream) {
      return res.status(404).json({
        success: false,
        error: 'Stream not found or not live'
      });
    }

    // Add viewer
    const { data: viewer, error } = await supabase
      .from('stream_viewers')
      .insert({
        stream_id: streamId,
        user_id: userId,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    // Increment total views
    await supabase
      .from('live_streams')
      .update({
        total_views: stream.total_views + 1
      })
      .eq('id', streamId);

    // Update viewer count
    await updateViewerCount(streamId);

    console.log(`👁️ User ${userId} joined stream ${streamId}`);

    res.json({
      success: true,
      message: 'Joined stream successfully',
      data: {
        viewer: viewer,
        agoraChannelName: stream.agora_channel_name
      }
    });

  } catch (error) {
    console.error('❌ Join stream error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// LEAVE STREAM
// ============================================================================
router.post('/:streamId/leave', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Calculate watch time
    const { data: viewer } = await supabase
      .from('stream_viewers')
      .select('*')
      .eq('stream_id', streamId)
      .eq('user_id', userId)
      .single();

    if (viewer) {
      const joinTime = new Date(viewer.joined_at);
      const leaveTime = new Date();
      const watchTimeMinutes = Math.floor((leaveTime - joinTime) / 1000 / 60);

      await supabase
        .from('stream_viewers')
        .update({
          is_active: false,
          left_at: leaveTime.toISOString(),
          watch_time_minutes: watchTimeMinutes
        })
        .eq('id', viewer.id);
    }

    // Update viewer count
    await updateViewerCount(streamId);

    console.log(`👋 User ${userId} left stream ${streamId}`);

    res.json({
      success: true,
      message: 'Left stream successfully'
    });

  } catch (error) {
    console.error('❌ Leave stream error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SEND GIFT TO STREAMER
// ============================================================================
router.post('/:streamId/gift', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { senderId, giftType, amount, message } = req.body;

    if (!senderId || !giftType || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Sender ID, gift type, and amount are required'
      });
    }

    // Get stream
    const { data: stream } = await supabase
      .from('live_streams')
      .select('streamer_id, total_gifts_received')
      .eq('id', streamId)
      .single();

    if (!stream) {
      return res.status(404).json({
        success: false,
        error: 'Stream not found'
      });
    }

    // Record gift
    const { data: gift, error } = await supabase
      .from('stream_gifts')
      .insert({
        stream_id: streamId,
        sender_id: senderId,
        receiver_id: stream.streamer_id,
        gift_type: giftType,
        amount: amount,
        message: message
      })
      .select()
      .single();

    if (error) throw error;

    // Update total gifts received
    await supabase
      .from('live_streams')
      .update({
        total_gifts_received: stream.total_gifts_received + parseFloat(amount)
      })
      .eq('id', streamId);

    console.log(`🎁 Gift sent: ${giftType} (RM ${amount}) to stream ${streamId}`);

    res.json({
      success: true,
      message: 'Gift sent successfully',
      data: gift
    });

  } catch (error) {
    console.error('❌ Send gift error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// POST COMMENT ON STREAM
// ============================================================================
router.post('/:streamId/comment', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { userId, comment } = req.body;

    if (!userId || !comment) {
      return res.status(400).json({
        success: false,
        error: 'User ID and comment are required'
      });
    }

    const { data, error } = await supabase
      .from('stream_comments')
      .insert({
        stream_id: streamId,
        user_id: userId,
        comment: comment
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`💬 Comment on stream ${streamId}: ${comment.substring(0, 30)}...`);

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Post comment error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET STREAM COMMENTS
// ============================================================================
router.get('/:streamId/comments', async (req, res) => {
  try {
    const { streamId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('stream_comments')
      .select('*')
      .eq('stream_id', streamId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get comments error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET STREAMER'S STREAM HISTORY
// ============================================================================
router.get('/streamer/:streamerId/history', async (req, res) => {
  try {
    const { streamerId } = req.params;
    const { limit = 20 } = req.query;

    const { data, error } = await supabase
      .from('live_streams')
      .select('*')
      .eq('streamer_id', streamerId)
      .order('started_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get stream history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET STREAM ANALYTICS
// ============================================================================
router.get('/:streamId/analytics', async (req, res) => {
  try {
    const { streamId } = req.params;

    // Get stream details
    const { data: stream } = await supabase
      .from('live_streams')
      .select('*')
      .eq('id', streamId)
      .single();

    if (!stream) {
      return res.status(404).json({
        success: false,
        error: 'Stream not found'
      });
    }

    // Get total viewers
    const { count: totalViewers } = await supabase
      .from('stream_viewers')
      .select('*', { count: 'exact', head: true })
      .eq('stream_id', streamId);

    // Get total gifts
    const { data: gifts } = await supabase
      .from('stream_gifts')
      .select('amount')
      .eq('stream_id', streamId);

    const totalGiftAmount = gifts?.reduce((sum, g) => sum + parseFloat(g.amount), 0) || 0;

    // Get total comments
    const { count: totalComments } = await supabase
      .from('stream_comments')
      .select('*', { count: 'exact', head: true })
      .eq('stream_id', streamId);

    // Calculate average watch time
    const { data: viewers } = await supabase
      .from('stream_viewers')
      .select('watch_time_minutes')
      .eq('stream_id', streamId)
      .not('watch_time_minutes', 'is', null);

    const avgWatchTime = viewers?.length > 0
      ? (viewers.reduce((sum, v) => sum + v.watch_time_minutes, 0) / viewers.length).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        streamId: stream.id,
        title: stream.title,
        status: stream.status,
        startedAt: stream.started_at,
        endedAt: stream.ended_at,
        durationMinutes: stream.duration_minutes,
        peakViewers: stream.viewer_count,
        totalViews: totalViewers || 0,
        totalGifts: totalGiftAmount,
        totalComments: totalComments || 0,
        avgWatchTimeMinutes: avgWatchTime
      }
    });

  } catch (error) {
    console.error('❌ Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Update viewer count for a stream
async function updateViewerCount(streamId) {
  const { count: activeViewers } = await supabase
    .from('stream_viewers')
    .select('*', { count: 'exact', head: true })
    .eq('stream_id', streamId)
    .eq('is_active', true);

  await supabase
    .from('live_streams')
    .update({ viewer_count: activeViewers || 0 })
    .eq('id', streamId);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Live streaming service is running',
    features: [
      'Start/stop live streams',
      'Real-time viewer tracking',
      'Send virtual gifts',
      'Stream comments',
      'Stream analytics',
      'Stream history',
      'Agora.io integration ready'
    ]
  });
});

module.exports = router;