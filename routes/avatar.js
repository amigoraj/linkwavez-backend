const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// CREATE/UPDATE USER AVATAR
// ============================================================================
router.post('/create', async (req, res) => {
  try {
    const {
      userId,
      personality,
      interests,
      communicationStyle,
      values,
      bio,
      conversationTopics,
      enabled
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Check if avatar already exists
    const { data: existing } = await supabase
      .from('user_avatars')
      .select('*')
      .eq('user_id', userId)
      .single();

    let result;

    if (existing) {
      // Update existing avatar
      const { data, error } = await supabase
        .from('user_avatars')
        .update({
          personality: personality || existing.personality,
          interests: interests || existing.interests,
          communication_style: communicationStyle || existing.communication_style,
          values: values || existing.values,
          bio: bio || existing.bio,
          conversation_topics: conversationTopics || existing.conversation_topics,
          enabled: enabled !== undefined ? enabled : existing.enabled,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log(`✅ Avatar updated for user: ${userId}`);
    } else {
      // Create new avatar
      const { data, error } = await supabase
        .from('user_avatars')
        .insert({
          user_id: userId,
          personality: personality || {
            openness: 50,
            conscientiousness: 50,
            extraversion: 50,
            agreeableness: 50,
            emotional_stability: 50
          },
          interests: interests || [],
          communication_style: communicationStyle || 'balanced',
          values: values || [],
          bio: bio || '',
          conversation_topics: conversationTopics || [],
          enabled: enabled !== undefined ? enabled : true
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log(`✅ Avatar created for user: ${userId}`);
    }

    res.json({
      success: true,
      message: existing ? 'Avatar updated successfully' : 'Avatar created successfully',
      data: result
    });

  } catch (error) {
    console.error('❌ Create avatar error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET USER AVATAR
// ============================================================================
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('user_avatars')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) {
      return res.json({
        success: true,
        data: null,
        message: 'No avatar found for this user'
      });
    }

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get avatar error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// START AVATAR CHAT SESSION
// ============================================================================
router.post('/chat/start', async (req, res) => {
  try {
    const { requesterId, targetUserId } = req.body;

    if (!requesterId || !targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'Requester ID and target user ID are required'
      });
    }

    // Check if target user has avatar enabled
    const { data: avatar, error: avatarError } = await supabase
      .from('user_avatars')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    if (avatarError || !avatar || !avatar.enabled) {
      return res.status(404).json({
        success: false,
        error: 'This user does not have an AI avatar enabled'
      });
    }

    // Check if chat session already exists
    const { data: existingSession } = await supabase
      .from('avatar_chat_sessions')
      .select('*')
      .eq('requester_id', requesterId)
      .eq('target_user_id', targetUserId)
      .eq('status', 'active')
      .single();

    if (existingSession) {
      return res.json({
        success: true,
        message: 'Chat session already exists',
        data: existingSession
      });
    }

    // Create new chat session
    const { data: session, error: sessionError } = await supabase
      .from('avatar_chat_sessions')
      .insert({
        requester_id: requesterId,
        target_user_id: targetUserId,
        status: 'active',
        vibe_score: 50, // Start neutral
        message_count: 0
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    console.log(`✅ Avatar chat session started: ${requesterId} → ${targetUserId}`);

    res.json({
      success: true,
      message: 'Chat session started successfully',
      data: {
        session: session,
        avatar: {
          personality: avatar.personality,
          interests: avatar.interests,
          communication_style: avatar.communication_style,
          bio: avatar.bio
        }
      }
    });

  } catch (error) {
    console.error('❌ Start chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SEND MESSAGE TO AVATAR
// ============================================================================
router.post('/chat/message', async (req, res) => {
  try {
    const { sessionId, message, sender } = req.body;

    if (!sessionId || !message || !sender) {
      return res.status(400).json({
        success: false,
        error: 'Session ID, message, and sender are required'
      });
    }

    // Get session details
    const { data: session, error: sessionError } = await supabase
      .from('avatar_chat_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        success: false,
        error: 'Chat session not found'
      });
    }

    // Get avatar personality
    const { data: avatar } = await supabase
      .from('user_avatars')
      .select('*')
      .eq('user_id', session.target_user_id)
      .single();

    // Save user message
    const { data: userMessage } = await supabase
      .from('avatar_messages')
      .insert({
        session_id: sessionId,
        sender: sender,
        message: message,
        is_avatar: false
      })
      .select()
      .single();

    // Generate AI response based on avatar personality
    // TODO: Integrate with Claude API for real AI responses
    // For now, generate a simple response
    const aiResponse = generateAvatarResponse(message, avatar);

    // Save AI response
    const { data: avatarMessage } = await supabase
      .from('avatar_messages')
      .insert({
        session_id: sessionId,
        sender: 'avatar',
        message: aiResponse,
        is_avatar: true
      })
      .select()
      .single();

    // Update session message count and vibe score
    const newMessageCount = session.message_count + 2;
    const newVibeScore = calculateVibeScore(session, message, aiResponse);

    await supabase
      .from('avatar_chat_sessions')
      .update({
        message_count: newMessageCount,
        vibe_score: newVibeScore,
        last_message_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    console.log(`💬 Avatar chat: ${sender} → ${aiResponse.substring(0, 50)}...`);

    res.json({
      success: true,
      data: {
        userMessage: userMessage,
        avatarResponse: avatarMessage,
        vibeScore: newVibeScore,
        messageCount: newMessageCount
      }
    });

  } catch (error) {
    console.error('❌ Send message error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET CHAT HISTORY
// ============================================================================
router.get('/chat/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('avatar_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get messages error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET USER'S CHAT SESSIONS
// ============================================================================
router.get('/chat/user/:userId/sessions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status = 'active' } = req.query;

    const { data, error } = await supabase
      .from('avatar_chat_sessions')
      .select('*')
      .eq('requester_id', userId)
      .eq('status', status)
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// END CHAT SESSION
// ============================================================================
router.put('/chat/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { finalVibeScore, feedback } = req.body;

    const { data, error } = await supabase
      .from('avatar_chat_sessions')
      .update({
        status: 'ended',
        vibe_score: finalVibeScore || undefined,
        feedback: feedback || undefined,
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Avatar chat session ended: ${sessionId}`);

    res.json({
      success: true,
      message: 'Chat session ended',
      data: data
    });

  } catch (error) {
    console.error('❌ End session error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET VIBE SCORE
// ============================================================================
router.get('/chat/:sessionId/vibe-score', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: session, error } = await supabase
      .from('avatar_chat_sessions')
      .select('vibe_score, message_count, created_at')
      .eq('id', sessionId)
      .single();

    if (error) throw error;

    const interpretation = interpretVibeScore(session.vibe_score);

    res.json({
      success: true,
      data: {
        vibeScore: session.vibe_score,
        messageCount: session.message_count,
        interpretation: interpretation,
        recommendation: getRecommendation(session.vibe_score)
      }
    });

  } catch (error) {
    console.error('❌ Get vibe score error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// AVATAR STATISTICS
// ============================================================================
router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Total chat sessions
    const { count: totalSessions } = await supabase
      .from('avatar_chat_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('target_user_id', userId);

    // Average vibe score
    const { data: sessions } = await supabase
      .from('avatar_chat_sessions')
      .select('vibe_score')
      .eq('target_user_id', userId)
      .eq('status', 'ended');

    const avgVibeScore = sessions?.length > 0
      ? (sessions.reduce((sum, s) => sum + s.vibe_score, 0) / sessions.length).toFixed(1)
      : 0;

    // Total messages
    const { count: totalMessages } = await supabase
      .from('avatar_messages')
      .select('*', { count: 'exact', head: true })
      .in('session_id', sessions?.map(s => s.id) || []);

    res.json({
      success: true,
      data: {
        totalChatSessions: totalSessions || 0,
        averageVibeScore: avgVibeScore,
        totalMessages: totalMessages || 0
      }
    });

  } catch (error) {
    console.error('❌ Avatar stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Generate avatar response (simplified - should use Claude API)
function generateAvatarResponse(userMessage, avatar) {
  const style = avatar?.communication_style || 'balanced';
  const interests = avatar?.interests || [];
  
  // Simple response generation (in production, use Claude API)
  const responses = {
    friendly: [
      "That's really interesting! Tell me more about that.",
      "I love chatting about this! What do you think?",
      "Awesome! I'm curious to hear your thoughts."
    ],
    professional: [
      "I appreciate your perspective on this.",
      "That's a thoughtful point. Could you elaborate?",
      "Interesting viewpoint. What led you to that conclusion?"
    ],
    balanced: [
      "That's a good point. What else interests you?",
      "I see what you mean. How do you feel about it?",
      "Interesting! I'd like to know more."
    ]
  };

  const responseList = responses[style] || responses.balanced;
  return responseList[Math.floor(Math.random() * responseList.length)];
}

// Calculate vibe score based on conversation
function calculateVibeScore(session, userMessage, avatarResponse) {
  // Simple algorithm (in production, use sentiment analysis)
  const currentScore = session.vibe_score || 50;
  
  // Positive keywords increase score
  const positiveKeywords = ['love', 'great', 'awesome', 'interesting', 'cool', 'amazing'];
  const negativeKeywords = ['hate', 'boring', 'stupid', 'bad', 'terrible'];
  
  let scoreChange = 0;
  const messageLower = userMessage.toLowerCase();
  
  positiveKeywords.forEach(keyword => {
    if (messageLower.includes(keyword)) scoreChange += 2;
  });
  
  negativeKeywords.forEach(keyword => {
    if (messageLower.includes(keyword)) scoreChange -= 2;
  });
  
  const newScore = Math.max(0, Math.min(100, currentScore + scoreChange));
  return newScore;
}

// Interpret vibe score
function interpretVibeScore(score) {
  if (score >= 80) return 'Excellent compatibility! 🔥';
  if (score >= 60) return 'Good vibes! ✨';
  if (score >= 40) return 'Neutral connection 👍';
  if (score >= 20) return 'Low compatibility ⚠️';
  return 'Not a good match 🚫';
}

// Get recommendation based on score
function getRecommendation(score) {
  if (score >= 70) return 'You two seem to have great chemistry! Feel confident about meeting up.';
  if (score >= 50) return 'There\'s potential here. Keep chatting to see how it goes!';
  if (score >= 30) return 'Mixed signals. Consider chatting more before meeting.';
  return 'Low compatibility detected. You might want to reconsider meeting up.';
}

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI Avatar service is running',
    features: [
      'Create AI avatars',
      'Avatar chat sessions',
      'Vibe score calculation',
      'Chat history',
      'Safety recommendations'
    ]
  });
});

module.exports = router;