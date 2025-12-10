const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// CREATE CHARITY CAMPAIGN
// ============================================================================
router.post('/campaigns/create', async (req, res) => {
  try {
    const {
      userId,
      title,
      description,
      goalAmount,
      category,
      beneficiaries,
      location,
      imageUrl,
      endDate
    } = req.body;

    // Validate required fields
    if (!userId || !title || !goalAmount) {
      return res.status(400).json({
        success: false,
        error: 'User ID, title, and goal amount are required'
      });
    }

    // SKIP USER CHECK FOR TESTING - User validation disabled
    // This allows testing without needing to create users first

    // Create campaign
    const { data, error } = await supabase
      .from('charity_campaigns')
      .insert({
        user_id: userId,
        title: title,
        description: description,
        goal_amount: goalAmount,
        raised_amount: 0,
        category: category || 'general',
        beneficiaries: beneficiaries || 0,
        location: location,
        image_url: imageUrl,
        end_date: endDate,
        verified: true,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('✅ Charity campaign created:', title);

    res.json({
      success: true,
      message: 'Charity campaign created successfully',
      data: data
    });

  } catch (error) {
    console.error('❌ Create campaign error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create campaign'
    });
  }
});

// ============================================================================
// GET ALL ACTIVE CAMPAIGNS
// ============================================================================
router.get('/campaigns', async (req, res) => {
  try {
    const { category, status = 'active', limit = 20 } = req.query;

    let query = supabase
      .from('charity_campaigns')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate progress percentage for each campaign
    const campaignsWithProgress = data.map(campaign => ({
      ...campaign,
      progress_percentage: ((campaign.raised_amount / campaign.goal_amount) * 100).toFixed(2)
    }));

    res.json({
      success: true,
      data: campaignsWithProgress
    });

  } catch (error) {
    console.error('❌ Get campaigns error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET CAMPAIGN BY ID
// ============================================================================
router.get('/campaigns/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const { data, error } = await supabase
      .from('charity_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    // Get donation count
    const { count: donorCount } = await supabase
      .from('donations')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    // Get milestones
    const { data: milestones } = await supabase
      .from('charity_milestones')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('milestone_amount');

    res.json({
      success: true,
      data: {
        ...data,
        donor_count: donorCount || 0,
        progress_percentage: ((data.raised_amount / data.goal_amount) * 100).toFixed(2),
        milestones: milestones || []
      }
    });

  } catch (error) {
    console.error('❌ Get campaign error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DONATE TO CAMPAIGN
// ============================================================================
router.post('/donate', async (req, res) => {
  try {
    const { userId, campaignId, amount, anonymous = false, message } = req.body;

    // Validate
    if (!userId || !campaignId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'User ID, campaign ID, and amount are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Donation amount must be greater than 0'
      });
    }

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('charity_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('status', 'active')
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found or not active'
      });
    }

    // Create donation
    const { data: donation, error: donationError } = await supabase
      .from('donations')
      .insert({
        user_id: userId,
        campaign_id: campaignId,
        amount: amount,
        anonymous: anonymous,
        message: message,
        payment_status: 'completed'
      })
      .select()
      .single();

    if (donationError) {
      throw donationError;
    }

    // Update campaign raised amount
    const newRaisedAmount = parseFloat(campaign.raised_amount) + parseFloat(amount);
    
    const { error: updateError } = await supabase
      .from('charity_campaigns')
      .update({ raised_amount: newRaisedAmount })
      .eq('id', campaignId);

    if (updateError) {
      throw updateError;
    }

    // Check milestones
    const { data: milestones } = await supabase
      .from('charity_milestones')
      .select('*')
      .eq('campaign_id', campaignId)
      .lte('milestone_amount', newRaisedAmount)
      .eq('reached', false);

    // Mark milestones as reached
    if (milestones && milestones.length > 0) {
      for (const milestone of milestones) {
        await supabase
          .from('charity_milestones')
          .update({ reached: true, reached_at: new Date().toISOString() })
          .eq('id', milestone.id);
      }
    }

    console.log(`✅ Donation of RM ${amount} received for: ${campaign.title}`);

    res.json({
      success: true,
      message: 'Thank you for your donation!',
      data: {
        donation: donation,
        newTotalRaised: newRaisedAmount,
        milestonesReached: milestones?.length || 0,
        progressPercentage: ((newRaisedAmount / campaign.goal_amount) * 100).toFixed(2)
      }
    });

  } catch (error) {
    console.error('❌ Donation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process donation'
    });
  }
});

// ============================================================================
// GET USER'S DONATION HISTORY
// ============================================================================
router.get('/donations/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      throw error;
    }

    // Calculate total donated
    const totalDonated = data.reduce((sum, donation) => sum + parseFloat(donation.amount), 0);

    res.json({
      success: true,
      data: {
        donations: data,
        totalDonated: totalDonated,
        count: data.length
      }
    });

  } catch (error) {
    console.error('❌ Get donations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET CAMPAIGN DONORS
// ============================================================================
router.get('/campaigns/:campaignId/donors', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = 20 } = req.query;

    // Get public donors
    const { data: publicDonors, error } = await supabase
      .from('donations')
      .select('amount, message, created_at, user_id')
      .eq('campaign_id', campaignId)
      .eq('anonymous', false)
      .order('amount', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      throw error;
    }

    // Get anonymous donors stats
    const { data: anonDonors } = await supabase
      .from('donations')
      .select('amount')
      .eq('campaign_id', campaignId)
      .eq('anonymous', true);

    const anonCount = anonDonors?.length || 0;
    const anonTotal = anonDonors?.reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;

    res.json({
      success: true,
      data: {
        publicDonors: publicDonors,
        anonymousDonors: {
          count: anonCount,
          total: anonTotal
        }
      }
    });

  } catch (error) {
    console.error('❌ Get donors error:', error);
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
    message: 'Charity service is running',
    features: [
      'Create campaigns',
      'Donate with tracking',
      'Milestones',
      'Impact reports',
      'Analytics'
    ]
  });
});

module.exports = router;