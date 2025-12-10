// routes/hashtags.js
// Hashtags API - Trending, Search, Follow

const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// ==========================================
// GET TRENDING HASHTAGS
// ==========================================
router.get('/trending', async (req, res) => {
  try {
    const { limit = 20, timeframe = '24h' } = req.query;

    // Calculate time threshold
    let hoursAgo = 24;
    if (timeframe === '7d') hoursAgo = 168;
    else if (timeframe === '30d') hoursAgo = 720;

    const thresholdDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

    // Get posts with hashtags from timeframe
    const { data: recentPosts, error: postsError } = await supabase
      .from('wisdom_clips')
      .select('hashtags')
      .gte('created_at', thresholdDate);

    if (postsError) throw postsError;

    // Count hashtag usage
    const hashtagCounts = {};
    recentPosts.forEach(post => {
      if (post.hashtags) {
        post.hashtags.forEach(tag => {
          hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
        });
      }
    });

    // Convert to array and sort
    const trending = Object.entries(hashtagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    res.json({
      success: true,
      trending: trending,
      timeframe: timeframe,
      count: trending.length
    });

  } catch (error) {
    console.error('Get trending hashtags error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trending hashtags',
      error: error.message
    });
  }
});

// ==========================================
// SEARCH BY HASHTAG
// ==========================================
router.get('/search/:tag', async (req, res) => {
  try {
    const { tag } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // Normalize tag (add # if missing, lowercase)
    const normalizedTag = tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;

    // Get posts with this hashtag
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
      .contains('hashtags', [normalizedTag])
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (postsError) throw postsError;

    // Get engagement data for each post
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

      return {
        ...post,
        reactions: reactionCounts,
        comment_count: commentCount || 0
      };
    }));

    res.json({
      success: true,
      hashtag: normalizedTag,
      posts: postsWithEngagement,
      count: postsWithEngagement.length
    });

  } catch (error) {
    console.error('Search hashtag error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search hashtag',
      error: error.message
    });
  }
});

// ==========================================
// GET HASHTAG STATS
// ==========================================
router.get('/stats/:tag', async (req, res) => {
  try {
    const { tag } = req.params;

    const normalizedTag = tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`;

    // Total posts with this tag
    const { count: totalPosts, error: countError } = await supabase
      .from('wisdom_clips')
      .select('*', { count: 'exact', head: true })
      .contains('hashtags', [normalizedTag]);

    if (countError) throw countError;

    // Posts in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentPosts, error: recentError } = await supabase
      .from('wisdom_clips')
      .select('*', { count: 'exact', head: true })
      .contains('hashtags', [normalizedTag])
      .gte('created_at', yesterday);

    if (recentError) throw recentError;

    // Get related hashtags (hashtags that often appear together)
    const { data: posts } = await supabase
      .from('wisdom_clips')
      .select('hashtags')
      .contains('hashtags', [normalizedTag])
      .limit(100);

    const relatedCounts = {};
    posts?.forEach(post => {
      post.hashtags?.forEach(t => {
        if (t !== normalizedTag) {
          relatedCounts[t] = (relatedCounts[t] || 0) + 1;
        }
      });
    });

    const relatedTags = Object.entries(relatedCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      success: true,
      hashtag: normalizedTag,
      stats: {
        total_posts: totalPosts || 0,
        posts_24h: recentPosts || 0,
        trending_score: recentPosts || 0
      },
      related_hashtags: relatedTags
    });

  } catch (error) {
    console.error('Get hashtag stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get hashtag stats',
      error: error.message
    });
  }
});

// ==========================================
// FOLLOW HASHTAG
// ==========================================
router.post('/follow', async (req, res) => {
  try {
    const { user_id, hashtag } = req.body;

    if (!user_id || !hashtag) {
      return res.status(400).json({
        success: false,
        message: 'user_id and hashtag are required'
      });
    }

    const normalizedTag = hashtag.startsWith('#') ? hashtag.toLowerCase() : `#${hashtag.toLowerCase()}`;

    // Check if already following
    const { data: existing } = await supabase
      .from('hashtag_follows')
      .select('id')
      .eq('user_id', user_id)
      .eq('hashtag', normalizedTag)
      .single();

    if (existing) {
      return res.json({
        success: true,
        already_following: true,
        message: 'Already following this hashtag'
      });
    }

    // Add follow
    const { error } = await supabase
      .from('hashtag_follows')
      .insert([{
        user_id: user_id,
        hashtag: normalizedTag
      }]);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Hashtag followed successfully',
      hashtag: normalizedTag
    });

  } catch (error) {
    console.error('Follow hashtag error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to follow hashtag',
      error: error.message
    });
  }
});

// ==========================================
// UNFOLLOW HASHTAG
// ==========================================
router.post('/unfollow', async (req, res) => {
  try {
    const { user_id, hashtag } = req.body;

    const normalizedTag = hashtag.startsWith('#') ? hashtag.toLowerCase() : `#${hashtag.toLowerCase()}`;

    const { error } = await supabase
      .from('hashtag_follows')
      .delete()
      .eq('user_id', user_id)
      .eq('hashtag', normalizedTag);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Hashtag unfollowed successfully'
    });

  } catch (error) {
    console.error('Unfollow hashtag error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unfollow hashtag',
      error: error.message
    });
  }
});

// ==========================================
// GET USER'S FOLLOWED HASHTAGS
// ==========================================
router.get('/user/:userId/following', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: follows, error } = await supabase
      .from('hashtag_follows')
      .select('hashtag, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get stats for each followed hashtag
    const hashtagsWithStats = await Promise.all(follows.map(async (follow) => {
      const { count: totalPosts } = await supabase
        .from('wisdom_clips')
        .select('*', { count: 'exact', head: true })
        .contains('hashtags', [follow.hashtag]);

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: recentPosts } = await supabase
        .from('wisdom_clips')
        .select('*', { count: 'exact', head: true })
        .contains('hashtags', [follow.hashtag])
        .gte('created_at', yesterday);

      return {
        hashtag: follow.hashtag,
        followed_since: follow.created_at,
        total_posts: totalPosts || 0,
        posts_24h: recentPosts || 0
      };
    }));

    res.json({
      success: true,
      hashtags: hashtagsWithStats,
      count: hashtagsWithStats.length
    });

  } catch (error) {
    console.error('Get followed hashtags error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get followed hashtags',
      error: error.message
    });
  }
});

module.exports = router;