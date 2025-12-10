// routes/media.js
// Media Upload API - Photos, Videos, Profile Pictures

const express = require('express');
const router = express.Router();
const cloudinary = require('../config/cloudinary');
const upload = require('../middleware/upload');
const supabase = require('../config/database');
const streamifier = require('streamifier');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Upload buffer to Cloudinary
 */
const uploadToCloudinary = (buffer, folder, resourceType = 'auto') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: resourceType,
        transformation: resourceType === 'image' ? [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ] : undefined
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * Delete from Cloudinary
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    throw error;
  }
};

// ============================================
// UPLOAD PROFILE PICTURE
// ============================================

/**
 * POST /api/media/profile-picture
 * Upload user profile picture
 * 
 * Body:
 * - userId: string (required)
 * - file: image file (required)
 */
router.post('/profile-picture', upload.single('file'), async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    // Upload to Cloudinary
    const result = await uploadToCloudinary(
      req.file.buffer,
      `linkwavez/profile-pictures/${userId}`,
      'image'
    );
    
    // Update user profile in database
    const { data: updateData, error: updateError } = await supabase
      .from('users')
      .update({
        profile_picture_url: result.secure_url,
        cloudinary_public_id: result.public_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select();
    
    if (updateError) {
      throw updateError;
    }
    
    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format
      }
    });
    
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload profile picture'
    });
  }
});

// ============================================
// UPLOAD POST MEDIA (SINGLE OR MULTIPLE)
// ============================================

/**
 * POST /api/media/post-media
 * Upload media for posts (photos/videos)
 * Supports multiple files
 * 
 * Body:
 * - userId: string (required)
 * - postId: string (optional - if attaching to existing post)
 * - files: array of files (required)
 */
router.post('/post-media', upload.array('files', 10), async (req, res) => {
  try {
    const { userId, postId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }
    
    // Upload all files to Cloudinary
    const uploadPromises = req.files.map(file => {
      const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
      return uploadToCloudinary(
        file.buffer,
        `linkwavez/posts/${userId}`,
        resourceType
      );
    });
    
    const uploadResults = await Promise.all(uploadPromises);
    
    // Prepare media data for database
    const mediaData = uploadResults.map((result, index) => ({
      user_id: userId,
      post_id: postId || null,
      media_url: result.secure_url,
      cloudinary_public_id: result.public_id,
      media_type: result.resource_type,
      width: result.width,
      height: result.height,
      format: result.format,
      file_size: result.bytes,
      duration: result.duration || null, // For videos
      created_at: new Date().toISOString()
    }));
    
    // Save to database
    const { data: insertData, error: insertError } = await supabase
      .from('post_media')
      .insert(mediaData)
      .select();
    
    if (insertError) {
      throw insertError;
    }
    
    res.status(200).json({
      success: true,
      message: `${uploadResults.length} file(s) uploaded successfully`,
      data: {
        mediaCount: uploadResults.length,
        media: insertData
      }
    });
    
  } catch (error) {
    console.error('Post media upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload post media'
    });
  }
});

// ============================================
// GET USER'S MEDIA GALLERY
// ============================================

/**
 * GET /api/media/gallery/:userId
 * Get all media uploaded by a user
 */
router.get('/gallery/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, limit = 50, offset = 0 } = req.query;
    
    let query = supabase
      .from('post_media')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    // Filter by type if specified
    if (type && (type === 'image' || type === 'video')) {
      query = query.eq('media_type', type);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw error;
    }
    
    res.status(200).json({
      success: true,
      data: {
        media: data,
        count: data.length,
        hasMore: data.length === parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Get gallery error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch gallery'
    });
  }
});

// ============================================
// DELETE MEDIA
// ============================================

/**
 * DELETE /api/media/:mediaId
 * Delete a media file
 */
router.delete('/:mediaId', async (req, res) => {
  try {
    const { mediaId } = req.params;
    const { userId } = req.body; // For security - verify ownership
    
    // Get media info from database
    const { data: mediaData, error: fetchError } = await supabase
      .from('post_media')
      .select('*')
      .eq('id', mediaId)
      .single();
    
    if (fetchError || !mediaData) {
      return res.status(404).json({
        success: false,
        error: 'Media not found'
      });
    }
    
    // Verify ownership
    if (mediaData.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own media'
      });
    }
    
    // Delete from Cloudinary
    await deleteFromCloudinary(
      mediaData.cloudinary_public_id,
      mediaData.media_type
    );
    
    // Delete from database
    const { error: deleteError } = await supabase
      .from('post_media')
      .delete()
      .eq('id', mediaId);
    
    if (deleteError) {
      throw deleteError;
    }
    
    res.status(200).json({
      success: true,
      message: 'Media deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete media'
    });
  }
});

// ============================================
// GET MEDIA BY POST ID
// ============================================

/**
 * GET /api/media/post/:postId
 * Get all media for a specific post
 */
router.get('/post/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    
    const { data, error } = await supabase
      .from('post_media')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    
    if (error) {
      throw error;
    }
    
    res.status(200).json({
      success: true,
      data: {
        media: data,
        count: data.length
      }
    });
    
  } catch (error) {
    console.error('Get post media error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch post media'
    });
  }
});

// ============================================
// UPLOAD THUMBNAIL (for videos)
// ============================================

/**
 * POST /api/media/thumbnail
 * Upload custom thumbnail for video
 * 
 * Body:
 * - mediaId: string (required)
 * - file: image file (required)
 */
router.post('/thumbnail', upload.single('file'), async (req, res) => {
  try {
    const { mediaId } = req.body;
    
    if (!mediaId) {
      return res.status(400).json({
        success: false,
        error: 'Media ID is required'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    // Upload thumbnail to Cloudinary
    const result = await uploadToCloudinary(
      req.file.buffer,
      'linkwavez/thumbnails',
      'image'
    );
    
    // Update media record with thumbnail
    const { data: updateData, error: updateError } = await supabase
      .from('post_media')
      .update({
        thumbnail_url: result.secure_url,
        thumbnail_public_id: result.public_id
      })
      .eq('id', mediaId)
      .select();
    
    if (updateError) {
      throw updateError;
    }
    
    res.status(200).json({
      success: true,
      message: 'Thumbnail uploaded successfully',
      data: {
        thumbnailUrl: result.secure_url
      }
    });
    
  } catch (error) {
    console.error('Thumbnail upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload thumbnail'
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Media upload service is running',
    cloudinary: {
      configured: !!process.env.CLOUDINARY_CLOUD_NAME
    }
  });
});

module.exports = router;