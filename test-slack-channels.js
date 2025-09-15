// Test script to debug Slack channel loading
const fetch = require('node-fetch');

async function testSlackChannels() {
  console.log('🔍 Testing Slack channel loading...\n');
  
  try {
    // First, let's check if we can fetch integrations
    const integrationsRes = await fetch('http://localhost:3000/api/integrations', {
      method: 'GET',
      headers: {
        'Cookie': 'your-session-cookie-here', // You'll need to add the actual session cookie
      }
    });
    
    if (!integrationsRes.ok) {
      console.error('❌ Failed to fetch integrations:', integrationsRes.status);
      return;
    }
    
    const integrations = await integrationsRes.json();
    console.log('✅ Fetched integrations:', integrations.length, 'total');
    
    // Find Slack integration
    const slackIntegration = integrations.find(i => i.provider === 'slack');
    
    if (!slackIntegration) {
      console.error('❌ No Slack integration found');
      return;
    }
    
    console.log('✅ Found Slack integration:', {
      id: slackIntegration.id,
      status: slackIntegration.status,
      hasToken: !!slackIntegration.access_token
    });
    
    // Now try to load Slack channels
    console.log('\n📡 Attempting to load Slack channels...');
    
    const channelsRes = await fetch('http://localhost:3000/api/integrations/slack/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'your-session-cookie-here', // You'll need to add the actual session cookie
      },
      body: JSON.stringify({
        integrationId: slackIntegration.id,
        dataType: 'slack_channels',
        options: {}
      })
    });
    
    console.log('Response status:', channelsRes.status);
    
    const responseText = await channelsRes.text();
    console.log('Raw response:', responseText);
    
    try {
      const channelsData = JSON.parse(responseText);
      
      if (channelsRes.ok) {
        console.log('✅ Successfully loaded channels:', {
          success: channelsData.success,
          dataLength: channelsData.data?.length || 0,
          sampleChannels: channelsData.data?.slice(0, 3).map(c => c.name)
        });
      } else {
        console.error('❌ Error loading channels:', channelsData);
      }
    } catch (e) {
      console.error('❌ Failed to parse response:', e.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Check command line args for manual testing
if (process.argv[2] === 'manual') {
  console.log('Manual test mode - Please provide your session cookie');
  console.log('You can find it in browser DevTools > Application > Cookies');
  console.log('Update the Cookie header in the script and run again');
} else {
  console.log('Starting automated test...');
  console.log('Note: This requires a valid session cookie to work');
  console.log('Run with "node test-slack-channels.js manual" for instructions');
  testSlackChannels();
}