import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDiscordIntegration() {
  try {
    console.log('🔍 Deleting corrupted Discord integration...');

    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('id', '8910ebbc-ca8a-436f-a8cb-ba5a603a1d69')
      .eq('provider', 'discord');

    if (error) {
      console.error('❌ Error deleting integration:', error);
      process.exit(1);
    }

    console.log('✅ Successfully deleted corrupted Discord integration!');
    console.log('📋 Next steps:');
    console.log('1. Go to your Integrations page');
    console.log('2. Click "Connect" on Discord');
    console.log('3. Authorize all permissions including "View your Discord servers"');
    console.log('4. Try opening the Discord trigger config again');

  } catch (error) {
    console.error('❌ Failed:', error);
    process.exit(1);
  }
}

fixDiscordIntegration();
