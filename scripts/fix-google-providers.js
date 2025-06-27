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

async function fixGoogleProviders() {
  try {
    console.log('🔍 Checking for Google users with incorrect provider...');

    // Get all users with Google identities
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    const googleUsers = users.users.filter(user => 
      user.identities && 
      user.identities.some(identity => identity.provider === 'google')
    );

    console.log(`📊 Found ${googleUsers.length} users with Google identities`);

    // Check their profiles
    for (const user of googleUsers) {
      console.log(`\n🔍 Checking user: ${user.email} (${user.id})`);
      
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('provider')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.log(`❌ No profile found for ${user.email}, creating one...`);
        
        // Create profile with Google provider
        const { error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name,
            avatar_url: user.user_metadata?.avatar_url,
            provider: 'google',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (createError) {
          console.error(`❌ Error creating profile for ${user.email}:`, createError);
        } else {
          console.log(`✅ Created profile for ${user.email} with provider: google`);
        }
      } else {
        console.log(`📋 Profile found for ${user.email}, current provider: ${profile.provider}`);
        
        if (profile.provider !== 'google') {
          console.log(`🔄 Updating provider from '${profile.provider}' to 'google'...`);
          
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
              provider: 'google',
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

          if (updateError) {
            console.error(`❌ Error updating profile for ${user.email}:`, updateError);
          } else {
            console.log(`✅ Updated profile for ${user.email} to provider: google`);
          }
        } else {
          console.log(`✅ Profile already has correct provider: google`);
        }
      }
    }

    // Also fix email users
    console.log('\n🔍 Checking for email users...');
    
    const emailUsers = users.users.filter(user => 
      (!user.identities || user.identities.length === 0) &&
      user.email
    );

    console.log(`📊 Found ${emailUsers.length} users with email authentication`);

    for (const user of emailUsers) {
      console.log(`\n🔍 Checking email user: ${user.email} (${user.id})`);
      
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('provider')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.log(`❌ No profile found for ${user.email}, creating one...`);
        
        // Create profile with email provider
        const { error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name,
            avatar_url: user.user_metadata?.avatar_url,
            provider: 'email',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (createError) {
          console.error(`❌ Error creating profile for ${user.email}:`, createError);
        } else {
          console.log(`✅ Created profile for ${user.email} with provider: email`);
        }
      } else {
        console.log(`📋 Profile found for ${user.email}, current provider: ${profile.provider}`);
        
        if (profile.provider !== 'email') {
          console.log(`🔄 Updating provider from '${profile.provider}' to 'email'...`);
          
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
              provider: 'email',
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);

          if (updateError) {
            console.error(`❌ Error updating profile for ${user.email}:`, updateError);
          } else {
            console.log(`✅ Updated profile for ${user.email} to provider: email`);
          }
        } else {
          console.log(`✅ Profile already has correct provider: email`);
        }
      }
    }

    // Show final summary
    console.log('\n📊 Final Summary:');
    const { data: summary, error: summaryError } = await supabase
      .from('user_profiles')
      .select('provider')
      .not('provider', 'is', null);

    if (!summaryError && summary) {
      const counts = summary.reduce((acc, profile) => {
        acc[profile.provider] = (acc[profile.provider] || 0) + 1;
        return acc;
      }, {});

      console.log('Provider distribution:');
      Object.entries(counts).forEach(([provider, count]) => {
        console.log(`  ${provider}: ${count} users`);
      });
    }

    console.log('\n✅ Fix completed!');

  } catch (error) {
    console.error('💥 Error fixing providers:', error);
  }
}

fixGoogleProviders(); 