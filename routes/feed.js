// routes/feed.js
// Smart AI Feed Algorithm - Mood-based learning and personalization

const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Helper: Determine time-based content preference
function getTimeBasedPreference() {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 12) {
    return 'morning'; // Motivational, news, light content
  } else if (hour >= 12 && hour < 17) {
    return 'afternoon'; // Educational, productive content
  } else if (hour >= 17 && hour < 22) {
    return 'evening'; // Entertainment, social content
  } else {
    return 'night'; // Relaxing, reflective content
  }
}

// Helper: Calculate user's current mood based on recent activity
async function detectUserMood(userId) {
  // Get last 10 reactions
  const { data: recentReactions } = await supabase
    .from('reactions')
    .select('reaction_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!recentReactions || recentReactions.length === 0) {
    return 'neutral';
  }

  // Count reaction types
  const counts = {
    laugh: 0,
    support: 0,
    care: 0,
    thinking: 0,
    applaud: 0,
    fire: 0
  };

  recentReactions.forEach(r => {
    if (counts.hasOwnProperty(r.reaction_type)) {
      counts[r.reaction_type]++;
    }
  });

  // Determine mood
  if (counts.laugh + counts.fire > 6) return 'fun-seeking'; // Wants entertainment
  if (counts.thinking > 5) return 'learning'; // Wants education
  if (counts.care + counts.support > 5) return 'supportive'; // In caring mood
  if (counts.applaud + counts.fire > 5) return 'energized'; // Wants inspiration
  
  return 'balanced'; // Mixed interests
}

// Helper: Get user's passion interests
async function getUserPassions(userId) {
  const { data: passions } = await supabase
    .from('user_passions')
    .select('passion')
    .eq('user_id', userId)
    .eq('is_active', true);

  return passions?.map(p => p.passion) || [];
}

// Helper: Calculate content score for user
function calculateContentScore(post, userMood, timePreference, userPassions) {
  let score = 0;

  // Base engagement score
  const totalEngagement = (post.reactions?.total || 0) + (post.comment_count || 0);
  score += Math.min(totalEngagement / 10, 50); // Max 50 points from engagement

  // Recency bonus
  const hoursAgo = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 1) score += 30;
  else if (hoursAgo < 6) score += 20;
  else if (hoursAgo < 24) score += 10;

  // Mood matching
  if (userMood === 'fun-seeking') {
    if (post.content_type === 'entertainment') score += 40;
    if (post.reactions?.laugh > 10) score += 30;
  } else if (userMood === 'learning') {
    if (post.content_type === 'educational') score += 40;
    if (post.reactions?.thinking > 5) score += 30;
  } else if (userMood === 'supportive') {
    if (post.content_type === 'inspirational') score += 40;
    if (post.reactions?.care > 5) score += 30;
  }

  // Time-based preference
  if (timePreference === 'morning') {
    if (post.content_type === 'motivational' || post.content_type === 'news') score += 25;
  } else if (timePreference === 'afternoon') {
    if (post.content_type === 'educational') score += 25;
  } else if (timePreference === 'evening') {
    if (post.content_type === 'entertainment' || post.content_type === 'social') score += 25;
  }

  // Passion matching
  const postHashtags = post.hashtags || [];
  userPassions.forEach(passion => {
    if (postHashtags.some(tag => tag.includes(passion.toLowerCase()))) {
      score += 35;
    }
  });

  // Quality indicators
  if (post.users?.aura_score > 800) score += 15; // High-quality creator
  if (post.users?.wisdom_score > 800) score += 15; // Trusted source

  // Penalize crisis/misinfo
  if (post.is_crisis) score -= 20; // Show less frequently
  if (post.needs_fact_check) score -= 15;

  // Diversity bonus (prevent echo chamber)
  // This would be enhanced with user's historical data
  
  return Math.max(0, score);
}

// ==========================================
// GET PERSONALIZED FEED
// ==========================================
router.get('/personalized/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // 1. Detect user's current mood
    const userMood = await detectUserMood(userId);

    // 2. Get time-based preference
    const timePreference = getTimeBasedPreference();

    // 3. Get user's passions
    const userPassions = await getUserPassions(userId);

    // 4. Get user's following list
    const { data: following } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);

    const followingIds = following?.map(f => f.following_id) || [];

    // 5. Get posts (mix of following + discover)
    const { data: followingPosts } = await supabase
      .from('wisdom_clips')
      .select(`
        *,
        users:user_id (
          id,
          username,
          avatar_url,
          aura_score,
          wisdom_score
        )
      `)
      .in('user_id', followingIds.length > 0 ? followingIds : [userId]) // If no following, show own posts
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(50); // Get more to score and filter

    // 6. Get discovery posts (not following)
    const { data: discoveryPosts } = await supabase
      .from('wisdom_clips')
      .select(`
        *,
        users:user_id (
          id,
          username,
          avatar_url,
          aura_score,
          wisdom_score
        )
      `)
      .not('user_id', 'in', `(${[userId, ...followingIds].join(',')})`)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(30);

    // 7. Combine all posts
    const allPosts = [...(followingPosts || []), ...(discoveryPosts || [])];

    // 8. Get engagement data for each post
    const postsWithEngagement = await Promise.all(allPosts.map(async (post) => {
      // Get reactions
      const { data: reactions } = await supabase
        .from('reactions')
        .select('reaction_type')
        .eq('clip_id', post.id);

      // Get comments
      const { count: commentCount } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('clip_id', post.id);

      // Count reactions
      const reactionCounts = {
        laugh: 0,
        support: 0,
        care: 0,
        thinking: 0,
        applaud: 0,
        fire: 0,
        total: reactions?.length || 0
      };

      reactions?.forEach(r => {
        if (reactionCounts.hasOwnProperty(r.reaction_type)) {
          reactionCounts[r.reaction_type]++;
        }
      });

      return {
        ...post,
        reactions: reactionCounts,
        comment_count: commentCount || 0
      };
    }));

    // 9. Calculate scores for each post
    const scoredPosts = postsWithEngagement.map(post => ({
      ...post,
      feed_score: calculateContentScore(post, userMood, timePreference, userPassions)
    }));

    // 10. Sort by score
    scoredPosts.sort((a, b) => b.feed_score - a.feed_score);

    // 11. Paginate
    const paginatedPosts = scoredPosts.slice(offset, offset + limit);

    // 12. Get allowed reactions for each post
    const finalPosts = await Promise.all(paginatedPosts.map(async (post) => {
      const { data: reactionRules } = await supabase
        .from('post_reaction_rules')
        .select('*')
        .eq('post_id', post.id)
        .single();

      return {
        ...post,
        allowed_reactions: reactionRules?.allowed_reactions || ['laugh', 'support', 'care', 'thinking', 'applaud', 'fire'],
        blocked_reactions: reactionRules?.blocked_reactions || []
      };
    }));

    res.json({
      success: true,
      feed: finalPosts,
      personalization: {
        detected_mood: userMood,
        time_preference: timePreference,
        passions: userPassions,
        following_count: followingIds.length
      },
      count: finalPosts.length,
      total_analyzed: scoredPosts.length
    });

  } catch (error) {
    console.error('Get personalized feed error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get personalized feed',
      error: error.message
    });
  }
});

// ==========================================
// GET DISCOVERY FEED (For You)
// ==========================================
router.get('/discover/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    // Get user's passions
    const userPassions = await getUserPassions(userId);

    // Get trending posts with matching passions
    const { data: posts, error: postsError } = await supabase
      .from('wisdom_clips')
      .select(`
        *,
        users:user_id (
          id,
          username,
          avatar_url,
          aura_score,
          wisdom_score
        )
      `)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(100);

    if (postsError) throw postsError;

    // Filter by passions if available
    let filteredPosts = posts;
    if (userPassions.length > 0) {
      filteredPosts = posts.filter(post => {
        const postHashtags = post.hashtags || [];
        return userPassions.some(passion => 
          postHashtags.some(tag => tag.includes(passion.toLowerCase()))
        );
      });
    }

    // Get engagement data
    const postsWithEngagement = await Promise.all(filteredPosts.map(async (post) => {
      const { data: reactions } = await supabase
        .from('reactions')
        .select('reaction_type')
        .eq('clip_id', post.id);

      const { count: commentCount } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('clip_id', post.id);

      const reactionCounts = {
        laugh: 0,
        support: 0,
        care: 0,
        thinking: 0,
        applaud: 0,
        fire: 0,
        total: reactions?.length || 0
      };

      reactions?.forEach(r => {
        if (reactionCounts.hasOwnProperty(r.reaction_type)) {
          reactionCounts[r.reaction_type]++;
        }
      });

      return {
        ...post,
        reactions: reactionCounts,
        comment_count: commentCount || 0,
        engagement_score: reactionCounts.total + (commentCount || 0)
      };
    }));

    // Sort by engagement
    postsWithEngagement.sort((a, b) => b.engagement_score - a.engagement_score);

    // Take top posts
    const topPosts = postsWithEngagement.slice(0, limit);

    res.json({
      success: true,
      posts: topPosts,
      count: topPosts.length
    });

  } catch (error) {
    console.error('Get discovery feed error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get discovery feed',
      error: error.message
    });
  }
});

// ==========================================
// GET TRENDING FEED
// ==========================================
router.get('/trending', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get posts from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: posts, error: postsError } = await supabase
      .from('wisdom_clips')
      .select(`
        *,
        users:user_id (
          id,
          username,
          avatar_url,
          aura_score,
          wisdom_score
        )
      `)
      .eq('visibility', 'public')
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false });

    if (postsError) throw postsError;

    // Calculate engagement for each
    const postsWithEngagement = await Promise.all(posts.map(async (post) => {
      const { data: reactions } = await supabase
        .from('reactions')
        .select('reaction_type')
        .eq('clip_id', post.id);

      const { count: commentCount } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('clip_id', post.id);

      const reactionCounts = {
        laugh: 0,
        support: 0,
        care: 0,
        thinking: 0,
        applaud: 0,
        fire: 0,
        total: reactions?.length || 0
      };

      reactions?.forEach(r => {
        if (reactionCounts.hasOwnProperty(r.reaction_type)) {
          reactionCounts[r.reaction_type]++;
        }
      });

      // Calculate trending score (engagement / time)
      const hoursAgo = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
      const trendingScore = (reactionCounts.total + (commentCount || 0)) / Math.max(hoursAgo, 1);

      return {
        ...post,
        reactions: reactionCounts,
        comment_count: commentCount || 0,
        trending_score: trendingScore
      };
    }));

    // Sort by trending score
    postsWithEngagement.sort((a, b) => b.trending_score - a.trending_score);

    // Take top trending
    const trending = postsWithEngagement.slice(0, limit);

    res.json({
      success: true,
      posts: trending,
      count: trending.length,
      timeframe: '24 hours'
    });

  } catch (error) {
    console.error('Get trending feed error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trending feed',
      error: error.message
    });
  }
});

// ==========================================
// TRACK FEED INTERACTION (Learning)
// ==========================================
router.post('/track-interaction', async (req, res) => {
  try {
    const { user_id, post_id, interaction_type, duration_seconds } = req.body;

    // Store interaction for learning
    const { error } = await supabase
      .from('feed_interactions')
      .insert([{
        user_id: user_id,
        post_id: post_id,
        interaction_type: interaction_type, // 'view', 'long_view', 'skip', 'react', 'comment', 'share'
        duration_seconds: duration_seconds
      }]);

    if (error) throw error;

    // Update user's behavioral pattern
    // This data will be used to improve future feed personalization

    res.json({
      success: true,
      message: 'Interaction tracked'
    });

  } catch (error) {
    console.error('Track interaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track interaction',
      error: error.message
    });
  }
});

module.exports = router;