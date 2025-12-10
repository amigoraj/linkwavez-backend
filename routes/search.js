const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// UNIVERSAL SEARCH (Search everything)
// ============================================================================
router.get('/all', async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const searchTerm = query.trim().toLowerCase();

    // Search users
    const { data: users } = await supabase
      .from('users')
      .select('id, username, full_name, profile_picture_url, bio')
      .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
      .limit(parseInt(limit));

    // Search posts
    const { data: posts } = await supabase
      .from('wisdom_clips')
      .select('id, caption, created_at, user_id')
      .ilike('caption', `%${searchTerm}%`)
      .limit(parseInt(limit));

    // Search hashtags
    const { data: hashtags } = await supabase
      .from('hashtags')
      .select('id, tag, post_count')
      .ilike('tag', `%${searchTerm}%`)
      .order('post_count', { ascending: false })
      .limit(parseInt(limit));

    // Search charity campaigns
    const { data: campaigns } = await supabase
      .from('charity_campaigns')
      .select('id, title, description, goal_amount, raised_amount, status')
      .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .eq('status', 'active')
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        users: users || [],
        posts: posts || [],
        hashtags: hashtags || [],
        campaigns: campaigns || [],
        query: query
      }
    });

  } catch (error) {
    console.error('❌ Universal search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SEARCH USERS
// ============================================================================
router.get('/users', async (req, res) => {
  try {
    const { query, limit = 20, offset = 0 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const searchTerm = query.trim().toLowerCase();

    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        username,
        full_name,
        profile_picture_url,
        bio,
        verified
      `)
      .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%,bio.ilike.%${searchTerm}%`)
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    // Get follower counts for each user
    const usersWithStats = await Promise.all(
      data.map(async (user) => {
        const { count: followerCount } = await supabase
          .from('followers')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', user.id);

        return {
          ...user,
          followerCount: followerCount || 0
        };
      })
    );

    res.json({
      success: true,
      data: usersWithStats,
      query: query
    });

  } catch (error) {
    console.error('❌ Search users error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SEARCH POSTS
// ============================================================================
router.get('/posts', async (req, res) => {
  try {
    const { query, limit = 20, offset = 0 } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const searchTerm = query.trim().toLowerCase();

    const { data, error } = await supabase
      .from('wisdom_clips')
      .select(`
        id,
        caption,
        media_url,
        media_type,
        created_at,
        user_id
      `)
      .ilike('caption', `%${searchTerm}%`)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      success: true,
      data: data,
      query: query
    });

  } catch (error) {
    console.error('❌ Search posts error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SEARCH HASHTAGS
// ============================================================================
router.get('/hashtags', async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query || query.trim().length < 1) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const searchTerm = query.trim().toLowerCase().replace('#', '');

    const { data, error } = await supabase
      .from('hashtags')
      .select('*')
      .ilike('tag', `%${searchTerm}%`)
      .order('post_count', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      data: data,
      query: query
    });

  } catch (error) {
    console.error('❌ Search hashtags error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SEARCH CHARITY CAMPAIGNS
// ============================================================================
router.get('/campaigns', async (req, res) => {
  try {
    const { query, limit = 20, category } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const searchTerm = query.trim().toLowerCase();

    let dbQuery = supabase
      .from('charity_campaigns')
      .select('*')
      .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }

    const { data, error } = await dbQuery;

    if (error) throw error;

    // Calculate progress percentage
    const campaignsWithProgress = data.map(campaign => ({
      ...campaign,
      progress_percentage: ((campaign.raised_amount / campaign.goal_amount) * 100).toFixed(2)
    }));

    res.json({
      success: true,
      data: campaignsWithProgress,
      query: query
    });

  } catch (error) {
    console.error('❌ Search campaigns error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// TRENDING HASHTAGS
// ============================================================================
router.get('/trending/hashtags', async (req, res) => {
  try {
    const { limit = 20, timeframe = '7d' } = req.query;

    // Calculate date based on timeframe
    const now = new Date();
    let startDate = new Date();
    
    switch(timeframe) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    const { data, error } = await supabase
      .from('hashtags')
      .select('*')
      .gte('updated_at', startDate.toISOString())
      .order('post_count', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      data: data,
      timeframe: timeframe
    });

  } catch (error) {
    console.error('❌ Trending hashtags error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// TRENDING POSTS
// ============================================================================
router.get('/trending/posts', async (req, res) => {
  try {
    const { limit = 20, timeframe = '7d' } = req.query;

    // Calculate date based on timeframe
    const now = new Date();
    let startDate = new Date();
    
    switch(timeframe) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get posts with engagement metrics
    const { data, error } = await supabase
      .from('wisdom_clips')
      .select(`
        id,
        caption,
        media_url,
        media_type,
        created_at,
        user_id,
        like_count,
        comment_count,
        share_count
      `)
      .gte('created_at', startDate.toISOString())
      .order('like_count', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    // Calculate engagement score (likes + comments*2 + shares*3)
    const postsWithScore = data.map(post => ({
      ...post,
      engagement_score: (post.like_count || 0) + (post.comment_count || 0) * 2 + (post.share_count || 0) * 3
    })).sort((a, b) => b.engagement_score - a.engagement_score);

    res.json({
      success: true,
      data: postsWithScore,
      timeframe: timeframe
    });

  } catch (error) {
    console.error('❌ Trending posts error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// TRENDING USERS (Most followed recently)
// ============================================================================
router.get('/trending/users', async (req, res) => {
  try {
    const { limit = 20, timeframe = '7d' } = req.query;

    // Calculate date based on timeframe
    const now = new Date();
    let startDate = new Date();
    
    switch(timeframe) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get users who gained most followers in timeframe
    const { data: recentFollows } = await supabase
      .from('followers')
      .select('following_id')
      .gte('created_at', startDate.toISOString());

    // Count followers per user
    const followerCounts = {};
    recentFollows?.forEach(follow => {
      followerCounts[follow.following_id] = (followerCounts[follow.following_id] || 0) + 1;
    });

    // Get top user IDs
    const topUserIds = Object.entries(followerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, parseInt(limit))
      .map(entry => entry[0]);

    // Get user details
    const { data: users } = await supabase
      .from('users')
      .select('id, username, full_name, profile_picture_url, bio, verified')
      .in('id', topUserIds);

    // Combine with follower counts
    const usersWithCounts = users?.map(user => ({
      ...user,
      new_followers: followerCounts[user.id] || 0
    })).sort((a, b) => b.new_followers - a.new_followers);

    res.json({
      success: true,
      data: usersWithCounts || [],
      timeframe: timeframe
    });

  } catch (error) {
    console.error('❌ Trending users error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SUGGESTED USERS (Recommendations based on interests)
// ============================================================================
router.get('/suggestions/users', async (req, res) => {
  try {
    const { userId, limit = 20 } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Get users the current user is NOT following
    const { data: following } = await supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', userId);

    const followingIds = following?.map(f => f.following_id) || [];
    followingIds.push(userId); // Exclude self

    // Get popular users not being followed
    const { data: suggestions } = await supabase
      .from('users')
      .select('id, username, full_name, profile_picture_url, bio, verified')
      .not('id', 'in', `(${followingIds.join(',')})`)
      .limit(parseInt(limit));

    // Get follower counts
    const suggestionsWithStats = await Promise.all(
      (suggestions || []).map(async (user) => {
        const { count: followerCount } = await supabase
          .from('followers')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', user.id);

        return {
          ...user,
          followerCount: followerCount || 0
        };
      })
    );

    // Sort by follower count
    const sortedSuggestions = suggestionsWithStats.sort((a, b) => b.followerCount - a.followerCount);

    res.json({
      success: true,
      data: sortedSuggestions
    });

  } catch (error) {
    console.error('❌ Suggested users error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// EXPLORE PAGE (Curated content for discovery)
// ============================================================================
router.get('/explore', async (req, res) => {
  try {
    const { userId, limit = 10 } = req.query;

    // Get trending hashtags
    const { data: trendingHashtags } = await supabase
      .from('hashtags')
      .select('*')
      .order('post_count', { ascending: false })
      .limit(5);

    // Get trending posts (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: trendingPosts } = await supabase
      .from('wisdom_clips')
      .select('*')
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('like_count', { ascending: false })
      .limit(parseInt(limit));

    // Get active charity campaigns
    const { data: charityCampaigns } = await supabase
      .from('charity_campaigns')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5);

    // Get suggested users (if userId provided)
    let suggestedUsers = [];
    if (userId) {
      const { data: following } = await supabase
        .from('followers')
        .select('following_id')
        .eq('follower_id', userId);

      const followingIds = following?.map(f => f.following_id) || [];
      followingIds.push(userId);

      const { data: suggestions } = await supabase
        .from('users')
        .select('id, username, full_name, profile_picture_url, verified')
        .not('id', 'in', `(${followingIds.join(',')})`)
        .limit(5);

      suggestedUsers = suggestions || [];
    }

    res.json({
      success: true,
      data: {
        trendingHashtags: trendingHashtags || [],
        trendingPosts: trendingPosts || [],
        charityCampaigns: charityCampaigns || [],
        suggestedUsers: suggestedUsers
      }
    });

  } catch (error) {
    console.error('❌ Explore page error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SEARCH HISTORY (Track user searches)
// ============================================================================
router.post('/history', async (req, res) => {
  try {
    const { userId, query, type } = req.body;

    if (!userId || !query) {
      return res.status(400).json({
        success: false,
        error: 'User ID and query are required'
      });
    }

    const { data, error } = await supabase
      .from('search_history')
      .insert({
        user_id: userId,
        query: query,
        type: type || 'general'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Save search history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET SEARCH HISTORY
// ============================================================================
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    const { data, error } = await supabase
      .from('search_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get search history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CLEAR SEARCH HISTORY
// ============================================================================
router.delete('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { error } = await supabase
      .from('search_history')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Search history cleared'
    });

  } catch (error) {
    console.error('❌ Clear search history error:', error);
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
    message: 'Search & Discovery service is running',
    features: [
      'Universal search',
      'Search users/posts/hashtags/campaigns',
      'Trending content',
      'User suggestions',
      'Explore page',
      'Search history'
    ]
  });
});

module.exports = router;