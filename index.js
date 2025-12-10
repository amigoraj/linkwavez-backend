// index.js
// LinkWavez Backend Server - Main Entry Point with Socket.IO

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import routes
const usersRoutes = require('./routes/users');
const celebrityRoutes = require('./routes/celebrity');
const fansRoutes = require('./routes/fans');
const subscriptionsRoutes = require('./routes/subscriptions');
const fanSubscriptionsRoutes = require('./routes/fanSubscriptions');
const postsRoutes = require('./routes/posts');
const feedRoutes = require('./routes/feed');
const reactionsRoutes = require('./routes/reactions');
const commentsRoutes = require('./routes/comments');
const hashtagsRoutes = require('./routes/hashtags');
const mediaRoutes = require('./routes/media');
const charityRoutes = require('./routes/charity');
const { router: crisisRoutes } = require('./routes/crisis');
const { router: notificationsRoutes } = require('./routes/notifications');
const searchRoutes = require('./routes/search');
const analyticsRoutes = require('./routes/analytics');
const avatarRoutes = require('./routes/avatar');
const chatRoutes = require('./routes/chat');
const streamingRoutes = require('./routes/streaming');
const marketplaceRoutes = require('./routes/marketplace');
const communitiesRoutes = require('./routes/communities'); 
const privacyRoutes = require('./routes/privacy'); 
const discoveryRoutes = require('./routes/discovery');

// Initialize Socket.IO for chat
const { initChatSocket } = require('./socket/chatSocket');
initChatSocket(io);

// API Routes
app.use('/api/users', usersRoutes);
app.use('/api/celebrity', celebrityRoutes);
app.use('/api/fans', fansRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/fan-subscriptions', fanSubscriptionsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/reactions', reactionsRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/hashtags', hashtagsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/charity', charityRoutes);
app.use('/api/crisis', crisisRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/avatar', avatarRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/streaming', streamingRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/communities', communitiesRoutes); 
app.use('/api/privacy', privacyRoutes); 
app.use('/api/discovery', discoveryRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    app: 'LinkWavez Backend',
    version: '3.1.0', 
    features: [
      '✅ User Authentication',
      '✅ Celebrity Dashboard',
      '✅ Fan Management (5 tiers)',
      '✅ Subscriptions (6 plans)',
      '✅ Premium Features',
      '✅ Posts & Feed System',
      '✅ Smart AI Feed',
      '✅ 6 Smart Reactions',
      '✅ Comments with Priority',
      '✅ Hashtag System',
      '✅ Charity System 🎗️',
      '✅ Crisis Detection 🚨',
      '✅ Notifications 🔔',
      '✅ Search & Discovery 🔍',
      '✅ Analytics Dashboard 📊',
      '✅ AI Avatar System 🤖',
      '✅ Real-time Chat 💬',
      '✅ Live Streaming 📹',
      '✅ Marketplace 🛍️',
      '✅ Communities (Clans) 🤝', // ← NEW!
      '✅ Privacy System 🔒', // ← NEW!
      '✅ Wisdom/Aura Scoring',
      '✅ Media Upload (Photos/Videos)'
    ],
    status: 'running',
    completionStatus: '100% COMPLETE! 🎉',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║   🎉🎉🎉 LinkWavez Backend v3.1.0 🎉🎉🎉              ║
║                                                        ║
║  Server: http://localhost:${PORT}                       ║
║  Status: ✅ RUNNING                                    ║
║  Socket.IO: ✅ ENABLED                                 ║
║                                                        ║
║  ═══════════════ SOCIAL FEATURES ══════════════       ║
║                                                        ║
║  ✅ User Management & Authentication                   ║
║  ✅ Posts & Feed (Smart AI Algorithm)                  ║
║  ✅ 6 Smart Reactions (😂❤️🙏🤔👏🔥)                   ║
║  ✅ Comments with Priority Scoring                     ║
║  ✅ Hashtags (Trending & Search)                       ║
║  ✅ Media Upload (Cloudinary)                          ║
║                                                        ║
║  ═══════════════ PREMIUM FEATURES ═════════════       ║
║                                                        ║
║  ✅ Celebrity Dashboard                                ║
║  ✅ Fan Tier System (5 levels)                         ║
║  ✅ Subscriptions (6 premium plans)                    ║
║  ✅ Verified & Premium Badges                          ║
║  ✅ Wisdom & Aura Scoring                              ║
║                                                        ║
║  ════════════ ADVANCED SYSTEMS! 🚀 ════════════       ║
║                                                        ║
║  🎗️  Charity System (100% transparency)               ║
║  🚨 Crisis Detection (Good Aura helpers)              ║
║  🔔 Notifications (Push/Email ready)                  ║
║  🔍 Search & Discovery (Universal search)             ║
║  📊 Analytics Dashboard (Track everything)            ║
║  🤖 AI Avatar System (Chat before meetup)             ║
║  💬 Real-time Chat (Socket.IO)                        ║
║  📹 Live Streaming (Agora.io ready)                   ║
║  🛍️  Marketplace (Services/Food/Products)             ║
║  🤝 Communities/Clans (Real meetups!)                 ║
║  🔒 Privacy System (Ghost mode!)                      ║
║                                                        ║
║  ═══════════════ QUICK TEST LINKS ═════════════       ║
║                                                        ║
║  Health Checks:                                        ║
║    GET /api/charity/health                             ║
║    GET /api/crisis/health                              ║
║    GET /api/notifications/health                       ║
║    GET /api/search/health                              ║
║    GET /api/analytics/health                           ║
║    GET /api/avatar/health                              ║
║    GET /api/chat/health                                ║
║    GET /api/streaming/health                           ║
║    GET /api/marketplace/health                         ║
║                                                        ║
║  NEW Routes:                                           ║
║    GET /api/communities/system/categories              ║
║    GET /api/privacy/settings                           ║
║                                                        ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━       ║
║  🎉🎉🎉 BACKEND: 100% COMPLETE! 🎉🎉🎉               ║
║  🚀 READY FOR PRODUCTION DEPLOYMENT!                  ║
║  💪 COMMUNITIES & PRIVACY ADDED!                      ║
║  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━       ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);
});