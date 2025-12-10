// routes/posts.js
// Posts API - Complete with Analytics, Silent Repost, Share, Views

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Extract hashtags from content
function extractHashtags(content) {
  const hashtagRegex = /#[\w]+/g;
  const hashtags = content.match(hashtagRegex) || [];
  return hashtags.map(tag => tag.toLowerCase());
}

// Detect crisis content
function detectCrisis(content) {
  const crisisKeywords = [
    'suicide', 'kill myself', 'end it all', 'want to die', 'no reason to live',
    'goodbye everyone', 'nobody cares', 'burden to everyone', 'better off dead',
    'can\'t take it anymore', 'end my life', 'final goodbye'
  ];
  
  const contentLower = content.toLowerCase();
  const detectedKeywords = crisisKeywords.filter(keyword => 
    contentLower.includes(keyword)
  );
  
  if (detectedKeywords.length > 0) {
    const riskScore = Math.min(100, detectedKeywords.length * 25 + 50);
    
    return {
      isCrisis: true,
      riskScore: riskScore,
      detectedKeywords: detectedKeywords,
      alertLevel: riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : 'medium'
    };
  }
  
  return { isCrisis: false };
}

// Detect misinformation
function detectMisinformation(content) {
  const misinfoPatterns = [
    'share before they delete',
    'doctors don\'t want you to know',
    'they\'re hiding this',
    'mainstream media won\'t tell you',
    'wake up sheeple',
    'do your own research',
    'plandemic',
    'hoax'
  ];
  
  const contentLower = content.toLowerCase();
  const hasMisinfoPattern = misinfoPatterns.some(pattern => 
    contentLower.includes(pattern)
  );
  
  return {
    isPotentialMisinfo: hasMisinfoPattern,
    needsFactCheck: hasMisinfoPattern
  };
}

// Calculate engagement rate
function calculateEngagement(views, reactions, comments, shares) {
  if (views === 0) return 0;
  const totalEngagement = reactions + (comments * 2) + (shares * 3);
  return Math.round((totalEngagement / views) * 100);
}

// ============================================================================
// CREATE POST
// ============================================================================
router.post('/create', async (req, res) => {
  try {
    const { userId, caption, mediaUrl, mediaType, visibility } = req.body;

    if (!userId || !caption) {
      return res.status(400).json({
        success: false,
        error: 'User ID and caption are required'
      });
    }

    const hashtags = extractHashtags(caption);
    const crisisDetection = detectCrisis(caption);
    const misinfoDetection = detectMisinformation(caption);

    let contentType = 'normal';
    if (crisisDetection.isCrisis) {
      contentType = 'crisis';
    } else if (misinfoDetection.isPotentialMisinfo) {
      contentType = 'misinformation';
    }

    const { data: post, error } = await supabase
      .from('wisdom_clips')
      .insert({
        user_id: userId,
        caption: caption,
        media_url: mediaUrl,
        media_type: mediaType || 'text',
        hashtags: hashtags,
        visibility: visibility || 'public',
        post_type: 'normal',
        content_type: contentType,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        view_count: 0
      })
      .select()
      .single();

    if (error) throw error;

    // If crisis detected, create alert
    if (crisisDetection.isCrisis) {
      await supabase
        .from('crisis_alerts')
        .insert({
          user_id: userId,
          post_id: post.id,
          content: caption,
          detected_keyword: crisisDetection.detectedKeywords[0],
          severity: crisisDetection.alertLevel,
          crisis_type: 'self_harm',
          status: 'pending'
        });
    }

    console.log(`✅ Post created: ${post.id}`);

    res.json({
      success: true,
      data: post,
      crisisDetected: crisisDetection.isCrisis,
      message: crisisDetection.isCrisis ? 
        'Post created. Crisis support is available.' : 
        'Post created successfully!'
    });

  } catch (error) {
    console.error('❌ Create post error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SILENT REPOST (Express feelings without tagging)
// ============================================================================
router.post('/silent-repost/create', async (req, res) => {
  try {
    const {
      userId,
      caption,
      mediaUrl,
      mediaType,
      emotion,
      isAnonymous
    } = req.body;

    if (!userId || !caption) {
      return res.status(400).json({
        success: false,
        error: 'User ID and caption are required'
      });
    }

    const hashtags = ['#SilentRepost', `#${emotion || 'Feeling'}`];

    const { data: post, error } = await supabase
      .from('wisdom_clips')
      .insert({
        user_id: isAnonymous ? null : userId,
        caption: caption,
        media_url: mediaUrl,
        media_type: mediaType || 'text',
        post_type: 'silent_repost',
        emotion_tag: emotion,
        is_anonymous: isAnonymous || false,
        hashtags: hashtags,
        like_count: 0,
        comment_count: 0,
        share_count: 0,
        view_count: 0
      })
      .select()
      .single();

    if (error) throw error;

    // Award aura points for healthy expression
    if (!isAnonymous) {
      await supabase.rpc('increment_aura', {
        p_user_id: userId,
        p_amount: 5
      });
    }

    console.log(`💭 Silent repost created: ${emotion}`);

    res.json({
      success: true,
      data: post,
      message: 'Your feelings have been shared 💙',
      supportMessage: 'You are not alone. Your feelings are valid.'
    });

  } catch (error) {
    console.error('❌ Silent repost error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET SILENT REPOSTS
// ============================================================================
router.get('/silent-reposts', async (req, res) => {
  try {
    const { emotion, limit = 20, offset = 0 } = req.query;

    let query = supabase
      .from('wisdom_clips')
      .select('*')
      .eq('post_type', 'silent_repost')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (emotion) {
      query = query.eq('emotion_tag', emotion);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data,
      message: 'Send them love! 💙'
    });

  } catch (error) {
    console.error('❌ Get silent reposts error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET POST BY ID (with analytics)
// ============================================================================
router.get('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.query; // To check if user is premium

    const { data: post, error } = await supabase
      .from('wisdom_clips')
      .select('*')
      .eq('id', postId)
      .single();

    if (error || !post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Increment view count
    await supabase
      .from('wisdom_clips')
      .update({ view_count: (post.view_count || 0) + 1 })
      .eq('id', postId);

    // Get reaction count
    const { count: reactionCount } = await supabase
      .from('reactions')
      .select('*', { count: 'exact', head: true })
      .eq('clip_id', postId);

    // Calculate engagement
    const engagement = calculateEngagement(
      post.view_count + 1,
      reactionCount || 0,
      post.comment_count || 0,
      post.share_count || 0
    );

    // Get user's aura score
    const { data: userScore } = await supabase
      .from('user_scores')
      .select('aura_score')
      .eq('user_id', post.user_id)
      .single();

    // Check if viewer is premium
    let showFullAnalytics = false;
    if (userId) {
      const { data: subscription } = await supabase
        .from('fan_subscriptions')
        .select('plan')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      showFullAnalytics = subscription && ['premium', 'creator_pro', 'business'].includes(subscription.plan);
    }

    // Basic analytics (for everyone)
    const basicAnalytics = {
      views: post.view_count + 1,
      reactions: reactionCount || 0,
      comments: post.comment_count || 0,
      shares: post.share_count || 0,
      engagementRate: engagement,
      auraScore: userScore?.aura_score || 0
    };

    // Premium analytics (for premium users only)
    let premiumAnalytics = null;
    if (showFullAnalytics) {
      // Get detailed reaction breakdown
      const { data: reactions } = await supabase
        .from('reactions')
        .select('reaction_type')
        .eq('clip_id', postId);

      const reactionBreakdown = {
        '😂': 0, '❤️': 0, '🙏': 0, '🤔': 0, '👏': 0, '🔥': 0
      };
      reactions?.forEach(r => {
        if (reactionBreakdown[r.reaction_type] !== undefined) {
          reactionBreakdown[r.reaction_type]++;
        }
      });

      // Get viewer demographics (if post owner)
      let viewerDemographics = null;
      if (userId === post.user_id) {
        // In real app, track viewer demographics
        viewerDemographics = {
          topLocations: ['Johor', 'KL', 'Penang'],
          ageGroups: { '18-24': 45, '25-34': 35, '35+': 20 },
          genderSplit: { male: 52, female: 45, other: 3 }
        };
      }

      premiumAnalytics = {
        reactionBreakdown: reactionBreakdown,
        peakViewingTime: '8:00 PM - 10:00 PM',
        avgWatchTime: '45 seconds',
        viewerDemographics: viewerDemographics,
        viralScore: engagement >= 50 ? 'High' : engagement >= 25 ? 'Medium' : 'Low'
      };
    }

    res.json({
      success: true,
      data: {
        ...post,
        analytics: basicAnalytics,
        premiumAnalytics: premiumAnalytics,
        isPremiumUser: showFullAnalytics
      }
    });

  } catch (error) {
    console.error('❌ Get post error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// UPDATE POST
// ============================================================================
router.put('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, caption, mediaUrl } = req.body;

    const { data: existing } = await supabase
      .from('wisdom_clips')
      .select('user_id')
      .eq('id', postId)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    if (existing.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const updateData = {
      updated_at: new Date().toISOString()
    };
    if (caption) {
      updateData.caption = caption;
      updateData.hashtags = extractHashtags(caption);
    }
    if (mediaUrl) updateData.media_url = mediaUrl;

    const { data, error } = await supabase
      .from('wisdom_clips')
      .update(updateData)
      .eq('id', postId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: data,
      message: 'Post updated successfully'
    });

  } catch (error) {
    console.error('❌ Update post error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DELETE POST
// ============================================================================
router.delete('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;

    const { data: existing } = await supabase
      .from('wisdom_clips')
      .select('user_id')
      .eq('id', postId)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    if (existing.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { error } = await supabase
      .from('wisdom_clips')
      .delete()
      .eq('id', postId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete post error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET USER'S POSTS
// ============================================================================
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('wisdom_clips')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    // Get analytics for each post
    const postsWithAnalytics = await Promise.all(
      data.map(async (post) => {
        const { count: reactions } = await supabase
          .from('reactions')
          .select('*', { count: 'exact', head: true })
          .eq('clip_id', post.id);

        const engagement = calculateEngagement(
          post.view_count || 0,
          reactions || 0,
          post.comment_count || 0,
          post.share_count || 0
        );

        return {
          ...post,
          analytics: {
            views: post.view_count || 0,
            reactions: reactions || 0,
            comments: post.comment_count || 0,
            shares: post.share_count || 0,
            engagementRate: engagement
          }
        };
      })
    );

    res.json({
      success: true,
      data: postsWithAnalytics
    });

  } catch (error) {
    console.error('❌ Get user posts error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SHARE POST
// ============================================================================
router.post('/:postId/share', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, shareType } = req.body; // shareType: 'repost', 'external', 'dm'

    // Increment share count
    const { data: post } = await supabase
      .from('wisdom_clips')
      .select('share_count, user_id')
      .eq('id', postId)
      .single();

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    await supabase
      .from('wisdom_clips')
      .update({ share_count: (post.share_count || 0) + 1 })
      .eq('id', postId);

    // Award aura to original poster
    await supabase.rpc('increment_aura', {
      p_user_id: post.user_id,
      p_amount: 2
    });

    console.log(`🔄 Post shared: ${postId}`);

    res.json({
      success: true,
      message: 'Post shared successfully'
    });

  } catch (error) {
    console.error('❌ Share post error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET POST ANALYTICS (Premium feature)
// ============================================================================
router.get('/:postId/analytics', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.query;

    const { data: post } = await supabase
      .from('wisdom_clips')
      .select('*')
      .eq('id', postId)
      .single();

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Check if user is post owner
    if (post.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only post owner can view detailed analytics'
      });
    }

    // Check if user is premium
    const { data: subscription } = await supabase
      .from('fan_subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    const isPremium = subscription && ['premium', 'creator_pro', 'business'].includes(subscription.plan);

    if (!isPremium) {
      return res.status(403).json({
        success: false,
        error: 'Premium subscription required for detailed analytics',
        upgradeUrl: '/subscriptions'
      });
    }

    // Get detailed analytics
    const { data: reactions } = await supabase
      .from('reactions')
      .select('reaction_type, created_at')
      .eq('clip_id', postId);

    const reactionBreakdown = {
      '😂': 0, '❤️': 0, '🙏': 0, '🤔': 0, '👏': 0, '🔥': 0
    };
    reactions?.forEach(r => {
      if (reactionBreakdown[r.reaction_type] !== undefined) {
        reactionBreakdown[r.reaction_type]++;
      }
    });

    const engagement = calculateEngagement(
      post.view_count || 0,
      reactions?.length || 0,
      post.comment_count || 0,
      post.share_count || 0
    );

    res.json({
      success: true,
      data: {
        postId: post.id,
        views: post.view_count || 0,
        reactions: reactions?.length || 0,
        reactionBreakdown: reactionBreakdown,
        comments: post.comment_count || 0,
        shares: post.share_count || 0,
        engagementRate: engagement,
        viralScore: engagement >= 50 ? 'High 🔥' : engagement >= 25 ? 'Medium ✨' : 'Growing 🌱',
        peakTime: '8:00 PM - 10:00 PM',
        reach: Math.round((post.view_count || 0) * 1.5)
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
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Posts service is running',
    features: [
      'Create, read, update, delete posts',
      'Silent repost (anti-bullying)',
      'Crisis detection',
      'Misinformation detection',
      'Analytics (basic & premium)',
      'Share tracking',
      'View tracking',
      'Engagement calculation'
    ]
  });
});

module.exports = router;