const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// CREATE CONVERSATION (Direct or Group)
// ============================================================================
router.post('/conversations/create', async (req, res) => {
  try {
    const { creatorId, participantIds, type, name, description } = req.body;

    if (!creatorId || !participantIds || participantIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Creator ID and participant IDs are required'
      });
    }

    const conversationType = type || (participantIds.length === 1 ? 'direct' : 'group');

    // For direct messages, check if conversation already exists
    if (conversationType === 'direct') {
      const { data: existing } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .in('user_id', [creatorId, participantIds[0]]);

      if (existing && existing.length >= 2) {
        const conversationCounts = {};
        existing.forEach(p => {
          conversationCounts[p.conversation_id] = (conversationCounts[p.conversation_id] || 0) + 1;
        });

        const existingConvId = Object.keys(conversationCounts).find(
          convId => conversationCounts[convId] === 2
        );

        if (existingConvId) {
          const { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', existingConvId)
            .single();

          return res.json({
            success: true,
            message: 'Conversation already exists',
            data: conv
          });
        }
      }
    }

    // Create new conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: conversationType,
        name: name || null,
        description: description || null,
        created_by: creatorId
      })
      .select()
      .single();

    if (convError) throw convError;

    // Add participants
    const participants = [creatorId, ...participantIds].map(userId => ({
      conversation_id: conversation.id,
      user_id: userId
    }));

    const { error: partError } = await supabase
      .from('conversation_participants')
      .insert(participants);

    if (partError) throw partError;

    console.log(`✅ ${conversationType} conversation created: ${conversation.id}`);

    res.json({
      success: true,
      message: 'Conversation created successfully',
      data: conversation
    });

  } catch (error) {
    console.error('❌ Create conversation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET USER'S CONVERSATIONS
// ============================================================================
router.get('/conversations/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    // Get conversations user is part of
    const { data: participations } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    if (!participations || participations.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }

    const conversationIds = participations.map(p => p.conversation_id);

    // Get conversation details
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    // Get last message for each conversation
    const conversationsWithDetails = await Promise.all(
      conversations.map(async (conv) => {
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get unread count
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId)
          .eq('read', false);

        // Get participants
        const { data: participants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conv.id)
          .neq('user_id', userId);

        return {
          ...conv,
          lastMessage: lastMessage,
          unreadCount: unreadCount || 0,
          participants: participants?.map(p => p.user_id) || []
        };
      })
    );

    res.json({
      success: true,
      data: conversationsWithDetails
    });

  } catch (error) {
    console.error('❌ Get conversations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET CONVERSATION MESSAGES
// ============================================================================
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      success: true,
      data: data.reverse()
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
// SEND MESSAGE
// ============================================================================
router.post('/messages/send', async (req, res) => {
  try {
    const { conversationId, senderId, content, messageType, attachmentUrl } = req.body;

    if (!conversationId || !senderId || !content) {
      return res.status(400).json({
        success: false,
        error: 'Conversation ID, sender ID, and content are required'
      });
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: content,
        message_type: messageType || 'text',
        attachment_url: attachmentUrl,
        read: false
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log(`💬 Message sent in conversation ${conversationId}`);

    res.json({
      success: true,
      data: message
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
// MARK MESSAGES AS READ
// ============================================================================
router.put('/messages/read', async (req, res) => {
  try {
    const { conversationId, userId } = req.body;

    if (!conversationId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Conversation ID and user ID are required'
      });
    }

    const { data, error } = await supabase
      .from('messages')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .eq('read', false)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: `${data.length} messages marked as read`,
      data: { count: data.length }
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
// DELETE MESSAGE
// ============================================================================
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;

    const { data: message } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .single();

    if (!message || message.sender_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to delete this message'
      });
    }

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Message deleted'
    });

  } catch (error) {
    console.error('❌ Delete message error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// LEAVE CONVERSATION
// ============================================================================
router.delete('/conversations/:conversationId/leave', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;

    const { error } = await supabase
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);

    if (error) throw error;

    console.log(`👋 User ${userId} left conversation ${conversationId}`);

    res.json({
      success: true,
      message: 'Left conversation successfully'
    });

  } catch (error) {
    console.error('❌ Leave conversation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CREATE CELEBRITY CHAT
// ============================================================================
router.post('/celebrity/create', async (req, res) => {
  try {
    const { celebrityId, fanTier, name, description, maxMembers } = req.body;

    if (!celebrityId || !fanTier) {
      return res.status(400).json({
        success: false,
        error: 'Celebrity ID and fan tier are required'
      });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: 'celebrity',
        celebrity_id: celebrityId,
        name: name || `${fanTier.toUpperCase()} Fan Group`,
        description: description,
        created_by: celebrityId,
        max_participants: maxMembers || 500
      })
      .select()
      .single();

    if (convError) throw convError;

    const { data: fanGroup, error: groupError } = await supabase
      .from('celebrity_fan_groups')
      .insert({
        celebrity_id: celebrityId,
        conversation_id: conversation.id,
        fan_tier: fanTier,
        min_tier_required: fanTier,
        max_members: maxMembers || 500
      })
      .select()
      .single();

    if (groupError) throw groupError;

    await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: conversation.id,
        user_id: celebrityId,
        role: 'admin'
      });

    console.log(`✅ Celebrity fan group created: ${fanTier}`);

    res.json({
      success: true,
      message: 'Celebrity fan group created',
      data: { conversation, fanGroup }
    });

  } catch (error) {
    console.error('❌ Create celebrity chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// JOIN CELEBRITY CHAT
// ============================================================================
router.post('/celebrity/join', async (req, res) => {
  try {
    const { userId, conversationId } = req.body;

    if (!userId || !conversationId) {
      return res.status(400).json({
        success: false,
        error: 'User ID and conversation ID are required'
      });
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('celebrity_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    const { data: fanStatus } = await supabase
      .from('celebrity_fans')
      .select('tier')
      .eq('fan_id', userId)
      .eq('celebrity_id', conversation.celebrity_id)
      .single();

    if (!fanStatus) {
      return res.status(403).json({
        success: false,
        error: 'You must be a fan to join this chat'
      });
    }

    const { data: fanGroup } = await supabase
      .from('celebrity_fan_groups')
      .select('min_tier_required')
      .eq('conversation_id', conversationId)
      .single();

    const tierLevels = { new: 1, active: 2, loyal: 3, super_fan: 4, die_hard: 5 };
    if (tierLevels[fanStatus.tier] < tierLevels[fanGroup.min_tier_required]) {
      return res.status(403).json({
        success: false,
        error: `You need to be at least ${fanGroup.min_tier_required} tier`
      });
    }

    const { data, error } = await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: conversationId,
        user_id: userId,
        role: 'fan',
        required_fan_tier: fanGroup.min_tier_required
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Fan joined celebrity chat ${conversationId}`);

    res.json({
      success: true,
      message: 'Joined celebrity chat successfully',
      data: data
    });

  } catch (error) {
    console.error('❌ Join celebrity chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CREATE WORKPLACE ORGANIZATION
// ============================================================================
router.post('/workplace/organization/create', async (req, res) => {
  try {
    const { name, description, logoUrl, creatorId, maxMembers } = req.body;

    if (!name || !creatorId) {
      return res.status(400).json({
        success: false,
        error: 'Name and creator ID are required'
      });
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: name,
        description: description,
        logo_url: logoUrl,
        created_by: creatorId,
        max_members: maxMembers || 1000
      })
      .select()
      .single();

    if (orgError) throw orgError;

    await supabase
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: creatorId,
        role: 'owner'
      });

    console.log(`✅ Organization created: ${name}`);

    res.json({
      success: true,
      message: 'Organization created successfully',
      data: org
    });

  } catch (error) {
    console.error('❌ Create organization error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CREATE WORKPLACE CHAT
// ============================================================================
router.post('/workplace/chat/create', async (req, res) => {
  try {
    const { organizationId, name, description, creatorId } = req.body;

    if (!organizationId || !name || !creatorId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID, name, and creator ID are required'
      });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', creatorId)
      .single();

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You must be a member of this organization'
      });
    }

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        type: 'workplace',
        organization_id: organizationId,
        name: name,
        description: description,
        created_by: creatorId
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: conversation.id,
        user_id: creatorId,
        role: 'admin'
      });

    console.log(`✅ Workplace chat created: ${name}`);

    res.json({
      success: true,
      message: 'Workplace chat created successfully',
      data: conversation
    });

  } catch (error) {
    console.error('❌ Create workplace chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SET USER MOOD
// ============================================================================
router.post('/mood/set', async (req, res) => {
  try {
    const { userId, conversationId, mood, emoji, durationMinutes } = req.body;

    if (!userId || !conversationId || !mood) {
      return res.status(400).json({
        success: false,
        error: 'User ID, conversation ID, and mood are required'
      });
    }

    const duration = durationMinutes || 60;
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + duration);

    await supabase
      .from('chat_moods')
      .delete()
      .eq('user_id', userId)
      .eq('conversation_id', conversationId);

    const { data, error } = await supabase
      .from('chat_moods')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        mood: mood,
        emoji: emoji,
        duration_minutes: duration,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`😊 User mood set: ${mood}`);

    res.json({
      success: true,
      message: 'Mood set successfully',
      data: data
    });

  } catch (error) {
    console.error('❌ Set mood error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET CONVERSATION MOODS
// ============================================================================
router.get('/conversations/:conversationId/moods', async (req, res) => {
  try {
    const { conversationId } = req.params;

    const { data, error } = await supabase
      .from('chat_moods')
      .select('*')
      .eq('conversation_id', conversationId)
      .gt('expires_at', new Date().toISOString());

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get moods error:', error);
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
    message: 'Chat service is running',
    features: [
      'Direct messages',
      'Group chats',
      'Celebrity fan chats',
      'Workplace chats',
      'Mood tracking',
      'Real-time messaging (Socket.IO)',
      'Read receipts',
      'Typing indicators'
    ]
  });
});

module.exports = router;