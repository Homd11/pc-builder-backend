const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

function createUserClient(accessToken) {
    if (!supabaseUrl || !supabaseKey) return null;

    return createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: {
                Authorization: 'Bearer ' + accessToken,
            },
        },
    });
}

module.exports = { createUserClient };
