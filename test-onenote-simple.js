import fetch from 'node-fetch';

async function testOneNoteSimple() {
  console.log('🔍 Simple OneNote API Test...\n');

  // Test with a sample token (you'll need to replace this with a real token)
  const token = process.env.TEST_TOKEN;
  
  if (!token) {
    console.log('❌ No test token provided. Set TEST_TOKEN environment variable.');
    console.log('You can get a token by:');
    console.log('1. Going to https://developer.microsoft.com/en-us/graph/graph-explorer');
    console.log('2. Signing in with your Microsoft account');
    console.log('3. Running: GET https://graph.microsoft.com/v1.0/me/onenote/notebooks');
    console.log('4. Copying the Authorization header value');
    return;
  }

  const endpoints = [
    {
      name: 'User Profile',
      url: 'https://graph.microsoft.com/v1.0/me'
    },
    {
      name: 'OneNote Notebooks',
      url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks'
    },
    {
      name: 'OneNote Sections',
      url: 'https://graph.microsoft.com/v1.0/me/onenote/sections'
    },
    {
      name: 'OneNote Pages',
      url: 'https://graph.microsoft.com/v1.0/me/onenote/pages'
    },
    {
      name: 'OneDrive Root',
      url: 'https://graph.microsoft.com/v1.0/me/drive/root/children'
    }
  ];

  for (const endpoint of endpoints) {
    console.log(`🔍 Testing ${endpoint.name}...`);
    
    try {
      const response = await fetch(endpoint.url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`📊 Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        if (endpoint.name === 'User Profile') {
          console.log(`✅ Success! User: ${data.displayName} (${data.userPrincipalName})`);
        } else if (endpoint.name.includes('OneNote')) {
          const count = data.value?.length || 0;
          console.log(`✅ Success! Found ${count} items`);
          if (count > 0 && endpoint.name.includes('Notebooks')) {
            console.log('📋 Notebooks:');
            data.value.forEach((item, index) => {
              console.log(`  ${index + 1}. ${item.displayName || item.name || 'Untitled'} (ID: ${item.id})`);
            });
          }
        } else {
          const count = data.value?.length || 0;
          console.log(`✅ Success! Found ${count} items`);
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ Error: ${errorText.substring(0, 300)}...`);
      }
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`);
    }
    
    console.log('');
  }
}

testOneNoteSimple(); 