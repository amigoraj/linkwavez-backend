// routes/comments.js
// Comments API with Priority Scoring

const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Helper: Calculate comment priority score
async function calculatePriorityScore(userId, celebrityId) {
  let baseScore = 10; // Default score
  let fanTierBonus = 0;
  let premiumBonus = 0;

  // Check fan tier
  const { data: fanStatus } = await supabase
    .from('user_fan_status')
    .select(`
      badge_id,
      fan_badges (
        name,
        priority_multiplier
      )
    `)
    .eq('user_id', userId)
    .eq('celebrity_id', celebrityId)
    .single();

  if (fanStatus?.fan_badges) {
    fanTierBonus = (fanStatus.fan_badges.priority_multiplier || 1) * 20;
  }

  // Check premium status
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan_id, subscription_plans(priority_boost)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (subscription?.subscription_plans) {
    premiumBonus = subscription.subscription_plans.priority_boost || 0;
  }

  const finalScore = baseScore + fanTierBonus + premiumBonus;

  return {
    base_score: baseScore,
    fan_tier_bonus: fanTierBonus,
    premium_bonus: premiumBonus,
    final_score: finalScore
  };
}

// ==========================================
// CREATE COMMENT
// ==========================================
router.post('/create', async (req, res) => {
  try {
    const { user_id, clip_id, content, parent_comment_id } = req.body;

    if (!user_id || !clip_id || !content) {
      return res.status(400).json({
        success: false,
        message: 'user_id, clip_id, and content are required'
      });
    }

    // Get post info
    const { data: post, error: postError } = await supabase
      .from('wisdom_clips')
      .select('user_id')
      .eq('id', clip_id)
      .single();

    if (postError) throw postError;

    const celebrityId = post.user_id;

    // Calculate priority score
    const priorityScore = await calculatePriorityScore(user_id, celebrityId);

    // Insert comment
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .insert([{
        user_id: user_id,
        clip_id: clip_id,
        content: content,
        parent_comment_id: parent_comment_id || null
      }])
      .select()
      .single();

    if (commentError) throw commentError;

    // Store priority score
    await supabase
      .from('comment_priority_scores')
      .insert([{
        comment_id: comment.id,
        base_score: priorityScore.base_score,
        fan_tier_bonus: priorityScore.fan_tier_bonus,
        premium_bonus: priorityScore.premium_bonus,
        final_score: priorityScore.final_score
      }]);

    // Track fan interaction (if celebrity's post)
    if (celebrityId !== user_id) {
      await supabase.rpc('track_fan_interaction', {
        p_user_id: user_id,
        p_celebrity_id: celebrityId,
        p_interaction_type: 'comment',
        p_points: 3
      });
    }

    res.json({
      success: true,
      comment: comment,
      priority_score: priorityScore.final_score,
      message: 'Comment created successfully'
    });

  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create comment',
      error: error.message
    });
  }
});

// ==========================================
// GET COMMENTS FOR POST
// ==========================================
router.get('/post/:clipId', async (req, res) => {
  try {
    const { clipId } = req.params;
    const { sort = 'priority', limit = 50, offset = 0 } = req.query;

    // Get comments with user info and priority scores
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        *,
        users:user_id (
          id,
          username,
          avatar_url,
          aura_score,
          wisdom_score
        ),
        comment_priority_scores (
          base_score,
          fan_tier_bonus,
          premium_bonus,
          final_score
        )
      `)
      .eq('clip_id', clipId)
      .is('parent_comment_id', null); // Get top-level comments only

    if (commentsError) throw commentsError;

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(comments.map(async (comment) => {
      const { data: replies } = await supabase
        .from('comments')
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
        .eq('parent_comment_id', comment.id)
        .order('created_at', { ascending: true });

      return {
        ...comment,
        replies: replies || [],
        reply_count: replies?.length || 0,
        priority_score: comment.comment_priority_scores?.[0]?.final_score || 10
      };
    }));

    // Sort comments
    if (sort === 'priority') {
      commentsWithReplies.sort((a, b) => b.priority_score - a.priority_score);
    } else if (sort === 'recent') {
      commentsWithReplies.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
    } else if (sort === 'oldest') {
      commentsWithReplies.sort((a, b) => 
        new Date(a.created_at) - new Date(b.created_at)
      );
    }

    // Paginate
    const paginatedComments = commentsWithReplies.slice(offset, offset + limit);

    res.json({
      success: true,
      comments: paginatedComments,
      count: paginatedComments.length,
      total: commentsWithReplies.length,
      sort_by: sort
    });

  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get comments',
      error: error.message
    });
  }
});

// ==========================================
// GET FILTERED COMMENTS (Celebrity Dashboard)
// ==========================================
router.get('/post/:clipId/filtered', async (req, res) => {
  try {
    const { clipId } = req.params;
    const { filter = 'all' } = req.query;
    // filter options: 'all', 'die_hard', 'superfan', 'premium', 'high_aura'

    // Get post owner
    const { data: post } = await supabase
      .from('wisdom_clips')
      .select('user_id')
      .eq('id', clipId)
      .single();

    const celebrityId = post?.user_id;

    // Get all comments with full data
    const { data: comments, error: commentsError } = await supabase
      .from('comments')
      .select(`
        *,
        users:user_id (
          id,
          username,
          avatar_url,
          aura_score,
          wisdom_score
        ),
        comment_priority_scores (
          final_score
        )
      `)
      .eq('clip_id', clipId)
      .is('parent_comment_id', null);

    if (commentsError) throw commentsError;

    // Get fan status for each commenter
    const commentsWithFanStatus = await Promise.all(comments.map(async (comment) => {
      const { data: fanStatus } = await supabase
        .from('user_fan_status')
        .select(`
          badge_id,
          fan_badges (name)
        `)
        .eq('user_id', comment.user_id)
        .eq('celebrity_id', celebrityId)
        .single();

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan_id')
        .eq('user_id', comment.user_id)
        .eq('status', 'active')
        .single();

      return {
        ...comment,
        fan_badge: fanStatus?.fan_badges?.name || null,
        is_premium: !!subscription,
        priority_score: comment.comment_priority_scores?.[0]?.final_score || 10
      };
    }));

    // Filter comments
    let filteredComments = commentsWithFanStatus;

    if (filter === 'die_hard') {
      filteredComments = commentsWithFanStatus.filter(c => 
        c.fan_badge === 'Die-Hard Fan'
      );
    } else if (filter === 'superfan') {
      filteredComments = commentsWithFanStatus.filter(c => 
        c.fan_badge === 'Die-Hard Fan' || c.fan_badge === 'Super Fan'
      );
    } else if (filter === 'premium') {
      filteredComments = commentsWithFanStatus.filter(c => c.is_premium);
    } else if (filter === 'high_aura') {
      filteredComments = commentsWithFanStatus.filter(c => 
        c.users?.aura_score >= 800
      );
    }

    // Sort by priority
    filteredComments.sort((a, b) => b.priority_score - a.priority_score);

    res.json({
      success: true,
      comments: filteredComments,
      count: filteredComments.length,
      filter: filter
    });

  } catch (error) {
    console.error('Get filtered comments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get filtered comments',
      error: error.message
    });
  }
});

// ==========================================
// UPDATE COMMENT
// ==========================================
router.put('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { user_id, content } = req.body;

    // Verify ownership
    const { data: comment, error: checkError } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', commentId)
      .single();

    if (checkError) throw checkError;

    if (comment.user_id !== user_id) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own comments'
      });
    }

    // Update comment
    const { data: updated, error: updateError } = await supabase
      .from('comments')
      .update({
        content: content,
        updated_at: new Date().toISOString()
      })
      .eq('id', commentId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      success: true,
      comment: updated,
      message: 'Comment updated successfully'
    });

  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update comment',
      error: error.message
    });
  }
});

// ==========================================
// DELETE COMMENT
// ==========================================
router.delete('/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { user_id } = req.body;

    // Verify ownership
    const { data: comment, error: checkError } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', commentId)
      .single();

    if (checkError) throw checkError;

    if (comment.user_id !== user_id) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own comments'
      });
    }

    // Delete comment (cascade will delete replies)
    const { error: deleteError } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });

  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete comment',
      error: error.message
    });
  }
});

module.exports = router;