// ============================================
// LINKWAVEZ - DISCOVERY ROUTES
// Local feed system - "What's happening around me?"
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

// Filter by distance
function filterByDistance(items, userLat, userLng, radiusKm) {
    return items.filter(item => {
        if (!item.location_lat || !item.location_long) return false;
        const distance = calculateDistance(
            parseFloat(userLat),
            parseFloat(userLng),
            item.location_lat,
            item.location_long
        );
        return distance <= radiusKm;
    }).map(item => ({
        ...item,
        distance_km: calculateDistance(
            parseFloat(userLat),
            parseFloat(userLng),
            item.location_lat,
            item.location_long
        ).toFixed(2)
    }));
}

// ============================================
// SECTION 1: LOCAL BUSINESSES (10 endpoints)
// ============================================

// 1.1 ADD LOCAL BUSINESS
// POST /api/discovery/businesses
router.post('/businesses', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const {
            name,
            category, // restaurant, shop, service, cafe, gym, etc.
            description,
            address,
            location_lat,
            location_long,
            phone,
            website,
            opening_hours, // JSON object
            photos
        } = req.body;

        // Validation
        if (!name || !category || !address) {
            return res.status(400).json({ 
                success: false, 
                error: 'Name, category, and address are required' 
            });
        }

        const { data: business, error } = await supabase
            .from('local_businesses')
            .insert([{
                name,
                category,
                description,
                address,
                location_lat,
                location_long,
                phone,
                website,
                opening_hours,
                photos,
                owner_user_id: userId
            }])
            .select()
            .single();

        if (error) {
            console.error('Add business error:', error);
            return res.status(500).json({ success: false, error: 'Failed to add business' });
        }

        res.status(201).json({
            success: true,
            message: 'Business added successfully',
            data: business
        });

    } catch (error) {
        console.error('Add business error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.2 GET NEARBY BUSINESSES
// GET /api/discovery/businesses/nearby?lat=3.139&lng=101.6869&radius=5&category=restaurant
router.get('/businesses/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 5, category, limit = 20 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ 
                success: false, 
                error: 'Latitude and longitude required' 
            });
        }

        let query = supabase
            .from('local_businesses')
            .select('*')
            .not('location_lat', 'is', null)
            .not('location_long', 'is', null)
            .limit(100); // Get more initially for distance filtering

        if (category) {
            query = query.eq('category', category);
        }

        const { data: businesses, error } = await query;

        if (error) {
            console.error('Get businesses error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch businesses' });
        }

        // Filter by distance
        const nearby = filterByDistance(businesses, lat, lng, parseFloat(radius));
        
        // Sort by distance and limit
        const sorted = nearby.sort((a, b) => a.distance_km - b.distance_km).slice(0, limit);

        res.json({
            success: true,
            data: sorted,
            count: sorted.length,
            search_radius_km: parseFloat(radius)
        });

    } catch (error) {
        console.error('Get nearby businesses error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.3 GET BUSINESS DETAILS
// GET /api/discovery/businesses/:id
router.get('/businesses/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: business, error } = await supabase
            .from('local_businesses')
            .select(`
                *,
                owner:users(id, username, avatar_url)
            `)
            .eq('id', id)
            .single();

        if (error || !business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }

        res.json({
            success: true,
            data: business
        });

    } catch (error) {
        console.error('Get business details error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.4 UPDATE BUSINESS
// PUT /api/discovery/businesses/:id
router.put('/businesses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if user is owner
        const { data: business } = await supabase
            .from('local_businesses')
            .select('owner_user_id')
            .eq('id', id)
            .single();

        if (!business || business.owner_user_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only business owner can update' 
            });
        }

        const updates = req.body;
        delete updates.id;
        delete updates.owner_user_id;

        const { data: updated, error } = await supabase
            .from('local_businesses')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Update business error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update business' });
        }

        res.json({
            success: true,
            message: 'Business updated successfully',
            data: updated
        });

    } catch (error) {
        console.error('Update business error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.5 DELETE BUSINESS
// DELETE /api/discovery/businesses/:id
router.delete('/businesses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if user is owner
        const { data: business } = await supabase
            .from('local_businesses')
            .select('owner_user_id')
            .eq('id', id)
            .single();

        if (!business || business.owner_user_id !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only business owner can delete' 
            });
        }

        const { error } = await supabase
            .from('local_businesses')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete business error:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete business' });
        }

        res.json({
            success: true,
            message: 'Business deleted successfully'
        });

    } catch (error) {
        console.error('Delete business error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 1.6 GET BUSINESS CATEGORIES
// GET /api/discovery/businesses/categories/list
router.get('/businesses/categories/list', (req, res) => {
    const categories = [
        { value: 'restaurant', label: 'Restaurants', icon: '🍽️' },
        { value: 'cafe', label: 'Cafes', icon: '☕' },
        { value: 'shop', label: 'Shops', icon: '🛍️' },
        { value: 'gym', label: 'Gyms', icon: '🏋️' },
        { value: 'salon', label: 'Salons & Spas', icon: '💇' },
        { value: 'clinic', label: 'Clinics', icon: '🏥' },
        { value: 'garage', label: 'Auto Services', icon: '🔧' },
        { value: 'market', label: 'Markets', icon: '🏪' },
        { value: 'entertainment', label: 'Entertainment', icon: '🎬' },
        { value: 'education', label: 'Education', icon: '📚' },
        { value: 'other', label: 'Other', icon: '📍' }
    ];

    res.json({
        success: true,
        data: categories
    });
});

// 1.7 SEARCH BUSINESSES
// GET /api/discovery/businesses/search?q=coffee&lat=3.139&lng=101.6869
router.get('/businesses/search', async (req, res) => {
    try {
        const { q, lat, lng, radius = 10, category } = req.query;

        if (!q) {
            return res.status(400).json({ success: false, error: 'Search query required' });
        }

        let query = supabase
            .from('local_businesses')
            .select('*')
            .or(`name.ilike.%${q}%,description.ilike.%${q}%`);

        if (category) {
            query = query.eq('category', category);
        }

        const { data: businesses, error } = await query;

        if (error) {
            console.error('Search businesses error:', error);
            return res.status(500).json({ success: false, error: 'Failed to search businesses' });
        }

        let results = businesses;

        // If location provided, filter by distance
        if (lat && lng) {
            results = filterByDistance(businesses, lat, lng, parseFloat(radius));
            results.sort((a, b) => a.distance_km - b.distance_km);
        }

        res.json({
            success: true,
            data: results,
            count: results.length
        });

    } catch (error) {
        console.error('Search businesses error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============================================
// SECTION 2: LOCAL EVENTS (8 endpoints)
// ============================================

// 2.1 CREATE EVENT
// POST /api/discovery/events
router.post('/events', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const {
            title,
            description,
            event_type, // concert, workshop, market, sports, etc.
            organizer,
            location,
            location_lat,
            location_long,
            start_time,
            end_time,
            is_free,
            ticket_price,
            ticket_url,
            photos
        } = req.body;

        // Validation
        if (!title || !location || !start_time) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title, location, and start time are required' 
            });
        }

        const { data: event, error } = await supabase
            .from('local_events')
            .insert([{
                title,
                description,
                event_type,
                organizer,
                location,
                location_lat,
                location_long,
                start_time,
                end_time,
                is_free: is_free !== false,
                ticket_price,
                ticket_url,
                photos,
                created_by: userId
            }])
            .select()
            .single();

        if (error) {
            console.error('Create event error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create event' });
        }

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            data: event
        });

    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.2 GET NEARBY EVENTS
// GET /api/discovery/events/nearby?lat=3.139&lng=101.6869&radius=10
router.get('/events/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 10, upcoming = 'true', limit = 20 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ 
                success: false, 
                error: 'Latitude and longitude required' 
            });
        }

        let query = supabase
            .from('local_events')
            .select('*')
            .not('location_lat', 'is', null)
            .not('location_long', 'is', null)
            .order('start_time', { ascending: true })
            .limit(100);

        if (upcoming === 'true') {
            query = query.gte('start_time', new Date().toISOString());
        }

        const { data: events, error } = await query;

        if (error) {
            console.error('Get events error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch events' });
        }

        // Filter by distance
        const nearby = filterByDistance(events, lat, lng, parseFloat(radius));
        const sorted = nearby.sort((a, b) => a.distance_km - b.distance_km).slice(0, limit);

        res.json({
            success: true,
            data: sorted,
            count: sorted.length
        });

    } catch (error) {
        console.error('Get nearby events error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.3 GET EVENT DETAILS
// GET /api/discovery/events/:id
router.get('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: event, error } = await supabase
            .from('local_events')
            .select(`
                *,
                creator:users(id, username, avatar_url)
            `)
            .eq('id', id)
            .single();

        if (error || !event) {
            return res.status(404).json({ success: false, error: 'Event not found' });
        }

        res.json({
            success: true,
            data: event
        });

    } catch (error) {
        console.error('Get event details error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.4 UPDATE EVENT
// PUT /api/discovery/events/:id
router.put('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if user is creator
        const { data: event } = await supabase
            .from('local_events')
            .select('created_by')
            .eq('id', id)
            .single();

        if (!event || event.created_by !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only event creator can update' 
            });
        }

        const updates = req.body;
        delete updates.id;
        delete updates.created_by;

        const { data: updated, error } = await supabase
            .from('local_events')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Update event error:', error);
            return res.status(500).json({ success: false, error: 'Failed to update event' });
        }

        res.json({
            success: true,
            message: 'Event updated successfully',
            data: updated
        });

    } catch (error) {
        console.error('Update event error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.5 DELETE EVENT
// DELETE /api/discovery/events/:id
router.delete('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Check if user is creator
        const { data: event } = await supabase
            .from('local_events')
            .select('created_by')
            .eq('id', id)
            .single();

        if (!event || event.created_by !== userId) {
            return res.status(403).json({ 
                success: false, 
                error: 'Only event creator can delete' 
            });
        }

        const { error } = await supabase
            .from('local_events')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete event error:', error);
            return res.status(500).json({ success: false, error: 'Failed to delete event' });
        }

        res.json({
            success: true,
            message: 'Event deleted successfully'
        });

    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2.6 GET EVENT TYPES
// GET /api/discovery/events/types/list
router.get('/events/types/list', (req, res) => {
    const types = [
        { value: 'concert', label: 'Concerts', icon: '🎵' },
        { value: 'workshop', label: 'Workshops', icon: '🎓' },
        { value: 'market', label: 'Markets', icon: '🏪' },
        { value: 'sports', label: 'Sports', icon: '⚽' },
        { value: 'meetup', label: 'Meetups', icon: '👥' },
        { value: 'festival', label: 'Festivals', icon: '🎉' },
        { value: 'exhibition', label: 'Exhibitions', icon: '🖼️' },
        { value: 'conference', label: 'Conferences', icon: '💼' },
        { value: 'charity', label: 'Charity Events', icon: '❤️' },
        { value: 'food', label: 'Food Events', icon: '🍔' },
        { value: 'other', label: 'Other', icon: '📅' }
    ];

    res.json({
        success: true,
        data: types
    });
});

// ============================================
// SECTION 3: LOCAL NEWS (8 endpoints)
// ============================================

// 3.1 POST LOCAL NEWS
// POST /api/discovery/news
router.post('/news', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const {
            title,
            content,
            summary,
            news_type, // traffic, weather, announcement, alert, incident
            location,
            location_lat,
            location_long,
            radius_km, // Relevant within X km
            expires_at
        } = req.body;

        // Validation
        if (!title || !content || !location) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title, content, and location are required' 
            });
        }

        const { data: news, error } = await supabase
            .from('local_news')
            .insert([{
                title,
                content,
                summary,
                source: userId, // Using user ID as source
                news_type,
                location,
                location_lat,
                location_long,
                radius_km: radius_km || 10,
                expires_at
            }])
            .select()
            .single();

        if (error) {
            console.error('Create news error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create news' });
        }

        res.status(201).json({
            success: true,
            message: 'News posted successfully',
            data: news
        });

    } catch (error) {
        console.error('Create news error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 3.2 GET LOCAL NEWS FEED
// GET /api/discovery/news/feed?lat=3.139&lng=101.6869&radius=10
router.get('/news/feed', async (req, res) => {
    try {
        const { lat, lng, radius = 10, news_type, limit = 20 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ 
                success: false, 
                error: 'Latitude and longitude required' 
            });
        }

        let query = supabase
            .from('local_news')
            .select('*')
            .not('location_lat', 'is', null)
            .not('location_long', 'is', null)
            .order('created_at', { ascending: false })
            .limit(100);

        // Filter out expired news
        query = query.or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`);

        if (news_type) {
            query = query.eq('news_type', news_type);
        }

        const { data: news, error } = await query;

        if (error) {
            console.error('Get news error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch news' });
        }

        // Filter by distance
        const nearby = filterByDistance(news, lat, lng, parseFloat(radius));
        const sorted = nearby.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);

        res.json({
            success: true,
            data: sorted,
            count: sorted.length
        });

    } catch (error) {
        console.error('Get news feed error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 3.3 GET NEWS TYPES
// GET /api/discovery/news/types/list
router.get('/news/types/list', (req, res) => {
    const types = [
        { value: 'traffic', label: 'Traffic Updates', icon: '🚦' },
        { value: 'weather', label: 'Weather Alerts', icon: '🌧️' },
        { value: 'announcement', label: 'Announcements', icon: '📢' },
        { value: 'alert', label: 'Emergency Alerts', icon: '🚨' },
        { value: 'incident', label: 'Incidents', icon: '⚠️' },
        { value: 'construction', label: 'Construction', icon: '🚧' },
        { value: 'community', label: 'Community News', icon: '🏘️' },
        { value: 'business', label: 'Business News', icon: '💼' },
        { value: 'other', label: 'Other', icon: '📰' }
    ];

    res.json({
        success: true,
        data: types
    });
});

// ============================================
// SECTION 4: DISCOVERY FEED (6 endpoints)
// ============================================

// 4.1 GET PERSONALIZED DISCOVERY FEED
// GET /api/discovery/feed?lat=3.139&lng=101.6869&radius=10
router.get('/feed', async (req, res) => {
    try {
        const { lat, lng, radius = 10 } = req.query;
        const userId = req.user?.id;

        if (!lat || !lng) {
            return res.status(400).json({ 
                success: false, 
                error: 'Latitude and longitude required' 
            });
        }

        const radiusNum = parseFloat(radius);

        // Get all local content
        const [businessesRes, eventsRes, newsRes] = await Promise.all([
            supabase
                .from('local_businesses')
                .select('*')
                .not('location_lat', 'is', null)
                .limit(50),
            supabase
                .from('local_events')
                .select('*')
                .not('location_lat', 'is', null)
                .gte('start_time', new Date().toISOString())
                .limit(50),
            supabase
                .from('local_news')
                .select('*')
                .not('location_lat', 'is', null)
                .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
                .limit(50)
        ]);

        // Filter by distance
        const nearbyBusinesses = filterByDistance(businessesRes.data || [], lat, lng, radiusNum)
            .map(item => ({ ...item, content_type: 'business' }));
        
        const nearbyEvents = filterByDistance(eventsRes.data || [], lat, lng, radiusNum)
            .map(item => ({ ...item, content_type: 'event' }));
        
        const nearbyNews = filterByDistance(newsRes.data || [], lat, lng, radiusNum)
            .map(item => ({ ...item, content_type: 'news' }));

        // Combine and mix
        const feed = [
            ...nearbyNews.slice(0, 5), // Top news first
            ...nearbyEvents.slice(0, 5), // Then events
            ...nearbyBusinesses.slice(0, 10), // Then businesses
            ...nearbyNews.slice(5, 10),
            ...nearbyEvents.slice(5, 10),
            ...nearbyBusinesses.slice(10, 20)
        ];

        res.json({
            success: true,
            data: feed,
            count: feed.length,
            breakdown: {
                businesses: nearbyBusinesses.length,
                events: nearbyEvents.length,
                news: nearbyNews.length
            }
        });

    } catch (error) {
        console.error('Get discovery feed error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 4.2 GET TRENDING LOCALLY
// GET /api/discovery/trending?lat=3.139&lng=101.6869
router.get('/trending', async (req, res) => {
    try {
        const { lat, lng, radius = 10 } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ 
                success: false, 
                error: 'Latitude and longitude required' 
            });
        }

        // Get discovery posts (user-generated local content)
        const { data: posts, error } = await supabase
            .from('discovery_posts')
            .select(`
                *,
                author:users(id, username, avatar_url)
            `)
            .not('location_lat', 'is', null)
            .order('upvotes', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Get trending error:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch trending' });
        }

        // Filter by distance
        const nearby = filterByDistance(posts || [], lat, lng, parseFloat(radius));
        const trending = nearby.slice(0, 10);

        res.json({
            success: true,
            data: trending
        });

    } catch (error) {
        console.error('Get trending error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 4.3 POST DISCOVERY CONTENT
// POST /api/discovery/posts
router.post('/posts', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        const {
            post_type, // local_news, local_event, recommendation
            title,
            content,
            location,
            location_lat,
            location_long,
            media_urls,
            tags
        } = req.body;

        if (!title || !content) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title and content are required' 
            });
        }

        const { data: post, error } = await supabase
            .from('discovery_posts')
            .insert([{
                user_id: userId,
                post_type,
                title,
                content,
                location,
                location_lat,
                location_long,
                media_urls,
                tags
            }])
            .select()
            .single();

        if (error) {
            console.error('Create discovery post error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create post' });
        }

        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            data: post
        });

    } catch (error) {
        console.error('Create discovery post error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 4.4 UPVOTE DISCOVERY POST
// POST /api/discovery/posts/:id/upvote
router.post('/posts/:id/upvote', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: post, error } = await supabase
            .from('discovery_posts')
            .update({ upvotes: supabase.raw('upvotes + 1') })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Upvote error:', error);
            return res.status(500).json({ success: false, error: 'Failed to upvote' });
        }

        res.json({
            success: true,
            data: post
        });

    } catch (error) {
        console.error('Upvote error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 4.5 SEARCH NEARBY
// GET /api/discovery/search?q=coffee&lat=3.139&lng=101.6869&type=all
router.get('/search', async (req, res) => {
    try {
        const { q, lat, lng, radius = 10, type = 'all' } = req.query;

        if (!q) {
            return res.status(400).json({ success: false, error: 'Search query required' });
        }

        if (!lat || !lng) {
            return res.status(400).json({ 
                success: false, 
                error: 'Latitude and longitude required' 
            });
        }

        const results = {
            businesses: [],
            events: [],
            news: [],
            posts: []
        };

        // Search businesses
        if (type === 'all' || type === 'businesses') {
            const { data } = await supabase
                .from('local_businesses')
                .select('*')
                .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
                .limit(20);
            
            if (data) {
                results.businesses = filterByDistance(data, lat, lng, parseFloat(radius));
            }
        }

        // Search events
        if (type === 'all' || type === 'events') {
            const { data } = await supabase
                .from('local_events')
                .select('*')
                .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
                .limit(20);
            
            if (data) {
                results.events = filterByDistance(data, lat, lng, parseFloat(radius));
            }
        }

        // Search news
        if (type === 'all' || type === 'news') {
            const { data } = await supabase
                .from('local_news')
                .select('*')
                .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
                .limit(20);
            
            if (data) {
                results.news = filterByDistance(data, lat, lng, parseFloat(radius));
            }
        }

        // Search posts
        if (type === 'all' || type === 'posts') {
            const { data } = await supabase
                .from('discovery_posts')
                .select('*')
                .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
                .limit(20);
            
            if (data) {
                results.posts = filterByDistance(data, lat, lng, parseFloat(radius));
            }
        }

        const totalCount = 
            results.businesses.length + 
            results.events.length + 
            results.news.length + 
            results.posts.length;

        res.json({
            success: true,
            data: results,
            count: totalCount
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ============================================
// HEALTH CHECK
// ============================================

router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'Discovery System',
        status: 'running',
        features: [
            'Local Businesses',
            'Local Events',
            'Local News',
            'Discovery Feed',
            'Trending Locally',
            'Location-based Search'
        ]
    });
});

module.exports = router;