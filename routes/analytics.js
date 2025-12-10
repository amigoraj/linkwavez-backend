const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// USER ANALYTICS (Personal dashboard)
// ============================================================================
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch(timeframe) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'all':
        startDate = new Date('2020-01-01');
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get user info
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    // Total posts
    const { count: totalPosts } = await supabase
      .from('wisdom_clips')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Posts in timeframe
    const { count: recentPosts } = await supabase
      .from('wisdom_clips')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    // Get all user's posts for engagement metrics
    const { data: posts } = await supabase
      .from('wisdom_clips')
      .select('like_count, comment_count, share_count, created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    const totalLikes = posts?.reduce((sum, p) => sum + (p.like_count || 0), 0) || 0;
    const totalComments = posts?.reduce((sum, p) => sum + (p.comment_count || 0), 0) || 0;
    const totalShares = posts?.reduce((sum, p) => sum + (p.share_count || 0), 0) || 0;
    const avgEngagement = recentPosts > 0 ? ((totalLikes + totalComments + totalShares) / recentPosts).toFixed(2) : 0;

    // Follower growth
    const { count: totalFollowers } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    const { count: newFollowers } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId)
      .gte('created_at', startDate.toISOString());

    // Following count
    const { count: followingCount } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId);

    // Wisdom & Aura scores
    const { data: scores } = await supabase
      .from('user_scores')
      .select('wisdom_score, aura_score')
      .eq('user_id', userId)
      .single();

    // Donations made
    const { data: donations } = await supabase
      .from('donations')
      .select('amount')
      .eq('user_id', userId);

    const totalDonated = donations?.reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;

    // Daily post activity (for chart)
    const { data: dailyPosts } = await supabase
      .from('wisdom_clips')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at');

    const dailyActivity = {};
    dailyPosts?.forEach(post => {
      const date = new Date(post.created_at).toISOString().split('T')[0];
      dailyActivity[date] = (dailyActivity[date] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          verified: user.verified || false
        },
        overview: {
          totalPosts: totalPosts || 0,
          recentPosts: recentPosts || 0,
          totalFollowers: totalFollowers || 0,
          newFollowers: newFollowers || 0,
          following: followingCount || 0,
          wisdomScore: scores?.wisdom_score || 0,
          auraScore: scores?.aura_score || 0,
          totalDonated: totalDonated
        },
        engagement: {
          totalLikes: totalLikes,
          totalComments: totalComments,
          totalShares: totalShares,
          avgEngagementPerPost: avgEngagement
        },
        dailyActivity: dailyActivity,
        timeframe: timeframe
      }
    });

  } catch (error) {
    console.error('❌ User analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// POST ANALYTICS (Individual post performance)
// ============================================================================
router.get('/post/:postId', async (req, res) => {
  try {
    const { postId } = req.params;

    // Get post details
    const { data: post, error: postError } = await supabase
      .from('wisdom_clips')
      .select('*')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    // Get reactions breakdown
    const { data: reactions } = await supabase
      .from('reactions')
      .select('reaction_type')
      .eq('clip_id', postId);

    const reactionBreakdown = {
      '😂': 0,
      '❤️': 0,
      '🙏': 0,
      '🤔': 0,
      '👏': 0,
      '🔥': 0
    };

    reactions?.forEach(r => {
      if (reactionBreakdown[r.reaction_type] !== undefined) {
        reactionBreakdown[r.reaction_type]++;
      }
    });

    // Get comments count
    const { count: commentsCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('clip_id', postId);

    // Calculate engagement rate (based on reactions + comments)
    const totalEngagement = (post.like_count || 0) + (commentsCount || 0);
    
    // Get user's follower count for engagement rate calculation
    const { count: followerCount } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', post.user_id);

    const engagementRate = followerCount > 0 
      ? ((totalEngagement / followerCount) * 100).toFixed(2)
      : 0;

    // Get hourly engagement (if we track views with timestamps)
    // For now, just return the data we have

    res.json({
      success: true,
      data: {
        post: {
          id: post.id,
          caption: post.caption,
          created_at: post.created_at,
          user_id: post.user_id
        },
        metrics: {
          likes: post.like_count || 0,
          comments: commentsCount || 0,
          shares: post.share_count || 0,
          views: post.view_count || 0,
          engagementRate: engagementRate + '%'
        },
        reactionBreakdown: reactionBreakdown,
        performance: {
          avgEngagement: totalEngagement,
          peakEngagementTime: 'N/A', // TODO: Track timestamps
          viralScore: calculateViralScore(post)
        }
      }
    });

  } catch (error) {
    console.error('❌ Post analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to calculate viral score
function calculateViralScore(post) {
  const likes = post.like_count || 0;
  const comments = post.comment_count || 0;
  const shares = post.share_count || 0;
  
  // Viral score: weighted sum (shares worth more than likes)
  const score = (likes * 1) + (comments * 2) + (shares * 5);
  
  if (score > 1000) return 'Viral 🔥';
  if (score > 500) return 'Trending ⬆️';
  if (score > 100) return 'Popular ✨';
  if (score > 50) return 'Good 👍';
  return 'Growing 🌱';
}

// ============================================================================
// CELEBRITY DASHBOARD ANALYTICS
// ============================================================================
router.get('/celebrity/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch(timeframe) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get fan tier distribution
    const { data: fans } = await supabase
      .from('celebrity_fans')
      .select('tier, points')
      .eq('celebrity_id', userId);

    const tierDistribution = {
      'die_hard': fans?.filter(f => f.tier === 'die_hard').length || 0,
      'super_fan': fans?.filter(f => f.tier === 'super_fan').length || 0,
      'loyal': fans?.filter(f => f.tier === 'loyal').length || 0,
      'active': fans?.filter(f => f.tier === 'active').length || 0,
      'new': fans?.filter(f => f.tier === 'new').length || 0
    };

    // Revenue from subscriptions (if applicable)
    const { data: subscriptions } = await supabase
      .from('fan_subscriptions')
      .select('amount, created_at')
      .eq('celebrity_id', userId)
      .gte('created_at', startDate.toISOString());

    const totalRevenue = subscriptions?.reduce((sum, s) => sum + parseFloat(s.amount), 0) || 0;

    // Top fans (highest points)
    const topFans = fans
      ?.sort((a, b) => b.points - a.points)
      .slice(0, 10) || [];

    // Get engagement metrics
    const { data: posts } = await supabase
      .from('wisdom_clips')
      .select('like_count, comment_count, share_count')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString());

    const totalEngagement = posts?.reduce((sum, p) => 
      sum + (p.like_count || 0) + (p.comment_count || 0) + (p.share_count || 0), 0
    ) || 0;

    res.json({
      success: true,
      data: {
        fanMetrics: {
          totalFans: fans?.length || 0,
          tierDistribution: tierDistribution,
          newFansThisPeriod: fans?.filter(f => {
            const createdAt = new Date(f.created_at);
            return createdAt >= startDate;
          }).length || 0
        },
        revenue: {
          total: totalRevenue,
          subscriptionCount: subscriptions?.length || 0
        },
        engagement: {
          total: totalEngagement,
          avgPerPost: posts?.length > 0 ? (totalEngagement / posts.length).toFixed(2) : 0
        },
        topFans: topFans,
        timeframe: timeframe
      }
    });

  } catch (error) {
    console.error('❌ Celebrity analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// PLATFORM-WIDE STATISTICS (Admin only)
// ============================================================================
router.get('/platform/stats', async (req, res) => {
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Total posts
    const { count: totalPosts } = await supabase
      .from('wisdom_clips')
      .select('*', { count: 'exact', head: true });

    // Total charity campaigns
    const { count: totalCampaigns } = await supabase
      .from('charity_campaigns')
      .select('*', { count: 'exact', head: true });

    // Total donations
    const { data: donations } = await supabase
      .from('donations')
      .select('amount');

    const totalDonated = donations?.reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;

    // Active users (posted in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: activePosts } = await supabase
      .from('wisdom_clips')
      .select('user_id')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const activeUsers = new Set(activePosts?.map(p => p.user_id)).size;

    // Total reactions
    const { count: totalReactions } = await supabase
      .from('reactions')
      .select('*', { count: 'exact', head: true });

    // Total comments
    const { count: totalComments } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true });

    // Crisis alerts
    const { count: crisisAlerts } = await supabase
      .from('crisis_alerts')
      .select('*', { count: 'exact', head: true });

    const { count: resolvedCrisis } = await supabase
      .from('crisis_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'resolved');

    // Growth metrics (new users last 30 days)
    const { count: newUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString());

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers || 0,
          active: activeUsers || 0,
          new30d: newUsers || 0
        },
        content: {
          totalPosts: totalPosts || 0,
          totalReactions: totalReactions || 0,
          totalComments: totalComments || 0
        },
        charity: {
          campaigns: totalCampaigns || 0,
          totalDonated: totalDonated,
          donations: donations?.length || 0
        },
        safety: {
          crisisAlerts: crisisAlerts || 0,
          resolved: resolvedCrisis || 0,
          resolutionRate: crisisAlerts > 0 
            ? ((resolvedCrisis / crisisAlerts) * 100).toFixed(1) + '%'
            : '0%'
        },
        engagement: {
          avgReactionsPerPost: totalPosts > 0 ? (totalReactions / totalPosts).toFixed(2) : 0,
          avgCommentsPerPost: totalPosts > 0 ? (totalComments / totalPosts).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Platform stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SCORE TRACKING (Wisdom & Aura over time)
// ============================================================================
router.get('/scores/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get current scores
    const { data: currentScores } = await supabase
      .from('user_scores')
      .select('wisdom_score, aura_score')
      .eq('user_id', userId)
      .single();

    // TODO: Implement score history tracking
    // For now, return current scores
    // In the future, create a score_history table to track changes over time

    res.json({
      success: true,
      data: {
        current: currentScores || { wisdom_score: 0, aura_score: 0 },
        history: [], // TODO: Implement score history
        message: 'Score history tracking coming soon!'
      }
    });

  } catch (error) {
    console.error('❌ Score history error:', error);
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
    message: 'Analytics service is running',
    features: [
      'User analytics',
      'Post analytics',
      'Celebrity dashboard',
      'Platform statistics',
      'Score tracking'
    ]
  });
});

module.exports = router;