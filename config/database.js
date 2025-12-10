// config/database.js
// Centralized Supabase Configuration

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Validate environment variables
if (!process.env.SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL in .env file');
}

if (!process.env.SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_KEY in .env file');
}

// Create and export Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

console.log('✅ Supabase connected successfully!');

module.exports = supabase;