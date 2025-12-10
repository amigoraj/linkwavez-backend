// ============================================
// LINKWAVEZ - COMMUNITIES (CLANS) ROUTES
// Complete clan system with AI safety screening
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
// SECTION 1: COMMUNITY CRUD (10 endpoints)
// ============================================

// 1.1 CREATE COMMUNITY
// POST /api/communities
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const {
            sub_category_id,
            name,
            description,
            rules,
            community_type, // public, private, invite_only
            location,
            location_lat,
            location_long,
            skill_level, // beginner, intermediate, advanced, all
            avatar_url,
            cover_photo_url
        } = req.body;

        // Validation
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ 
                success: false, 
                error: 'Community name must be at least 3 characters' 
            });
        }

        // Create community
        const { data: community, error } = await supabase
            .from('communities')
            .insert([{
                sub_category_id,
                creator_id: userId,
                name: name.trim(),
                description,
                rules,
                community_type: community_type || 'public',
                location,
                location_lat,
                location_long,
                skill_level: skill_level || 'all',
                member_count: 1, // Creator is first member
                avatar_url,
                cover_photo_url
            }])
            .select()
            .single();

        if (error) {
            console.error('Create community error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create community' });
        }

        // Auto-add creator as admin
        await supabase
            .from('community_members')
            .insert([{
                community_id: community.id,
                user_id: userId,
                role: 'creator'
            }]);

        res.status(201).json({
            success: true,
            message: 'Community created successfully',
            data: community
        });

    } catch (error) {
        console.error('Create community error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.2 GET COMMUNITIES (Search & List)
// GET /api/communities?search=ducati&category=vehicles&location=kl
router.get('/', async (req, res) => {
    try {
        const { 
            search, 
            category_id, 
            sub_category_id, 
            community_type,
            skill_level,
            page = 1, 
            limit = 20 
        } = req.query;

        let query = supabase
            .from('communities')
            .select(`
                *,
                creator:users!communities_creator_id_fkey(id, username, avatar_url),
                sub_category:sub_categories(id, name, icon)
            `)
            .order('member_count', { ascending: false });

        // Apply filters
        if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
        }

        if (sub_category_id) {
            query = query.eq('sub_category_id', sub_category_id);
        }

        if (community_type) {
            query = query.eq('community_type', community_type);
        }

        if (skill_level) {
            query = query.eq('skill_level', skill_level);
        }

        // Pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: communities, error, count } = await query;

        if (error) {
            console.error('Get communities error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch communities' });
        }

        res.json({
            success: true,
            data: communities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count
            }
        });

    } catch (error) {
        console.error('Get communities error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.3 GET COMMUNITY DETAILS
// GET /api/communities/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        const { data: community, error } = await supabase
            .from('communities')
            .select(`
                *,
                creator:users!communities_creator_id_fkey(id, username, avatar_url, wisdom_score, aura_score),
                sub_category:sub_categories(id, name, icon, category:categories(id, name, icon))
            `)
            .eq('id', id)
            .single();

        if (error || !community) {
            return res.status(404).json({ success: false, error: 'Community not found' });
        }

        // Check if user is member
        let isMember = false;
        let memberRole = null;

        if (userId) {
            const { data: membership } = await supabase
                .from('community_members')
                .select('role')
                .eq('community_id', id)
                .eq('user_id', userId)
                .single();

            if (membership) {
                isMember = true;
                memberRole = membership.role;
            }
        }

        res.json({
            success: true,
            data: {
                ...community,
                is_member: isMember,
                member_role: memberRole
            }
        });

    } catch (error) {
        console.error('Get community details error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.4 UPDATE COMMUNITY
// PUT /api/communities/:id
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if user is creator or moderator
        const { data: membership } = await supabase
            .from('community_members')
            .select('role')
            .eq('community_id', id)
            .eq('user_id', userId)
            .single();

        if (!membership || !['creator', 'moderator'].includes(membership.role)) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only community creator or moderators can update' 
            });
        }

        const updates = req.body;
        delete updates.id; // Prevent ID change
        delete updates.creator_id; // Prevent creator change
        delete updates.member_count; // Prevent manual count change

        const { data: community, error } = await supabase
            .from('communities')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Update community error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update community' });
        }

        res.json({
            success: true,
            message: 'Community updated successfully',
            data: community
        });

    } catch (error) {
        console.error('Update community error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.5 DELETE COMMUNITY
// DELETE /api/communities/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if user is creator
        const { data: community } = await supabase
            .from('communities')
            .select('creator_id')
            .eq('id', id)
            .single();

        if (!community || community.creator_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only community creator can delete' 
            });
        }

        const { error } = await supabase
            .from('communities')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete community error:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete community' });
        }

        res.json({
            success: true,
            message: 'Community deleted successfully'
        });

    } catch (error) {
        console.error('Delete community error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.6 GET CATEGORIES
// GET /api/communities/categories
router.get('/system/categories', async (req, res) => {
    try {
        const { data: categories, error } = await supabase
            .from('categories')
            .select('*')
            .eq('is_active', true)
            .order('order_index');

        if (error) {
            console.error('Get categories error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch categories' });
        }

        res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.7 GET SUB-CATEGORIES
// GET /api/communities/subcategories/:categoryId
router.get('/system/subcategories/:categoryId', async (req, res) => {
    try {
        const { categoryId } = req.params;

        const { data: subCategories, error } = await supabase
            .from('sub_categories')
            .select('*')
            .eq('category_id', categoryId)
            .eq('is_active', true)
            .order('order_index');

        if (error) {
            console.error('Get sub-categories error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch sub-categories' });
        }

        res.json({
            success: true,
            data: subCategories
        });

    } catch (error) {
        console.error('Get sub-categories error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============================================
// SECTION 2: MEMBERSHIP (8 endpoints)
// ============================================

// 2.1 JOIN COMMUNITY (with AI Avatar Screening)
// POST /api/communities/:id/join
router.post('/:id/join', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if already member
        const { data: existing } = await supabase
            .from('community_members')
            .select('id')
            .eq('community_id', id)
            .eq('user_id', userId)
            .single();

        if (existing) {
            return res.status(400).json({ 
                success: false, 
                error: 'Already a member of this community' 
            });
        }

        // Get community details
        const { data: community } = await supabase
            .from('communities')
            .select('name, community_type')
            .eq('id', id)
            .single();

        if (!community) {
            return res.status(404).json({ success: false, error: 'Community not found' });
        }

        // For private communities, require AI screening
        if (community.community_type === 'private') {
            // TODO: Call avatar.js for AI screening
            // const screeningResult = await callAvatarScreening(userId, id);
            // For now, we'll allow join with pending status
            
            const { data: member, error } = await supabase
                .from('community_members')
                .insert([{
                    community_id: id,
                    user_id: userId,
                    role: 'member',
                    is_active: false // Pending approval
                }])
                .select()
                .single();

            if (error) {
                console.error('Join community error:', error);
                return res.status(500).json({ success: false, error: 'Failed to join community' });
            }

            return res.json({
                success: true,
                message: 'Join request submitted. Pending AI screening and approval.',
                data: { status: 'pending', member }
            });
        }

        // For public communities, auto-join
        const { data: member, error } = await supabase
            .from('community_members')
            .insert([{
                community_id: id,
                user_id: userId,
                role: 'member'
            }])
            .select()
            .single();

        if (error) {
            console.error('Join community error:', error);
            return res.status(500).json({ success: false, error: 'Failed to join community' });
        }

        res.json({
            success: true,
            message: `Successfully joined ${community.name}!`,
            data: member
        });

    } catch (error) {
        console.error('Join community error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.2 LEAVE COMMUNITY
// POST /api/communities/:id/leave
router.post('/:id/leave', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if creator (can't leave own community)
        const { data: community } = await supabase
            .from('communities')
            .select('creator_id')
            .eq('id', id)
            .single();

        if (community && community.creator_id === userId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Creator cannot leave community. Transfer ownership or delete community.' 
            });
        }

        const { error } = await supabase
            .from('community_members')
            .delete()
            .eq('community_id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('Leave community error:', error);
            return res.status(500).json({ success: false, error: 'Failed to leave community' });
        }

        res.json({
            success: true,
            message: 'Successfully left community'
        });

    } catch (error) {
        console.error('Leave community error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.3 GET COMMUNITY MEMBERS
// GET /api/communities/:id/members
router.get('/:id/members', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 50, role } = req.query;

        let query = supabase
            .from('community_members')
            .select(`
                *,
                user:users(id, username, avatar_url, wisdom_score, aura_score),
                reputation:community_reputation(wisdom_score, expert_level)
            `)
            .eq('community_id', id)
            .eq('is_active', true)
            .order('joined_at', { ascending: false });

        if (role) {
            query = query.eq('role', role);
        }

        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: members, error } = await query;

        if (error) {
            console.error('Get members error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch members' });
        }

        res.json({
            success: true,
            data: members
        });

    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.4 UPDATE MEMBER ROLE
// PUT /api/communities/:id/members/:userId/role
router.put('/:id/members/:memberId/role', async (req, res) => {
    try {
        const { id, memberId } = req.params;
        const { role } = req.body; // moderator, member
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if requester is creator
        const { data: community } = await supabase
            .from('communities')
            .select('creator_id')
            .eq('id', id)
            .single();

        if (!community || community.creator_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only creator can change member roles' 
            });
        }

        if (!['moderator', 'member'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        const { data: member, error } = await supabase
            .from('community_members')
            .update({ role })
            .eq('community_id', id)
            .eq('user_id', memberId)
            .select()
            .single();

        if (error) {
            console.error('Update role error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update role' });
        }

        res.json({
            success: true,
            message: `Role updated to ${role}`,
            data: member
        });

    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.5 REMOVE MEMBER (Kick)
// DELETE /api/communities/:id/members/:memberId
router.delete('/:id/members/:memberId', async (req, res) => {
    try {
        const { id, memberId } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if requester has permission
        const { data: membership } = await supabase
            .from('community_members')
            .select('role')
            .eq('community_id', id)
            .eq('user_id', userId)
            .single();

        if (!membership || !['creator', 'moderator'].includes(membership.role)) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only creator or moderators can remove members' 
            });
        }

        const { error } = await supabase
            .from('community_members')
            .delete()
            .eq('community_id', id)
            .eq('user_id', memberId);

        if (error) {
            console.error('Remove member error:', error);
            return res.status(500).json({ success: false, error: 'Failed to remove member' });
        }

        res.json({
            success: true,
            message: 'Member removed successfully'
        });

    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.6 GET USER'S COMMUNITIES
// GET /api/communities/my
router.get('/user/my', async (req, res) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const { data: memberships, error } = await supabase
            .from('community_members')
            .select(`
                role,
                joined_at,
                community:communities(
                    id,
                    name,
                    description,
                    avatar_url,
                    member_count,
                    community_type
                )
            `)
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('joined_at', { ascending: false });

        if (error) {
            console.error('Get my communities error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch communities' });
        }

        res.json({
            success: true,
            data: memberships
        });

    } catch (error) {
        console.error('Get my communities error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============================================
// SECTION 3: COMMUNITY CONTENT (6 endpoints)
// ============================================

// 3.1 GET COMMUNITY FEED
// GET /api/communities/:id/feed
router.get('/:id/feed', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20, post_type } = req.query;

        let query = supabase
            .from('posts')
            .select(`
                *,
                author:users(id, username, avatar_url, wisdom_score, aura_score),
                reactions:post_reactions(count),
                comments:post_replies(count)
            `)
            .eq('community_id', id)
            .order('created_at', { ascending: false });

        if (post_type) {
            query = query.eq('post_type', post_type);
        }

        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);

        const { data: posts, error } = await query;

        if (error) {
            console.error('Get community feed error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch feed' });
        }

        res.json({
            success: true,
            data: posts
        });

    } catch (error) {
        console.error('Get community feed error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 3.2 GET COMMUNITY REPUTATION/LEADERBOARD
// GET /api/communities/:id/leaderboard
router.get('/:id/leaderboard', async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 10 } = req.query;

        const { data: leaderboard, error } = await supabase
            .from('community_reputation')
            .select(`
                *,
                user:users(id, username, avatar_url)
            `)
            .eq('community_id', id)
            .order('wisdom_score', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Get leaderboard error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
        }

        res.json({
            success: true,
            data: leaderboard
        });

    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 3.3 GET USER REPUTATION IN COMMUNITY
// GET /api/communities/:id/reputation/:userId
router.get('/:id/reputation/:targetUserId', async (req, res) => {
    try {
        const { id, targetUserId } = req.params;

        const { data: reputation, error } = await supabase
            .from('community_reputation')
            .select('*')
            .eq('community_id', id)
            .eq('user_id', targetUserId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Get reputation error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch reputation' });
        }

        res.json({
            success: true,
            data: reputation || {
                wisdom_score: 0,
                solutions_count: 0,
                replies_count: 0,
                upvotes_received: 0,
                expert_level: 'beginner'
            }
        });

    } catch (error) {
        console.error('Get reputation error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============================================
// SECTION 4: MEETUPS (10 endpoints)
// ============================================

// 4.1 CREATE MEETUP
// POST /api/communities/:id/meetups
router.post('/:id/meetups', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if user is member
        const { data: membership } = await supabase
            .from('community_members')
            .select('id')
            .eq('community_id', id)
            .eq('user_id', userId)
            .single();

        if (!membership) {
            return res.status(403).json({ 
                success: false, 
                error: 'Must be a community member to create meetups' 
            });
        }

        const {
            title,
            description,
            location,
            location_lat,
            location_long,
            meetup_date,
            max_attendees
        } = req.body;

        // Validation
        if (!title || !location || !meetup_date) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title, location, and date are required' 
            });
        }

        const { data: meetup, error } = await supabase
            .from('clan_meetups')
            .insert([{
                community_id: id,
                organizer_id: userId,
                title,
                description,
                location,
                location_lat,
                location_long,
                meetup_date,
                max_attendees: max_attendees || 50
            }])
            .select()
            .single();

        if (error) {
            console.error('Create meetup error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create meetup' });
        }

        // Auto-add organizer as first attendee
        await supabase
            .from('meetup_attendees')
            .insert([{
                meetup_id: meetup.id,
                user_id: userId,
                status: 'confirmed'
            }]);

        res.status(201).json({
            success: true,
            message: 'Meetup created successfully',
            data: meetup
        });

    } catch (error) {
        console.error('Create meetup error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 4.2 GET COMMUNITY MEETUPS
// GET /api/communities/:id/meetups
router.get('/:id/meetups', async (req, res) => {
    try {
        const { id } = req.params;
        const { upcoming = 'true' } = req.query;

        let query = supabase
            .from('clan_meetups')
            .select(`
                *,
                organizer:users(id, username, avatar_url),
                attendees:meetup_attendees(count)
            `)
            .eq('community_id', id)
            .order('meetup_date', { ascending: true });

        if (upcoming === 'true') {
            query = query.gte('meetup_date', new Date().toISOString());
        }

        const { data: meetups, error } = await query;

        if (error) {
            console.error('Get meetups error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch meetups' });
        }

        res.json({
            success: true,
            data: meetups
        });

    } catch (error) {
        console.error('Get meetups error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 4.3 RSVP TO MEETUP
// POST /api/communities/meetups/:meetupId/attend
router.post('/meetups/:meetupId/attend', async (req, res) => {
    try {
        const { meetupId } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if already attending
        const { data: existing } = await supabase
            .from('meetup_attendees')
            .select('id')
            .eq('meetup_id', meetupId)
            .eq('user_id', userId)
            .single();

        if (existing) {
            return res.status(400).json({ 
                success: false, 
                error: 'Already registered for this meetup' 
            });
        }

        // Check max attendees
        const { data: meetup } = await supabase
            .from('clan_meetups')
            .select('max_attendees')
            .eq('id', meetupId)
            .single();

        const { count: currentAttendees } = await supabase
            .from('meetup_attendees')
            .select('*', { count: 'exact', head: true })
            .eq('meetup_id', meetupId);

        if (currentAttendees >= meetup.max_attendees) {
            return res.status(400).json({ 
                success: false, 
                error: 'Meetup is full' 
            });
        }

        const { data: attendee, error } = await supabase
            .from('meetup_attendees')
            .insert([{
                meetup_id: meetupId,
                user_id: userId,
                status: 'interested'
            }])
            .select()
            .single();

        if (error) {
            console.error('RSVP error:', error);
            return res.status(500).json({ success: false, error: 'Failed to RSVP' });
        }

        res.json({
            success: true,
            message: 'Successfully registered for meetup',
            data: attendee
        });

    } catch (error) {
        console.error('RSVP error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 4.4 GET MEETUP ATTENDEES
// GET /api/communities/meetups/:meetupId/attendees
router.get('/meetups/:meetupId/attendees', async (req, res) => {
    try {
        const { meetupId } = req.params;

        const { data: attendees, error } = await supabase
            .from('meetup_attendees')
            .select(`
                *,
                user:users(id, username, avatar_url, wisdom_score, aura_score)
            `)
            .eq('meetup_id', meetupId)
            .order('joined_at');

        if (error) {
            console.error('Get attendees error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch attendees' });
        }

        res.json({
            success: true,
            data: attendees
        });

    } catch (error) {
        console.error('Get attendees error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============================================
// SECTION 5: DISCOVERY (8 endpoints)
// ============================================

// 5.1 TRENDING COMMUNITIES
// GET /api/communities/trending
router.get('/discover/trending', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        // Get communities with most activity in last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: communities, error } = await supabase
            .from('communities')
            .select(`
                *,
                creator:users!communities_creator_id_fkey(id, username, avatar_url),
                sub_category:sub_categories(id, name, icon)
            `)
            .gte('updated_at', sevenDaysAgo.toISOString())
            .order('member_count', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Get trending error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch trending' });
        }

        res.json({
            success: true,
            data: communities
        });

    } catch (error) {
        console.error('Get trending error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 5.2 RECOMMENDED COMMUNITIES
// GET /api/communities/recommended
router.get('/discover/recommended', async (req, res) => {
    try {
        const userId = req.user?.id;
        const { limit = 10 } = req.query;

        if (!userId) {
            // Return popular communities for non-logged in users
            const { data: communities, error } = await supabase
                .from('communities')
                .select('*')
                .order('member_count', { ascending: false })
                .limit(limit);

            return res.json({ success: true, data: communities });
        }

        // Get user's current communities
        const { data: userCommunities } = await supabase
            .from('community_members')
            .select('community:communities(sub_category_id)')
            .eq('user_id', userId);

        const userSubCategories = userCommunities.map(m => m.community.sub_category_id);

        // Recommend communities in similar categories
        let query = supabase
            .from('communities')
            .select(`
                *,
                sub_category:sub_categories(id, name, icon)
            `)
            .order('member_count', { ascending: false })
            .limit(limit);

        if (userSubCategories.length > 0) {
            query = query.in('sub_category_id', userSubCategories);
        }

        const { data: recommended, error } = await query;

        if (error) {
            console.error('Get recommended error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch recommendations' });
        }

        res.json({
            success: true,
            data: recommended
        });

    } catch (error) {
        console.error('Get recommended error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 5.3 NEARBY COMMUNITIES
// GET /api/communities/nearby?lat=3.139&lng=101.6869&radius=10
router.get('/discover/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 10 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ 
                success: false, 
                error: 'Latitude and longitude required' 
            });
        }

        // Simple distance calculation (not perfect but works for nearby)
        // For production, use PostGIS or similar
        const { data: communities, error } = await supabase
            .from('communities')
            .select('*')
            .not('location_lat', 'is', null)
            .not('location_long', 'is', null);

        if (error) {
            console.error('Get nearby error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch nearby' });
        }

        // Filter by radius (rough calculation)
        const nearby = communities.filter(c => {
            const distance = calculateDistance(
                parseFloat(lat),
                parseFloat(lng),
                c.location_lat,
                c.location_long
            );
            return distance <= parseFloat(radius);
        });

        res.json({
            success: true,
            data: nearby
        });

    } catch (error) {
        console.error('Get nearby error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Calculate distance between two coordinates (in km)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = router;