const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your_supabase_url_here') {
    logger.warn('⚠ Supabase credentials not configured — API will return empty results');
}

const supabase = (supabaseUrl && supabaseKey && supabaseUrl !== 'your_supabase_url_here')
    ? createClient(supabaseUrl, supabaseKey)
    : null;

module.exports = supabase;
