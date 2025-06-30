/**
 * Test script for the token refresh endpoint
 * 
 * This script calls the token refresh endpoint to test its functionality.
 * It can be used to manually trigger a token refresh for testing purposes.
 */

// Use proper import for node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SECRET = process.env.CRON_SECRET || 'test';

// Parse command line arguments
const args = process.argv.slice(2);
const provider = args.find(arg => !arg.startsWith('--')) || null;
const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '10';
const batchSize = args.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '5';
const offset = args.find(arg => arg.startsWith('--offset='))?.split('=')[1] || '0';
const verbose = args.includes('--verbose');

async function testTokenRefresh() {
  console.log('🚀 Testing token refresh endpoint...');
  
  // Build the URL with query parameters
  let url = `${BASE_URL}/api/cron/token-refresh?secret=${SECRET}&limit=${limit}&batchSize=${batchSize}&offset=${offset}`;
  if (verbose) {
    url += '&verbose=true';
  }
  if (provider) {
    url += `&provider=${provider}`;
    console.log(`🔍 Filtering by provider: ${provider}`);
  }
  
  console.log(`🔗 Calling: ${url}`);
  
  try {
    const response = await fetch(url);
    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Error:', result.error || response.statusText);
      return;
    }
    
    console.log('✅ Success!');
    console.log(`📊 Stats: ${result.stats.processed} processed, ${result.stats.successful} successful, ${result.stats.failed} failed`);
    console.log(`⏱️ Duration: ${result.duration_seconds}s`);
    
    if (verbose) {
      console.log('\n📝 Detailed Results:');
      console.log(JSON.stringify(result, null, 2));
    } else if (result.results && result.results.length > 0) {
      console.log('\n📝 Results:');
      result.results.forEach(item => {
        if (item.success) {
          console.log(`✅ ${item.provider} (${item.id.substring(0, 8)}...): Success`);
        } else {
          console.log(`❌ ${item.provider} (${item.id.substring(0, 8)}...): Failed - ${item.error}`);
        }
      });
    }
  } catch (error) {
    console.error('💥 Error calling token refresh endpoint:', error.message);
  }
}

// Run the script
testTokenRefresh().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
}); 