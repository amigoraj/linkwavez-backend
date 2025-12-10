// ============================================
// LINKWAVEZ - PRIVACY ROUTES
// Handles all privacy settings and controls
// ============================================

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// ============================================
// PRIVACY PRESETS
// ============================================

const PRIVACY_PRESETS = {
    public: {
        privacy_preset: 'public',
        show_wisdom_score: true,
        show_aura_score: true,
        show_follower_count: true,
        show_post_count: true,
        show_badges: true,
        show_communities: true,
        show_location: true,
        show_last_active: true,
        show_photos_tab: true,
        show_videos_tab: true,
        post_visibility: 'public',
        show_scores_on_posts: true,
        who_can_comment: 'everyone',
        who_can_share: 'everyone',
        show_reactions_count: true,
        show_view_count: true,
        who_can_message: 'everyone',
        show_online_status: 'everyone',
        show_read_receipts: true,
        show_typing_indicator: true,
        who_can_tag: 'everyone',
        who_can_mention: 'everyone',
        ghost_mode_enabled: false
    },
    social: {
        privacy_preset: 'social',
        show_wisdom_score: true,
        show_aura_score: true,
        show_follower_count: true,
        show_post_count: true,
        show_badges: true,
        show_communities: true,
        show_location: true,
        show_last_active: true,
        show_photos_tab: true,
        show_videos_tab: true,
        post_visibility: 'public',
        show_scores_on_posts: true,
        who_can_comment: 'everyone',
        who_can_share: 'everyone',
        show_reactions_count: true,
        show_view_count: true,
        who_can_message: 'followers',
        show_online_status: 'friends',
        show_read_receipts: true,
        show_typing_indicator: true,
        who_can_tag: 'friends',
        who_can_mention: 'everyone',
        ghost_mode_enabled: false
    },
    private: {
        privacy_preset: 'private',
        show_wisdom_score: false,
        show_aura_score: false,
        show_follower_count: false,
        show_post_count: false,
        show_badges: true,
        show_communities: false,
        show_location: false,
        show_last_active: false,
        show_photos_tab: true,
        show_videos_tab: true,
        post_visibility: 'community',
        show_scores_on_posts: false,
        who_can_comment: 'friends',
        who_can_share: 'credit',
        show_reactions_count: true,
        show_view_count: false,
        who_can_message: 'friends',
        show_online_status: 'nobody',
        show_read_receipts: false,
        show_typing_indicator: false,
        who_can_tag: 'friends',
        who_can_mention: 'friends',
        ghost_mode_enabled: false
    },
    ghost: {
        privacy_preset: 'ghost',
        show_wisdom_score: false,
        show_aura_score: false,
        show_follower_count: false,
        show_post_count: false,
        show_badges: false,
        show_communities: false,
        show_location: false,
        show_last_active: false,
        show_photos_tab: false,
        show_videos_tab: false,
        post_visibility: 'friends',
        show_scores_on_posts: false,
        who_can_comment: 'friends',
        who_can_share: 'nobody',
        show_reactions_count: false,
        show_view_count: false,
        who_can_message: 'friends',
        show_online_status: 'nobody',
        show_read_receipts: false,
        show_typing_indicator: false,
        who_can_tag: 'nobody',
        who_can_mention: 'nobody',
        ghost_mode_enabled: true // Premium only
    }
};

// ============================================
// 1. GET PRIVACY SETTINGS
// GET /api/privacy/settings
// ============================================

router.get('/settings', async (req, res) => {
    try {
        const userId = req.user?.id; // Assuming auth middleware sets req.user

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Get user's privacy settings
        const { data: settings, error } = await supabase
            .from('user_privacy_settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error fetching privacy settings:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch privacy settings'
            });
        }

        // If no settings exist, create default (social preset)
        if (!settings) {
            const { data: newSettings, error: createError } = await supabase
                .from('user_privacy_settings')
                .insert([{
                    user_id: userId,
                    ...PRIVACY_PRESETS.social
                }])
                .select()
                .single();

            if (createError) {
                console.error('Error creating default settings:', createError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create privacy settings'
                });
            }

            return res.json({
                success: true,
                data: newSettings
            });
        }

        res.json({
            success: true,
            data: settings
        });

    } catch (error) {
        console.error('Get privacy settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// ============================================
// 2. UPDATE PRIVACY SETTINGS
// POST /api/privacy/settings
// ============================================

router.post('/settings', async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const updates = req.body;

        // Validate ghost mode (premium only)
        if (updates.ghost_mode_enabled === true) {
            // Check if user has premium subscription
            const { data: subscription } = await supabase
                .from('user_subscriptions')
                .select('tier, is_active')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();

            if (!subscription || subscription.tier === 'free') {
                return res.status(403).json({
                    success: false,
                    error: 'Ghost mode requires premium subscription',
                    upgrade_required: true
                });
            }
        }

        // Check if settings exist
        const { data: existing } = await supabase
            .from('user_privacy_settings')
            .select('id')
            .eq('user_id', userId)
            .single();

        let result;

        if (existing) {
            // Update existing settings
            const { data, error } = await supabase
                .from('user_privacy_settings')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .select()
                .single();

            if (error) {
                console.error('Error updating privacy settings:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to update privacy settings'
                });
            }

            result = data;
        } else {
            // Insert new settings
            const { data, error } = await supabase
                .from('user_privacy_settings')
                .insert([{
                    user_id: userId,
                    ...PRIVACY_PRESETS.social,
                    ...updates
                }])
                .select()
                .single();

            if (error) {
                console.error('Error creating privacy settings:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create privacy settings'
                });
            }

            result = data;
        }

        res.json({
            success: true,
            message: 'Privacy settings updated successfully',
            data: result
        });

    } catch (error) {
        console.error('Update privacy settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// ============================================
// 3. APPLY PRIVACY PRESET
// POST /api/privacy/preset/:name
// ============================================

router.post('/preset/:name', async (req, res) => {
    try {
        const userId = req.user?.id;
        const presetName = req.params.name.toLowerCase();

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Validate preset name
        if (!PRIVACY_PRESETS[presetName]) {
            return res.status(400).json({
                success: false,
                error: 'Invalid preset name',
                available_presets: ['public', 'social', 'private', 'ghost']
            });
        }

        // Check if ghost preset (premium only)
        if (presetName === 'ghost') {
            const { data: subscription } = await supabase
                .from('user_subscriptions')
                .select('tier, is_active')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();

            if (!subscription || subscription.tier === 'free') {
                return res.status(403).json({
                    success: false,
                    error: 'Ghost mode requires premium subscription',
                    upgrade_required: true
                });
            }
        }

        const presetSettings = PRIVACY_PRESETS[presetName];

        // Check if settings exist
        const { data: existing } = await supabase
            .from('user_privacy_settings')
            .select('id')
            .eq('user_id', userId)
            .single();

        let result;

        if (existing) {
            // Update existing settings
            const { data, error } = await supabase
                .from('user_privacy_settings')
                .update({
                    ...presetSettings,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId)
                .select()
                .single();

            if (error) {
                console.error('Error applying preset:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to apply preset'
                });
            }

            result = data;
        } else {
            // Insert new settings with preset
            const { data, error } = await supabase
                .from('user_privacy_settings')
                .insert([{
                    user_id: userId,
                    ...presetSettings
                }])
                .select()
                .single();

            if (error) {
                console.error('Error creating settings with preset:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to apply preset'
                });
            }

            result = data;
        }

        res.json({
            success: true,
            message: `Privacy preset '${presetName}' applied successfully`,
            data: result
        });

    } catch (error) {
        console.error('Apply preset error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// ============================================
// 4. CHECK USER VISIBILITY
// GET /api/privacy/check/:userId
// ============================================

router.get('/check/:userId', async (req, res) => {
    try {
        const viewerId = req.user?.id; // Who is viewing
        const targetUserId = req.params.userId; // Whose profile to check

        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                error: 'User ID required'
            });
        }

        // Get target user's privacy settings
        const { data: settings, error } = await supabase
            .from('user_privacy_settings')
            .select('*')
            .eq('user_id', targetUserId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching privacy settings:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to check privacy settings'
            });
        }

        // If no settings, use default (social preset)
        const privacySettings = settings || PRIVACY_PRESETS.social;

        // If viewing own profile, show everything
        if (viewerId === targetUserId) {
            return res.json({
                success: true,
                data: {
                    can_view_profile: true,
                    can_view_wisdom: true,
                    can_view_aura: true,
                    can_view_followers: true,
                    can_view_posts: true,
                    can_view_communities: true,
                    can_view_badges: true,
                    can_view_location: true,
                    can_view_photos: true,
                    can_view_videos: true,
                    can_message: true,
                    can_comment: true,
                    can_tag: true,
                    can_mention: true,
                    is_own_profile: true
                }
            });
        }

        // Check relationship between viewer and target
        let relationship = 'stranger'; // stranger, follower, following, friend

        if (viewerId) {
            // Check if viewer follows target
            const { data: followData } = await supabase
                .from('user_follows')
                .select('id')
                .eq('follower_id', viewerId)
                .eq('following_id', targetUserId)
                .single();

            // Check if target follows viewer
            const { data: followBackData } = await supabase
                .from('user_follows')
                .select('id')
                .eq('follower_id', targetUserId)
                .eq('following_id', viewerId)
                .single();

            if (followData && followBackData) {
                relationship = 'friend'; // Mutual follow
            } else if (followData) {
                relationship = 'following';
            } else if (followBackData) {
                relationship = 'follower';
            }
        }

        // Determine what viewer can see based on settings and relationship
        const visibility = {
            can_view_profile: true, // Always can view profile page
            can_view_wisdom: privacySettings.show_wisdom_score,
            can_view_aura: privacySettings.show_aura_score,
            can_view_followers: privacySettings.show_follower_count,
            can_view_posts: true, // Depends on post_visibility (checked per post)
            can_view_communities: privacySettings.show_communities,
            can_view_badges: privacySettings.show_badges,
            can_view_location: privacySettings.show_location,
            can_view_photos: privacySettings.show_photos_tab,
            can_view_videos: privacySettings.show_videos_tab,
            can_view_post_count: privacySettings.show_post_count,
            can_view_last_active: privacySettings.show_last_active,
            is_own_profile: false
        };

        // Check messaging permission
        visibility.can_message = checkPermission(
            privacySettings.who_can_message,
            relationship
        );

        // Check commenting permission
        visibility.can_comment = checkPermission(
            privacySettings.who_can_comment,
            relationship
        );

        // Check tagging permission
        visibility.can_tag = checkPermission(
            privacySettings.who_can_tag,
            relationship
        );

        // Check mention permission
        visibility.can_mention = checkPermission(
            privacySettings.who_can_mention,
            relationship
        );

        res.json({
            success: true,
            data: {
                ...visibility,
                relationship,
                privacy_preset: privacySettings.privacy_preset
            }
        });

    } catch (error) {
        console.error('Check visibility error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// ============================================
// HELPER FUNCTION: Check Permission
// ============================================

function checkPermission(setting, relationship) {
    switch (setting) {
        case 'everyone':
            return true;
        case 'followers':
            return ['follower', 'friend'].includes(relationship);
        case 'friends':
            return relationship === 'friend';
        case 'nobody':
            return false;
        default:
            return false;
    }
}

// ============================================
// 5. GET AVAILABLE PRESETS (Helper endpoint)
// GET /api/privacy/presets
// ============================================

router.get('/presets', (req, res) => {
    res.json({
        success: true,
        data: {
            presets: [
                {
                    name: 'public',
                    title: 'Public (Influencer Mode)',
                    description: 'Everything visible • Maximum engagement',
                    icon: '📣',
                    requires_premium: false
                },
                {
                    name: 'social',
                    title: 'Social (Balanced)',
                    description: 'Show stats • Community focused',
                    icon: '🤝',
                    requires_premium: false
                },
                {
                    name: 'private',
                    title: 'Private (Introvert Mode)',
                    description: 'Hide all scores • Maximum privacy',
                    icon: '🔒',
                    requires_premium: false
                },
                {
                    name: 'ghost',
                    title: 'Ghost (Observer Mode)',
                    description: 'Browse invisibly • Premium only',
                    icon: '👻',
                    requires_premium: true
                }
            ]
        }
    });
});

module.exports = router;