const { createClient } = require('@supabase/supabase-js');

// You'll need to set these environment variables or replace with your actual values
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupAuthMetadata() {
  try {
    console.log('🧹 Cleaning up auth.users metadata provider information...');

    // Get all users
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    console.log(`📊 Found ${users.users.length} users`);

    for (const user of users.users) {
      console.log(`\n🔍 Processing user: ${user.email} (${user.id})`);
      
      let needsUpdate = false;
      const newUserMetadata = { ...user.user_metadata };
      const newAppMetadata = { ...user.app_metadata };

      // Remove provider-related fields from user_metadata
      if (newUserMetadata.provider) {
        console.log(`  🗑️  Removing provider from user_metadata: ${newUserMetadata.provider}`);
        delete newUserMetadata.provider;
        needsUpdate = true;
      }

      if (newUserMetadata.provider_id) {
        console.log(`  🗑️  Removing provider_id from user_metadata: ${newUserMetadata.provider_id}`);
        delete newUserMetadata.provider_id;
        needsUpdate = true;
      }

      if (newUserMetadata.google_linked) {
        console.log(`  🗑️  Removing google_linked from user_metadata`);
        delete newUserMetadata.google_linked;
        needsUpdate = true;
      }

      if (newUserMetadata.linked_at) {
        console.log(`  🗑️  Removing linked_at from user_metadata`);
        delete newUserMetadata.linked_at;
        needsUpdate = true;
      }

      // Remove provider-related fields from app_metadata
      if (newAppMetadata.provider) {
        console.log(`  🗑️  Removing provider from app_metadata: ${newAppMetadata.provider}`);
        delete newAppMetadata.provider;
        needsUpdate = true;
      }

      if (newAppMetadata.providers) {
        console.log(`  🗑️  Removing providers from app_metadata: ${newAppMetadata.providers.join(', ')}`);
        delete newAppMetadata.providers;
        needsUpdate = true;
      }

      if (needsUpdate) {
        console.log(`  🔄 Updating user metadata...`);
        
        const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: newUserMetadata,
          app_metadata: newAppMetadata,
        });

        if (updateError) {
          console.error(`  ❌ Error updating user ${user.email}:`, updateError);
        } else {
          console.log(`  ✅ Successfully cleaned up metadata for ${user.email}`);
        }
      } else {
        console.log(`  ✅ No cleanup needed for ${user.email}`);
      }
    }

    console.log('\n✅ Auth metadata cleanup completed!');
    console.log('📝 Note: Provider information is now stored in user_profiles table only');

  } catch (error) {
    console.error('💥 Error cleaning up auth metadata:', error);
  }
}

cleanupAuthMetadata(); 