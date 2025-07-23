import fetch from 'node-fetch';

async function testOneNoteDirect() {
  console.log('🔍 Direct OneNote API Test...\n');

  // Test the exact endpoints our application uses
  const endpoints = [
    {
      name: 'OneNote Notebooks (v1.0) - Standard',
      url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$expand=sections&$top=100'
    },
    {
      name: 'OneNote Notebooks (v1.0) - Alternative 1',
      url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$select=id,displayName,createdDateTime'
    },
    {
      name: 'OneNote Notebooks (v1.0) - Alternative 2',
      url: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks?$top=10'
    },
    {
      name: 'OneNote Notebooks (beta)',
      url: 'https://graph.microsoft.com/beta/me/onenote/notebooks?$expand=sections'
    },
    {
      name: 'OneNote Sections (v1.0)',
      url: 'https://graph.microsoft.com/v1.0/me/onenote/sections'
    },
    {
      name: 'OneNote Pages (v1.0)',
      url: 'https://graph.microsoft.com/v1.0/me/onenote/pages'
    },
    {
      name: 'OneDrive Root (Fallback)',
      url: 'https://graph.microsoft.com/v1.0/me/drive/root/children'
    },
    {
      name: 'OneDrive Search (Fallback)',
      url: 'https://graph.microsoft.com/v1.0/me/drive/root/search(q=\'.onetoc2\')'
    }
  ];

  // You'll need to provide a valid token here
  const token = process.env.TEST_TOKEN;
  
  if (!token) {
    console.log('❌ No test token provided. Set TEST_TOKEN environment variable.');
    console.log('\n📋 To get a test token:');
    console.log('1. Go to https://developer.microsoft.com/en-us/graph/graph-explorer');
    console.log('2. Sign in with your Microsoft account');
    console.log('3. Run: GET https://graph.microsoft.com/v1.0/me/onenote/notebooks');
    console.log('4. Copy the Authorization header value (starts with "Bearer ")');
    console.log('5. Set: export TEST_TOKEN="your_token_here"');
    console.log('\n🔍 Or test through the application UI after re-connecting the integration.');
    return;
  }

  console.log('🔑 Using provided token for testing...\n');

  for (const endpoint of endpoints) {
    console.log(`🔍 Testing ${endpoint.name}...`);
    
    try {
      const response = await fetch(endpoint.url, {
        headers: {
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`📊 Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        
        if (endpoint.name.includes('Notebooks')) {
          const count = data.value?.length || 0;
          console.log(`✅ Success! Found ${count} notebooks`);
          
          if (count > 0) {
            console.log('📋 Notebooks found:');
            data.value.forEach((notebook, index) => {
              console.log(`  ${index + 1}. ${notebook.displayName || notebook.name || 'Untitled'} (ID: ${notebook.id})`);
              if (notebook.sections) {
                console.log(`     Sections: ${notebook.sections.length}`);
              }
            });
          }
        } else if (endpoint.name.includes('Sections')) {
          const count = data.value?.length || 0;
          console.log(`✅ Success! Found ${count} sections`);
        } else if (endpoint.name.includes('Pages')) {
          const count = data.value?.length || 0;
          console.log(`✅ Success! Found ${count} pages`);
        } else if (endpoint.name.includes('OneDrive')) {
          const count = data.value?.length || 0;
          console.log(`✅ Success! Found ${count} OneDrive items`);
          
          // Look for OneNote files
          const oneNoteFiles = data.value?.filter(item => 
            item.name?.endsWith('.onetoc2') || 
            item.name?.endsWith('.one') ||
            item.name?.toLowerCase().includes('onenote')
          ) || [];
          
          if (oneNoteFiles.length > 0) {
            console.log(`📋 OneNote files in OneDrive: ${oneNoteFiles.length}`);
            oneNoteFiles.forEach((file, index) => {
              console.log(`  ${index + 1}. ${file.name} (ID: ${file.id})`);
            });
          }
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ Error: ${errorText.substring(0, 200)}...`);
      }
    } catch (error) {
      console.log(`❌ Request failed: ${error.message}`);
    }
    
    console.log('');
  }

  // Test notebook creation
  console.log('🔍 Testing notebook creation...');
  try {
    const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks', {
      method: 'POST',
      headers: {
        'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        displayName: `Test Notebook ${new Date().toISOString().slice(0, 19)}`
      })
    });

    console.log(`📊 Create Status: ${createResponse.status} ${createResponse.statusText}`);

    if (createResponse.ok) {
      const createData = await createResponse.json();
      console.log('✅ Successfully created test notebook!');
      console.log(`📋 New notebook: ${createData.displayName} (ID: ${createData.id})`);
      
      // Clean up
      console.log('🧹 Cleaning up test notebook...');
      const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/me/onenote/notebooks/${createData.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`
        }
      });
      
      if (deleteResponse.ok) {
        console.log('✅ Test notebook deleted successfully');
      } else {
        console.log('⚠️  Could not delete test notebook (this is normal for some accounts)');
      }
    } else {
      const errorText = await createResponse.text();
      console.log(`❌ Create error: ${errorText.substring(0, 200)}...`);
    }
  } catch (error) {
    console.log(`❌ Create request failed: ${error.message}`);
  }

  console.log('\n✅ Direct OneNote API test completed!');
  console.log('\n📋 Summary:');
  console.log('- This test shows which OneNote API endpoints are accessible');
  console.log('- The application will use the working endpoints automatically');
  console.log('- If OneNote API fails, the app will use OneDrive fallback');
  console.log('- Virtual notebooks will be provided if no real notebooks exist');
}

testOneNoteDirect(); 