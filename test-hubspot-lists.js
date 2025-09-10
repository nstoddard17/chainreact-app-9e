/**
 * Test script for HubSpot list loading
 * Run with: node test-hubspot-lists.js
 */

async function testHubSpotLists() {
  console.log('🧪 Testing HubSpot list loading...\n');
  
  // Test the API endpoint directly
  const testIntegrationId = 'YOUR_HUBSPOT_INTEGRATION_ID'; // Replace with actual ID
  
  try {
    console.log('📡 Making request to HubSpot data API...');
    const response = await fetch('http://localhost:3000/api/integrations/hubspot/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        integrationId: testIntegrationId,
        dataType: 'hubspot_lists',
        options: {}
      })
    });
    
    console.log(`📊 Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      return;
    }
    
    const result = await response.json();
    console.log('✅ Success! Response:', JSON.stringify(result, null, 2));
    
    if (result.data && Array.isArray(result.data)) {
      console.log(`\n📋 Found ${result.data.length} lists:`);
      result.data.forEach((list, index) => {
        console.log(`  ${index + 1}. ${list.name || 'Unnamed'} (ID: ${list.listId}, Type: ${list.listType}, Size: ${list.size || 0})`);
      });
      
      // Check for manual lists
      const manualLists = result.data.filter(list => 
        list.listType === 'MANUAL' || list.listType === 'STATIC'
      );
      console.log(`\n📌 Manual lists that can have contacts added: ${manualLists.length}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Instructions for running the test
console.log('====================================');
console.log('HubSpot List Loading Test');
console.log('====================================\n');
console.log('To run this test:');
console.log('1. Make sure your dev server is running (npm run dev)');
console.log('2. Find your HubSpot integration ID from the database or UI');
console.log('3. Replace YOUR_HUBSPOT_INTEGRATION_ID in this file with the actual ID');
console.log('4. Run: node test-hubspot-lists.js\n');
console.log('====================================\n');

// Uncomment to run the test
// testHubSpotLists();