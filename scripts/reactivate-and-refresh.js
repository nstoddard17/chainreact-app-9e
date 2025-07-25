/**
 * Script to reactivate and refresh a specific integration
 * Usage: node scripts/reactivate-and-refresh.js <provider>
 * Example: node scripts/reactivate-and-refresh.js kit
 */
const fetch = require('node-fetch');
require('dotenv').config();

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Import the getBaseUrl function (we'll need to create a simple version for Node.js)
function getBaseUrl() {
  // Priority order: NEXT_PUBLIC_BASE_URL > NEXT_PUBLIC_APP_URL > fallback
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  return 'http://localhost:3000'
}

const BASE_URL = getBaseUrl()

async function reactivateIntegration(provider) {
  console.log(`🔄 Reactivating ${provider} integration...`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/admin/reactivate-integration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': ADMIN_API_KEY
      },
      body: JSON.stringify({
        provider,
        reset_failures: true
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Failed to reactivate: ${data.error || response.statusText}`);
    }
    
    console.log(`✅ Successfully reactivated ${data.count} integration(s)`);
    return data;
  } catch (error) {
    console.error(`❌ Error reactivating integration:`, error);
    throw error;
  }
}

async function refreshTokens(provider) {
  console.log(`🔄 Refreshing tokens for ${provider}...`);
  
  try {
    const url = new URL(`${BASE_URL}/api/cron/refresh-tokens-simple`);
    url.searchParams.append('secret', CRON_SECRET);
    url.searchParams.append('provider', provider);
    
    const response = await fetch(url.toString(), {
      method: 'GET'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Failed to refresh tokens: ${data.error || response.statusText}`);
    }
    
    console.log(`✅ Token refresh completed. Processed: ${data.stats?.processed || 0}, Successful: ${data.stats?.successful || 0}`);
    return data;
  } catch (error) {
    console.error(`❌ Error refreshing tokens:`, error);
    throw error;
  }
}

async function main() {
  try {
    // Get provider from command line args
    const provider = process.argv[2];
    
    if (!provider) {
      console.error('❌ Please specify a provider name');
      console.log('Usage: node scripts/reactivate-and-refresh.js <provider>');
      process.exit(1);
    }
    
    if (!ADMIN_API_KEY) {
      console.error('❌ ADMIN_API_KEY environment variable is not set');
      process.exit(1);
    }
    
    if (!CRON_SECRET) {
      console.error('❌ CRON_SECRET environment variable is not set');
      process.exit(1);
    }
    
    // Step 1: Reactivate the integration
    const reactivateResult = await reactivateIntegration(provider);
    console.log(`📊 Reactivated integrations:`, reactivateResult.integrations);
    
    // Step 2: Refresh the tokens
    const refreshResult = await refreshTokens(provider);
    
    console.log('✅ Process completed successfully');
  } catch (error) {
    console.error('💥 Process failed:', error);
    process.exit(1);
  }
}

main(); 