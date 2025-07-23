import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testOneNoteApp() {
  console.log('🔍 Testing OneNote through application API...\n');

  try {
    // Get the integration
    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'microsoft-onenote')
      .eq('status', 'connected')
      .limit(1);

    if (!integrations || integrations.length === 0) {
      console.log('❌ No connected OneNote integrations found');
      return;
    }

    const integration = integrations[0];
    console.log(`✅ Found integration: ${integration.id}`);

    // Get a user token for this integration
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('id', integration.user_id)
      .limit(1);

    if (!users || users.length === 0) {
      console.log('❌ User not found');
      return;
    }

    const user = users[0];
    console.log(`✅ Found user: ${user.id}`);

    // Create a user session token
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: 'test@example.com', // This won't work, but let's try a different approach
    });

    if (sessionError) {
      console.log('❌ Could not generate session:', sessionError.message);
      console.log('🔍 Trying direct API call...');
      
      // Let's test the API endpoint directly with the integration data
      const testRequests = [
        {
          name: 'OneNote Notebooks',
          body: {
            integrationId: integration.id,
            dataType: 'onenote_notebooks'
          }
        },
        {
          name: 'OneNote Sections',
          body: {
            integrationId: integration.id,
            dataType: 'onenote_sections'
          }
        },
        {
          name: 'OneNote Pages',
          body: {
            integrationId: integration.id,
            dataType: 'onenote_pages'
          }
        }
      ];

      console.log('\n📋 Testing application API endpoints...\n');

      for (const testRequest of testRequests) {
        console.log(`🔍 Testing: ${testRequest.name}`);
        
        try {
          const response = await fetch('http://localhost:3000/api/integrations/fetch-user-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer invalid-token-for-testing'
            },
            body: JSON.stringify(testRequest.body)
          });

          console.log(`📊 Status: ${response.status} ${response.statusText}`);

          if (response.ok) {
            const data = await response.json();
            console.log(`✅ Success! Response:`, JSON.stringify(data, null, 2));
          } else {
            const errorText = await response.text();
            console.log(`❌ Error: ${errorText}`);
          }
        } catch (error) {
          console.log(`❌ Request failed: ${error.message}`);
        }
        
        console.log('');
      }
    }

    console.log('\n📋 Manual Testing Instructions:');
    console.log('\n1. Open your browser and go to: http://localhost:3000');
    console.log('2. Sign in to your account');
    console.log('3. Go to Workflows page');
    console.log('4. Create a new workflow');
    console.log('5. Add a OneNote action (Create Page, Create Section, etc.)');
    console.log('6. Check the notebook dropdown - it should show:');
    console.log('   - All existing notebooks');
    console.log('   - Virtual notebook if none exist');
    console.log('   - New notebooks automatically');

    console.log('\n✅ Application API test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testOneNoteApp(); 