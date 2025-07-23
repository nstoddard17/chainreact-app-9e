import fetch from 'node-fetch';

async function testOneNoteEndpoint() {
  console.log('🔍 Testing OneNote API Endpoint...\n');

  // Test the exact endpoint our application uses
  const endpoint = 'http://localhost:3000/api/integrations/fetch-user-data';
  
  // We need a valid user token to test this properly
  // For now, let's test with a mock request to see the structure
  
  const testRequests = [
    {
      name: 'OneNote Notebooks Request',
      body: {
        integrationId: 'e4bb90b6-2201-4193-a1c2-21681f44e79d', // Use the integration ID from our test
        dataType: 'onenote_notebooks'
      }
    },
    {
      name: 'OneNote Sections Request',
      body: {
        integrationId: 'e4bb90b6-2201-4193-a1c2-21681f44e79d',
        dataType: 'onenote_sections',
        options: {
          notebookId: 'test-notebook-id'
        }
      }
    },
    {
      name: 'OneNote Pages Request',
      body: {
        integrationId: 'e4bb90b6-2201-4193-a1c2-21681f44e79d',
        dataType: 'onenote_pages',
        options: {
          sectionId: 'test-section-id'
        }
      }
    }
  ];

  console.log('📋 Testing API endpoint structure...\n');

  for (const testRequest of testRequests) {
    console.log(`🔍 Testing: ${testRequest.name}`);
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token' // This will fail auth, but we can see the structure
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

  console.log('📋 Manual Testing Instructions:');
  console.log('\n1. Open your browser and go to: http://localhost:3000');
  console.log('2. Sign in to your account');
  console.log('3. Go to Integrations page');
  console.log('4. Find Microsoft OneNote integration');
  console.log('5. Click "Disconnect" if connected');
  console.log('6. Click "Connect" to re-connect with new scopes');
  console.log('7. Go to Workflows page');
  console.log('8. Create a new workflow');
  console.log('9. Add a OneNote action (Create Page, Create Section, etc.)');
  console.log('10. Check if notebooks are listed in the dropdown');
  console.log('\n🔍 The integration should now:');
  console.log('- Find all existing notebooks');
  console.log('- Show newly created notebooks automatically');
  console.log('- Provide virtual notebooks if none exist');
  console.log('- Handle API limitations gracefully');

  console.log('\n✅ Endpoint test completed!');
}

testOneNoteEndpoint(); 