
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './frontend/.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('event_category')
    .select('id_event_category, name_event_category')
    .order('id_event_category', { ascending: true });

  if (error) {
    console.error('Error fetching categories:', error);
    return;
  }

  console.log('Categories:');
  console.log(JSON.stringify(data, null, 2));
}

run();
