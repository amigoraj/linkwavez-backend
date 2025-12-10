const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Store active users
const activeUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId

function initChatSocket(io) {
  io.on('connection', (socket) => {
    console.log('💬 User connected:', socket.id);

    // ========================================================================
    // USER CONNECT
    // ========================================================================
    socket.on('user:connect', (userId) => {
      activeUsers.set(userId, socket.id);
      userSockets.set(socket.id, userId);
      
      // Broadcast online status
      io.emit('user:online', { userId });
      
      console.log(`✅ User ${userId} is now online`);
    });

    // ========================================================================
    // JOIN CONVERSATION
    // ========================================================================
    socket.on('conversation:join', (conversationId) => {
      socket.join(conversationId);
      console.log(`📥 Socket ${socket.id} joined conversation ${conversationId}`);
    });

    // ========================================================================
    // LEAVE CONVERSATION
    // ========================================================================
    socket.on('conversation:leave', (conversationId) => {
      socket.leave(conversationId);
      console.log(`📤 Socket ${socket.id} left conversation ${conversationId}`);
    });

    // ========================================================================
    // SEND MESSAGE
    // ========================================================================
    socket.on('message:send', async (data) => {
      try {
        const { conversationId, senderId, content, messageType, attachmentUrl } = data;

        // Save message to database
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

        // Update conversation
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId);

        // Broadcast to conversation participants
        io.to(conversationId).emit('message:received', message);

        console.log(`💬 Message sent: ${conversationId}`);
      } catch (error) {
        console.error('❌ Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ========================================================================
    // TYPING INDICATOR
    // ========================================================================
    socket.on('typing:start', (data) => {
      const { conversationId, userId } = data;
      socket.to(conversationId).emit('typing:user', { userId, isTyping: true });
    });

    socket.on('typing:stop', (data) => {
      const { conversationId, userId } = data;
      socket.to(conversationId).emit('typing:user', { userId, isTyping: false });
    });

    // ========================================================================
    // READ RECEIPT
    // ========================================================================
    socket.on('message:read', async (data) => {
      try {
        const { conversationId, userId, messageIds } = data;

        // Update messages as read
        await supabase
          .from('messages')
          .update({ read: true, read_at: new Date().toISOString() })
          .in('id', messageIds);

        // Notify sender
        io.to(conversationId).emit('messages:read', { userId, messageIds });
      } catch (error) {
        console.error('❌ Read receipt error:', error);
      }
    });

    // ========================================================================
    // DISCONNECT
    // ========================================================================
    socket.on('disconnect', () => {
      const userId = userSockets.get(socket.id);
      
      if (userId) {
        activeUsers.delete(userId);
        userSockets.delete(socket.id);
        
        // Broadcast offline status
        io.emit('user:offline', { userId });
        
        console.log(`❌ User ${userId} disconnected`);
      }
    });
  });

  return io;
}

module.exports = { initChatSocket, activeUsers };