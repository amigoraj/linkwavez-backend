const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================================================
// VENDOR MANAGEMENT
// ============================================================================

// Register as Vendor
router.post('/vendors/register', async (req, res) => {
  try {
    const {
      userId,
      businessName,
      businessType,
      description,
      category,
      address,
      phone,
      email,
      logoUrl,
      coverImageUrl,
      operatingHours
    } = req.body;

    if (!userId || !businessName || !businessType || !category) {
      return res.status(400).json({
        success: false,
        error: 'User ID, business name, business type, and category are required'
      });
    }

    // Check if user already has a vendor account
    const { data: existing } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'User already has a vendor account'
      });
    }

    const { data: vendor, error } = await supabase
      .from('vendors')
      .insert({
        user_id: userId,
        business_name: businessName,
        business_type: businessType,
        description: description,
        category: category,
        address: address,
        phone: phone,
        email: email,
        logo_url: logoUrl,
        cover_image_url: coverImageUrl,
        operating_hours: operatingHours,
        status: 'pending_approval',
        rating: 0,
        total_reviews: 0
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Vendor registered: ${businessName}`);

    res.json({
      success: true,
      message: 'Vendor registration submitted for approval',
      data: vendor
    });

  } catch (error) {
    console.error('❌ Register vendor error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get Vendor Details
router.get('/vendors/:vendorId', async (req, res) => {
  try {
    const { vendorId } = req.params;

    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (error || !vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found'
      });
    }

    res.json({
      success: true,
      data: vendor
    });

  } catch (error) {
    console.error('❌ Get vendor error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Search Vendors
router.get('/vendors/search', async (req, res) => {
  try {
    const { category, businessType, query, limit = 20, offset = 0 } = req.query;

    let dbQuery = supabase
      .from('vendors')
      .select('*')
      .eq('status', 'active')
      .order('rating', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }

    if (businessType) {
      dbQuery = dbQuery.eq('business_type', businessType);
    }

    if (query) {
      dbQuery = dbQuery.or(`business_name.ilike.%${query}%,description.ilike.%${query}%`);
    }

    const { data, error } = await dbQuery;

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Search vendors error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SERVICE BOOKING
// ============================================================================

// Create Service
router.post('/services/create', async (req, res) => {
  try {
    const {
      vendorId,
      name,
      description,
      category,
      duration,
      price,
      imageUrl
    } = req.body;

    if (!vendorId || !name || !price) {
      return res.status(400).json({
        success: false,
        error: 'Vendor ID, name, and price are required'
      });
    }

    const { data: service, error } = await supabase
      .from('services')
      .insert({
        vendor_id: vendorId,
        name: name,
        description: description,
        category: category,
        duration_minutes: duration,
        price: price,
        image_url: imageUrl,
        is_available: true
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Service created: ${name}`);

    res.json({
      success: true,
      message: 'Service created successfully',
      data: service
    });

  } catch (error) {
    console.error('❌ Create service error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get Vendor Services
router.get('/vendors/:vendorId/services', async (req, res) => {
  try {
    const { vendorId } = req.params;

    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('is_available', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get services error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Book Service
router.post('/bookings/create', async (req, res) => {
  try {
    const {
      userId,
      vendorId,
      serviceId,
      bookingDate,
      bookingTime,
      notes
    } = req.body;

    if (!userId || !vendorId || !serviceId || !bookingDate || !bookingTime) {
      return res.status(400).json({
        success: false,
        error: 'All booking details are required'
      });
    }

    // Get service details
    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    const { data: booking, error } = await supabase
      .from('service_bookings')
      .insert({
        user_id: userId,
        vendor_id: vendorId,
        service_id: serviceId,
        booking_date: bookingDate,
        booking_time: bookingTime,
        total_amount: service.price,
        notes: notes,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`📅 Booking created: ${bookingDate} ${bookingTime}`);

    res.json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });

  } catch (error) {
    console.error('❌ Create booking error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get User Bookings
router.get('/bookings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, limit = 20 } = req.query;

    let query = supabase
      .from('service_bookings')
      .select('*')
      .eq('user_id', userId)
      .order('booking_date', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get bookings error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update Booking Status
router.put('/bookings/:bookingId/status', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const { data, error } = await supabase
      .from('service_bookings')
      .update({ status: status })
      .eq('id', bookingId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Booking ${bookingId} status updated to: ${status}`);

    res.json({
      success: true,
      message: 'Booking status updated',
      data: data
    });

  } catch (error) {
    console.error('❌ Update booking status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// FOOD ORDERING
// ============================================================================

// Create Menu Item
router.post('/food/menu/create', async (req, res) => {
  try {
    const {
      vendorId,
      name,
      description,
      category,
      price,
      imageUrl,
      preparationTime,
      isVegetarian,
      isSpicy
    } = req.body;

    if (!vendorId || !name || !price) {
      return res.status(400).json({
        success: false,
        error: 'Vendor ID, name, and price are required'
      });
    }

    const { data: menuItem, error } = await supabase
      .from('menu_items')
      .insert({
        vendor_id: vendorId,
        name: name,
        description: description,
        category: category,
        price: price,
        image_url: imageUrl,
        preparation_time_minutes: preparationTime,
        is_vegetarian: isVegetarian || false,
        is_spicy: isSpicy || false,
        is_available: true
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`🍔 Menu item created: ${name}`);

    res.json({
      success: true,
      message: 'Menu item created successfully',
      data: menuItem
    });

  } catch (error) {
    console.error('❌ Create menu item error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get Vendor Menu
router.get('/food/vendors/:vendorId/menu', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { category } = req.query;

    let query = supabase
      .from('menu_items')
      .select('*')
      .eq('vendor_id', vendorId)
      .eq('is_available', true)
      .order('category', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get menu error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Place Food Order
router.post('/food/orders/create', async (req, res) => {
  try {
    const {
      userId,
      vendorId,
      items, // Array of {menuItemId, quantity, price}
      deliveryAddress,
      deliveryInstructions,
      paymentMethod
    } = req.body;

    if (!userId || !vendorId || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'User ID, vendor ID, and items are required'
      });
    }

    // Calculate total
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = 5.00; // Fixed delivery fee
    const total = subtotal + deliveryFee;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('food_orders')
      .insert({
        user_id: userId,
        vendor_id: vendorId,
        subtotal: subtotal,
        delivery_fee: deliveryFee,
        total_amount: total,
        delivery_address: deliveryAddress,
        delivery_instructions: deliveryInstructions,
        payment_method: paymentMethod || 'cash',
        status: 'pending'
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Create order items
    const orderItems = items.map(item => ({
      order_id: order.id,
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      price: item.price
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    console.log(`🍕 Food order created: RM ${total}`);

    res.json({
      success: true,
      message: 'Order placed successfully',
      data: {
        order: order,
        estimatedDelivery: '30-45 minutes'
      }
    });

  } catch (error) {
    console.error('❌ Create food order error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get User Food Orders
router.get('/food/orders/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, limit = 20 } = req.query;

    let query = supabase
      .from('food_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get food orders error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update Food Order Status
router.put('/food/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const { data, error } = await supabase
      .from('food_orders')
      .update({ status: status })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Order ${orderId} status: ${status}`);

    res.json({
      success: true,
      message: 'Order status updated',
      data: data
    });

  } catch (error) {
    console.error('❌ Update order status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// PRODUCT MARKETPLACE
// ============================================================================

// List Product
router.post('/products/create', async (req, res) => {
  try {
    const {
      sellerId,
      title,
      description,
      category,
      price,
      condition,
      images,
      quantity,
      location
    } = req.body;

    if (!sellerId || !title || !price) {
      return res.status(400).json({
        success: false,
        error: 'Seller ID, title, and price are required'
      });
    }

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        seller_id: sellerId,
        title: title,
        description: description,
        category: category,
        price: price,
        condition: condition || 'new',
        images: images || [],
        quantity: quantity || 1,
        location: location,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`📦 Product listed: ${title}`);

    res.json({
      success: true,
      message: 'Product listed successfully',
      data: product
    });

  } catch (error) {
    console.error('❌ Create product error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Search Products
router.get('/products/search', async (req, res) => {
  try {
    const { category, condition, minPrice, maxPrice, query, limit = 20, offset = 0 } = req.query;

    let dbQuery = supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }

    if (condition) {
      dbQuery = dbQuery.eq('condition', condition);
    }

    if (minPrice) {
      dbQuery = dbQuery.gte('price', parseFloat(minPrice));
    }

    if (maxPrice) {
      dbQuery = dbQuery.lte('price', parseFloat(maxPrice));
    }

    if (query) {
      dbQuery = dbQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
    }

    const { data, error } = await dbQuery;

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Search products error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get Product Details
router.get('/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error || !product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    console.error('❌ Get product error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// REVIEWS & RATINGS
// ============================================================================

// Add Review
router.post('/reviews/create', async (req, res) => {
  try {
    const {
      userId,
      vendorId,
      orderId,
      rating,
      comment,
      images
    } = req.body;

    if (!userId || !vendorId || !rating) {
      return res.status(400).json({
        success: false,
        error: 'User ID, vendor ID, and rating are required'
      });
    }

    const { data: review, error } = await supabase
      .from('reviews')
      .insert({
        user_id: userId,
        vendor_id: vendorId,
        order_id: orderId,
        rating: rating,
        comment: comment,
        images: images || []
      })
      .select()
      .single();

    if (error) throw error;

    // Update vendor rating
    await updateVendorRating(vendorId);

    console.log(`⭐ Review added: ${rating} stars`);

    res.json({
      success: true,
      message: 'Review added successfully',
      data: review
    });

  } catch (error) {
    console.error('❌ Add review error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get Vendor Reviews
router.get('/vendors/:vendorId/reviews', async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Get reviews error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function updateVendorRating(vendorId) {
  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating')
    .eq('vendor_id', vendorId);

  if (reviews && reviews.length > 0) {
    const avgRating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
    
    await supabase
      .from('vendors')
      .update({
        rating: parseFloat(avgRating),
        total_reviews: reviews.length
      })
      .eq('id', vendorId);
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Marketplace service is running',
    features: [
      'Service booking (Salons, Fitness, Healthcare)',
      'Food ordering (Restaurants, Cafes)',
      'Product marketplace (Buy/Sell)',
      'Vendor management',
      'Reviews & ratings',
      'Order tracking',
      'Payment integration ready'
    ]
  });
});

module.exports = router;