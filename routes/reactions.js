// routes/reactions.js
// 6 Smart Reactions API - Context-aware emoji reactions

const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Reaction point values for Wisdom/Aura scores
const REACTION_POINTS = {
  // Wisdom reactions
  thinking: { wisdom: 25, aura: 5 },   // Critical thinking
  
  // Support reactions
  support: { wisdom: 5, aura: 20 },    // Emotional support
  care: { wisdom: 5, aura: 30 },       // Deep compassion
  applaud: { wisdom: 5, aura: 15 },    // Encouragement
  
  // Fun reactions
  laugh: { wisdom: 0, aura: 10 },      // Positive energy
  fire: { wisdom: 0, aura: 10 }        // Hype/enthusiasm
};

// ==========================================
// ADD REACTION
// ==========================================
router.post('/add', async (req, res) => {
  try {
    const { user_id, clip_id, reaction_type } = req.body;

    if (!user_id || !clip_id || !reaction_type) {
      return res.status(400).json({
        success: false,
        message: 'user_id, clip_id, and reaction_type are required'
      });
    }

    // Validate reaction type
    const validReactions = ['laugh', 'support', 'care', 'thinking', 'applaud', 'fire'];
    if (!validReactions.includes(reaction_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reaction type',
        valid_types: validReactions
      });
    }

    // Get post to check reaction rules
    const { data: post, error: postError } = await supabase
      .from('wisdom_clips')
      .select('id, content_type, is_crisis')
      .eq('id', clip_id)
      .single();

    if (postError) throw postError;

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if reaction is allowed
    const { data: reactionRules } = await supabase
      .from('post_reaction_rules')
      .select('allowed_reactions, blocked_reactions')
      .eq('post_id', clip_id)
      .single();

    if (reactionRules) {
      if (reactionRules.blocked_reactions && 
          reactionRules.blocked_reactions.includes(reaction_type)) {
        return res.status(403).json({
          success: false,
          message: 'This reaction is not allowed for this content type',
          allowed_reactions: reactionRules.allowed_reactions,
          reason: post.is_crisis ? 
            'Crisis content only allows supportive reactions (❤️ 🙏)' :
            post.content_type === 'misinformation' ?
            'Questionable content - please use 🤔 to think critically' :
            'This reaction is not appropriate for this content'
        });
      }
    }

    // Check if user already reacted
    const { data: existingReaction } = await supabase
      .from('reactions')
      .select('id, reaction_type')
      .eq('user_id', user_id)
      .eq('clip_id', clip_id)
      .single();

    if (existingReaction) {
      // If same reaction, remove it (unlike)
      if (existingReaction.reaction_type === reaction_type) {
        const { error: deleteError } = await supabase
          .from('reactions')
          .delete()
          .eq('id', existingReaction.id);

        if (deleteError) throw deleteError;

        return res.json({
          success: true,
          action: 'removed',
          message: 'Reaction removed'
        });
      } else {
        // Different reaction, update it
        const { error: updateError } = await supabase
          .from('reactions')
          .update({ reaction_type: reaction_type })
          .eq('id', existingReaction.id);

        if (updateError) throw updateError;

        // Update user's wisdom/aura scores
        await updateUserScores(user_id, reaction_type);

        return res.json({
          success: true,
          action: 'updated',
          message: 'Reaction updated',
          new_reaction: reaction_type
        });
      }
    }

    // Add new reaction
    const { data: newReaction, error: insertError } = await supabase
      .from('reactions')
      .insert([{
        user_id: user_id,
        clip_id: clip_id,
        reaction_type: reaction_type
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    // Update user's wisdom/aura scores
    const scores = await updateUserScores(user_id, reaction_type);

    // Track behavioral pattern
    await trackBehavioralPattern(user_id, reaction_type, post.content_type);

    res.json({
      success: true,
      action: 'added',
      reaction: newReaction,
      scores: scores,
      message: 'Reaction added successfully'
    });

  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add reaction',
      error: error.message
    });
  }
});

// Helper: Update user's Wisdom and Aura scores
async function updateUserScores(userId, reactionType) {
  const points = REACTION_POINTS[reactionType] || { wisdom: 0, aura: 0 };

  // Get current scores
  const { data: user } = await supabase
    .from('users')
    .select('wisdom_score, aura_score')
    .eq('id', userId)
    .single();

  const currentWisdom = user?.wisdom_score || 0;
  const currentAura = user?.aura_score || 0;

  // Update scores
  const { error } = await supabase
    .from('users')
    .update({
      wisdom_score: currentWisdom + points.wisdom,
      aura_score: currentAura + points.aura
    })
    .eq('id', userId);

  if (error) console.error('Score update error:', error);

  return {
    wisdom: currentWisdom + points.wisdom,
    aura: currentAura + points.aura,
    gained: {
      wisdom: points.wisdom,
      aura: points.aura
    }
  };
}

// Helper: Track behavioral patterns for AI learning
async function trackBehavioralPattern(userId, reactionType, contentType) {
  // Store in behavioral_patterns table for future feed personalization
  const { error } = await supabase
    .from('behavioral_patterns')
    .upsert({
      user_id: userId,
      [`${reactionType}_count`]: supabase.sql`${reactionType}_count + 1`,
      [`${contentType}_engagement`]: supabase.sql`${contentType}_engagement + 1`,
      last_updated: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) console.error('Pattern tracking error:', error);
}

// ==========================================
// GET REACTIONS FOR POST
// ==========================================
router.get('/post/:clipId', async (req, res) => {
  try {
    const { clipId } = req.params;

    const { data: reactions, error } = await supabase
      .from('reactions')
      .select('reaction_type')
      .eq('clip_id', clipId);

    if (error) throw error;

    // Count by type
    const counts = {
      laugh: 0,
      support: 0,
      care: 0,
      thinking: 0,
      applaud: 0,
      fire: 0,
      total: reactions.length
    };

    reactions.forEach(r => {
      if (counts.hasOwnProperty(r.reaction_type)) {
        counts[r.reaction_type]++;
      }
    });

    res.json({
      success: true,
      reactions: counts
    });

  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reactions',
      error: error.message
    });
  }
});

// ==========================================
// GET USER'S REACTION TO POST
// ==========================================
router.get('/user/:userId/post/:clipId', async (req, res) => {
  try {
    const { userId, clipId } = req.params;

    const { data: reaction, error } = await supabase
      .from('reactions')
      .select('reaction_type')
      .eq('user_id', userId)
      .eq('clip_id', clipId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

    res.json({
      success: true,
      has_reacted: !!reaction,
      reaction_type: reaction?.reaction_type || null
    });

  } catch (error) {
    console.error('Get user reaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user reaction',
      error: error.message
    });
  }
});

// ==========================================
// GET USER'S REACTION STATISTICS
// ==========================================
router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get all user's reactions
    const { data: reactions, error } = await supabase
      .from('reactions')
      .select('reaction_type')
      .eq('user_id', userId);

    if (error) throw error;

    // Count by type
    const counts = {
      laugh: 0,
      support: 0,
      care: 0,
      thinking: 0,
      applaud: 0,
      fire: 0,
      total: reactions.length
    };

    reactions.forEach(r => {
      if (counts.hasOwnProperty(r.reaction_type)) {
        counts[r.reaction_type]++;
      }
    });

    // Calculate percentages
    const percentages = {};
    Object.keys(counts).forEach(key => {
      if (key !== 'total') {
        percentages[key] = counts.total > 0 ? 
          ((counts[key] / counts.total) * 100).toFixed(1) : 0;
      }
    });

    // Determine personality type
    let personalityType = 'Balanced';
    if (percentages.laugh > 60) personalityType = 'Fun-Seeker';
    else if (percentages.thinking > 50) personalityType = 'Critical Thinker';
    else if (percentages.care + percentages.support > 60) personalityType = 'Supportive';
    else if (percentages.fire + percentages.applaud > 60) personalityType = 'Energetic';

    res.json({
      success: true,
      counts: counts,
      percentages: percentages,
      personality_type: personalityType,
      total_reactions: counts.total
    });

  } catch (error) {
    console.error('Get reaction stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reaction statistics',
      error: error.message
    });
  }
});

module.exports = router;